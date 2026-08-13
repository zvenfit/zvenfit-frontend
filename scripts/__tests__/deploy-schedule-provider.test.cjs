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

test('rejects fixture before any cloud command when either environment is production', () => {
  for (const environment of [
    { NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'production', SCHEDULE_PROVIDER: 'fixture' },
    { NODE_ENV: 'staging', DEPLOYMENT_ENVIRONMENT: 'production', SCHEDULE_PROVIDER: 'fixture' },
  ]) {
    const result = runDeploy(environment);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /fixture provider is forbidden in production/);
    assert.doesNotMatch(result.stderr, /FITBASE_API_TOKEN/);
  }
});

test('requires a token only when the explicit provider is Fitbase', () => {
  const fitbase = runDeploy({
    NODE_ENV: 'staging',
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SCHEDULE_PROVIDER: 'fitbase',
  });
  assert.equal(fitbase.status, 1);
  assert.match(fitbase.stderr, /set FITBASE_API_TOKEN for the fitbase provider/);

  const fixture = runDeploy({
    NODE_ENV: 'staging',
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SCHEDULE_PROVIDER: 'fixture',
  });
  assert.equal(fixture.status, 1);
  assert.doesNotMatch(fixture.stderr, /FITBASE_API_TOKEN/);
});

test('rejects unknown providers without a fallback', () => {
  const result = runDeploy({
    NODE_ENV: 'staging',
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SCHEDULE_PROVIDER: 'auto',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /SCHEDULE_PROVIDER must be fitbase or fixture/);
});
