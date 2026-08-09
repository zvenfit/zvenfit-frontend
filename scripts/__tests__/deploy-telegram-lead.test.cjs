'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const deployScript = fs.readFileSync(path.join(ROOT, 'scripts/deploy-telegram-lead.sh'), 'utf8');

test('lead deploy verifies YDB, migrates schema, and only then creates a function version', () => {
  const integration = deployScript.indexOf('run test:integration');
  const migration = deployScript.indexOf('run migrate');
  const deploy = deployScript.indexOf('yc serverless function version create');

  assert.equal(integration >= 0, true);
  assert.equal(migration > integration, true);
  assert.equal(deploy > migration, true);
});

test('lead deployment package contains every runtime YDB module', () => {
  for (const file of ['ydb-client.js', 'ydb-config.js', 'ydb-observability.js']) {
    assert.match(deployScript, new RegExp(`telegram-lead/build/${file.replace('.', '\\.')}`));
  }
});
