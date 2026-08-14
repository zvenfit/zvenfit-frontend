'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const SCRIPT = path.resolve(__dirname, '../deploy-fitbase-schedule.sh');
const SAFE_PATH = process.env.PATH || '/usr/bin:/bin';

function runDeploy(environment) {
  return spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { PATH: SAFE_PATH, ...environment },
  });
}

test('rejects an unsupported deployment environment before any cloud command', () => {
  const result = runDeploy({ DEPLOYMENT_ENVIRONMENT: 'preview' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DEPLOYMENT_ENVIRONMENT must be production or staging/);
});

test('requires a Fitbase token only for the production artifact', () => {
  const production = runDeploy({ DEPLOYMENT_ENVIRONMENT: 'production', FUNCTION_INVOKER_MODE: 'public' });
  assert.equal(production.status, 1);
  assert.match(production.stderr, /set FITBASE_API_TOKEN for production/);

  const staging = runDeploy({
    DEPLOYMENT_ENVIRONMENT: 'staging',
    FUNCTION_INVOKER_MODE: 'gateway',
    YC_GATEWAY_SERVICE_ACCOUNT_ID: 'gateway-service-account',
  });
  assert.equal(staging.status, 1);
  assert.doesNotMatch(staging.stderr, /FITBASE_API_TOKEN/);
});

test('rejects environment and access-mode combinations that could select the wrong artifact', () => {
  const publicStaging = runDeploy({ DEPLOYMENT_ENVIRONMENT: 'staging', FUNCTION_INVOKER_MODE: 'public' });
  const privateProduction = runDeploy({ DEPLOYMENT_ENVIRONMENT: 'production', FUNCTION_INVOKER_MODE: 'gateway' });

  assert.match(publicStaging.stderr, /staging must deploy the private staging artifact/);
  assert.match(privateProduction.stderr, /production must deploy the public production artifact/);
});
