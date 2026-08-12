'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const deployScript = fs.readFileSync(path.join(ROOT, 'scripts/deploy-lead-intake.sh'), 'utf8');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/main.yml'), 'utf8');

test('lead deploy keeps the existing production Cloud Function resource', () => {
  assert.match(deployScript, /YC_LEAD_FUNCTION_NAME:-zvenfit-telegram-lead/);
  assert.match(workflow, /FUNCTION_NAME: 'zvenfit-telegram-lead'/);
});

test('production deploy jobs wait for quality checks', () => {
  const qualityJob = workflow.indexOf('  quality-checks:');
  const leadDeployJob = workflow.indexOf('  deploy-function:');
  const scheduleDeployJob = workflow.indexOf('  deploy-schedule-function:');
  const siteDeployJob = workflow.indexOf('  deploy-site:');

  assert.equal(qualityJob >= 0, true);
  assert.equal(leadDeployJob > qualityJob, true);
  assert.equal(scheduleDeployJob > leadDeployJob, true);
  assert.match(workflow.slice(leadDeployJob, scheduleDeployJob), /needs: quality-checks/);
  assert.match(workflow.slice(scheduleDeployJob, siteDeployJob), /needs: quality-checks/);
});

test('lead deploy verifies YDB, migrates schema, and only then creates a function version', () => {
  const integration = deployScript.indexOf('run test:integration');
  const migration = deployScript.indexOf('run migrate');
  const deploy = deployScript.indexOf('yc serverless function version create');

  assert.equal(integration >= 0, true);
  assert.equal(migration > integration, true);
  assert.equal(deploy > migration, true);
});

test('direct Monium metrics require and deploy the scoped API key secret', () => {
  assert.match(workflow, /MONIUM_API_KEY: \$\{\{ secrets\.MONIUM_API_KEY \}\}/);
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
