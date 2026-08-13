'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const deployScript = fs.readFileSync(path.join(ROOT, 'scripts/deploy-lead-intake.sh'), 'utf8');
const scheduleDeployScript = fs.readFileSync(path.join(ROOT, 'scripts/deploy-fitbase-schedule.sh'), 'utf8');
const productionWorkflow = fs.readFileSync(path.join(ROOT, '.github/workflows/main.yml'), 'utf8');
const stagingWorkflow = fs.readFileSync(path.join(ROOT, '.github/workflows/staging.yml'), 'utf8');
const reusableWorkflow = fs.readFileSync(path.join(ROOT, '.github/workflows/_deploy-environment.yml'), 'utf8');

test('production wrapper keeps every existing production resource name', () => {
  assert.match(productionWorkflow, /deployment_environment: production/);
  assert.match(productionWorkflow, /site_url: https:\/\/zvenfit\.ru/);
  assert.match(productionWorkflow, /s3_bucket: zvenfit-frontend(?:\n|$)/);
  assert.match(productionWorkflow, /lead_function_name: zvenfit-telegram-lead(?:\n|$)/);
  assert.match(productionWorkflow, /schedule_function_name: zvenfit-fitbase-schedule(?:\n|$)/);
  assert.match(productionWorkflow, /lead_retry_trigger_name: zvenfit-lead-telegram-retry(?:\n|$)/);
  assert.match(productionWorkflow, /ydb_database_name: zvenfit-leads(?:\n|$)/);
});

test('staging wrapper is manual-only and uses isolated resource names', () => {
  assert.match(stagingWorkflow, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(stagingWorkflow, /pull_request|push:/);
  assert.match(stagingWorkflow, /deployment_environment: staging/);
  assert.match(stagingWorkflow, /site_url: https:\/\/staging\.zvenfit\.ru/);

  for (const input of [
    's3_bucket: zvenfit-frontend-staging',
    'lead_function_name: zvenfit-telegram-lead-staging',
    'schedule_function_name: zvenfit-fitbase-schedule-staging',
    'lead_retry_trigger_name: zvenfit-lead-telegram-retry-staging',
    'ydb_database_name: zvenfit-leads-staging',
  ]) {
    assert.match(stagingWorkflow, new RegExp(`${input}(?:\\n|$)`));
  }

  assert.match(stagingWorkflow, /allowed_origins: https:\/\/staging\.zvenfit\.ru/);
});

test('production and staging call the same reusable workflow with environment secrets', () => {
  for (const workflow of [productionWorkflow, stagingWorkflow]) {
    assert.match(workflow, /uses: \.\/\.github\/workflows\/_deploy-environment\.yml/);
    assert.match(workflow, /secrets: inherit/);
  }
});

test('reusable workflow validates config before cloud deploy jobs', () => {
  const validationJob = reusableWorkflow.indexOf('  validate-config:');
  const qualityJob = reusableWorkflow.indexOf('  quality-checks:');
  const leadDeployJob = reusableWorkflow.indexOf('  deploy-function:');
  const scheduleDeployJob = reusableWorkflow.indexOf('  deploy-schedule-function:');
  const siteDeployJob = reusableWorkflow.indexOf('  deploy-site:');

  assert.equal(validationJob >= 0, true);
  assert.equal(qualityJob > validationJob, true);
  assert.equal(leadDeployJob > qualityJob, true);
  assert.equal(scheduleDeployJob > leadDeployJob, true);
  assert.equal(siteDeployJob > scheduleDeployJob, true);
  assert.match(reusableWorkflow.slice(leadDeployJob, scheduleDeployJob), /needs: \[validate-config, quality-checks\]/);
  assert.match(reusableWorkflow.slice(scheduleDeployJob, siteDeployJob), /needs: \[validate-config, quality-checks\]/);
  assert.match(
    reusableWorkflow.slice(siteDeployJob),
    /needs: \[validate-config, deploy-function, deploy-schedule-function\]/,
  );
});

test('every deploy job is protected by the selected GitHub Environment', () => {
  const leadDeployJob = reusableWorkflow.indexOf('  deploy-function:');
  const scheduleDeployJob = reusableWorkflow.indexOf('  deploy-schedule-function:');
  const siteDeployJob = reusableWorkflow.indexOf('  deploy-site:');
  const environmentGuard = /environment: \$\{\{ inputs\.deployment_environment \}\}/;

  assert.match(reusableWorkflow.slice(leadDeployJob, scheduleDeployJob), environmentGuard);
  assert.match(reusableWorkflow.slice(scheduleDeployJob, siteDeployJob), environmentGuard);
  assert.match(reusableWorkflow.slice(siteDeployJob), environmentGuard);
});

test('reusable workflow passes resource identities explicitly instead of using production defaults', () => {
  assert.match(reusableWorkflow, /YC_LEAD_FUNCTION_NAME: \$\{\{ inputs\.lead_function_name \}\}/);
  assert.match(reusableWorkflow, /YC_LEAD_RETRY_TRIGGER_NAME: \$\{\{ inputs\.lead_retry_trigger_name \}\}/);
  assert.match(reusableWorkflow, /YC_SCHEDULE_FUNCTION_NAME: \$\{\{ inputs\.schedule_function_name \}\}/);
  assert.match(reusableWorkflow, /YDB_DATABASE_NAME: \$\{\{ inputs\.ydb_database_name \}\}/);
  assert.match(reusableWorkflow, /s3:\/\/\$\{\{ inputs\.s3_bucket \}\}/);
  assert.doesNotMatch(reusableWorkflow, /zvenfit-telegram-lead(?:\n|'|")/);
  assert.doesNotMatch(reusableWorkflow, /zvenfit-fitbase-schedule(?:\n|'|")/);
});

test('lead deploy verifies YDB, migrates schema, and only then creates a function version', () => {
  const integration = deployScript.indexOf('run test:integration');
  const migration = deployScript.indexOf('run migrate');
  const deploy = deployScript.indexOf('yc serverless function version create');

  assert.equal(integration >= 0, true);
  assert.equal(migration > integration, true);
  assert.equal(deploy > migration, true);
});

test('direct Monium metrics require and deploy the environment-scoped API key secret', () => {
  assert.match(reusableWorkflow, /MONIUM_API_KEY: \$\{\{ secrets\.MONIUM_API_KEY \}\}/);
  assert.match(deployScript, /set MONIUM_API_KEY when direct metrics are enabled/);
  assert.match(deployScript, /--environment MONIUM_API_KEY="\$\{MONIUM_API_KEY\}"/);
});

test('lead deployment package contains every runtime YDB module', () => {
  assert.match(deployScript, /lead-intake\/build\/\./);
  assert.match(deployScript, /cp -R/);
});

test('existing retry trigger is updated by resolved id', () => {
  assert.match(deployScript, /TRIGGER_ID=.*serverless trigger get/);
  assert.match(deployScript, /serverless trigger update timer[\s\\]+--id="\$\{TRIGGER_ID\}"/);
  assert.doesNotMatch(deployScript, /serverless trigger update timer[\s\\]+--name=/);
});

test('regular deploy verifies public access without mutating function IAM', () => {
  for (const script of [deployScript, scheduleDeployScript]) {
    assert.match(script, /serverless function list-access-bindings/);
    assert.match(script, /missing the one-time public functionInvoker binding/);
    assert.doesNotMatch(script, /^yc serverless function allow-unauthenticated-invoke/m);
  }
});

test('regular deploy requires a pre-provisioned database', () => {
  assert.match(deployScript, /must be provisioned before CI deploy/);
  assert.doesNotMatch(deployScript, /^\s*yc ydb database create/m);
});
