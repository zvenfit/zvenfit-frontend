const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const query = fs.readFileSync(path.join(root, 'analytics/cdn-traffic.yql'), 'utf8');
const lifecycle = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts/cdn-access-logs.lifecycle.json'), 'utf8'),
);
const workflow = fs.readFileSync(path.join(root, '.github/workflows/_deploy-environment.yml'), 'utf8');
const provisioning = fs.readFileSync(path.join(root, 'scripts/provision-cdn-raw-logs.sh'), 'utf8');
const packageConfig = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('YQL classifies every request into the four agreed traffic classes', () => {
  for (const trafficClass of ['browser_like', 'known_bot', 'synthetic', 'unknown']) {
    assert.match(query, new RegExp(`"${trafficClass}"`));
  }
  assert.match(query, /WHEN \$synthetic_agent\(user_agent\)/);
  assert.match(query, /WHEN \$known_bot_agent\(user_agent\)/);
  assert.match(query, /WHEN \$browser_agent\(user_agent\)/);
  assert.doesNotMatch(query, /remote_addr|session|hmac/i);
});

test('YQL exposes requests, page views and last-log timestamp without sessions', () => {
  assert.match(query, /DateTime::MakeDatetime\(\$datetime_parse/);
  assert.match(query, /1 AS requests/);
  assert.match(query, /IF\(is_page, 1, 0\) AS page_views/);
  assert.match(query, /2\[0-9\]\[0-9\]\|304/);
  assert.doesNotMatch(query, /technical_sessions|session_timeout/i);
  const datasetProjection = query.slice(query.lastIndexOf('SELECT'));
  assert.match(datasetProjection, /log_timestamp/);
  assert.doesNotMatch(datasetProjection, /remote_addr|user_agent|request_uri|status/);
});

test('raw-log infrastructure has one 30-day rule and no function deployment', () => {
  assert.deepEqual(lifecycle.lifecycleRules, [
    {
      id: 'delete-cdn-raw-logs-after-30-days',
      enabled: true,
      filter: { prefix: 'raw/zvenfit/' },
      expiration: { days: '30' },
      abortIncompleteMultipartUpload: { daysAfterExpiration: '1' },
    },
  ]);
  assert.match(provisioning, /rawLogs:activate/);
  assert.match(provisioning, /anonymous_access_flags/);
  assert.match(provisioning, /must remain private/);
  assert.match(provisioning, /timed out waiting for active raw log export/);
  assert.doesNotMatch(provisioning, /lockbox|serverless function|trigger|service-account/i);
  assert.doesNotMatch(workflow, /deploy-cdn-analytics|functions\/cdn-analytics/);
  assert.equal(fs.existsSync(path.join(root, 'functions/cdn-analytics/package.json')), false);
  assert.equal(packageConfig.scripts['deploy:cdn-analytics'], undefined);
  assert.equal(packageConfig.scripts['provision:cdn-analytics'], undefined);
});
