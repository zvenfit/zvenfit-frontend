'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const config = require('../monitoring.config.json');
const { diffMonitoringState, normalizeMonitoringState } = require('../check-monitoring-drift.cjs');

function liveSnapshot() {
  const snapshot = JSON.parse(JSON.stringify(config));
  for (const alert of snapshot.alerts) {
    alert.notificationChannelIds ??= [...snapshot.notificationPolicy.channelIds];
    alert.notificationStatuses ??= [...snapshot.notificationPolicy.statuses];
    if (!Object.prototype.hasOwnProperty.call(alert, 'repeatMinutes')) {
      alert.repeatMinutes = snapshot.notificationPolicy.repeatMinutes;
    }
  }

  return snapshot;
}

const ROOT = path.resolve(__dirname, '../..');

test('normalizes the desired monitoring resources into a stable read-only contract', () => {
  const normalized = normalizeMonitoringState(config);

  assert.equal(normalized.logMetrics.length, 14);
  assert.equal(normalized.alerts.length, 17);
  assert.equal(normalized.notificationChannels.length, 2);
  assert.equal(normalized.dashboard.runtimeErrors.title, 'Cloud Functions: ошибки');
  assert.deepEqual(diffMonitoringState(config, liveSnapshot()), []);
});

test('reports a live alert whose notification channels are omitted', () => {
  const snapshot = liveSnapshot();
  const alert = snapshot.alerts.find(item => item.id === 'zvenfit_schedule_runtime_errors');
  delete alert.notificationChannelIds;

  assert.match(
    diffMonitoringState(config, snapshot).join('\n'),
    /alerts\.zvenfit_schedule_runtime_errors\.notificationChannelIds/,
  );
});

test('preserves per-alert notification delivery overrides', () => {
  const snapshot = liveSnapshot();
  const alert = snapshot.alerts.find(item => item.id === 'zvenfit_monium_metrics_failures');

  assert.deepEqual(alert.notificationChannelIds, ['zvenfit_email_alerts']);
  assert.deepEqual(alert.notificationStatuses, ['ALARM', 'WARNING', 'OK']);
  assert.equal(alert.repeatMinutes, 0);
  assert.deepEqual(diffMonitoringState(config, snapshot), []);

  alert.repeatMinutes = 30;
  assert.match(
    diffMonitoringState(config, snapshot).join('\n'),
    /alerts\.zvenfit_monium_metrics_failures\.repeatMinutes/,
  );
});

test('reports taxonomy, channel and dashboard drift in addition to metric thresholds', () => {
  const snapshot = liveSnapshot();
  snapshot.logMetrics.find(item => item.id === 'zvenfit_lead_storage_errors_1m').displayName =
    'ZvenFit lead storage errors';
  snapshot.logMetrics.find(item => item.id === 'zvenfit_lead_storage_errors_1m').selector = '{message=*"legacy"}';
  snapshot.logMetrics.find(item => item.id === 'zvenfit_lead_storage_errors_1m').groupBy = ['resource_id'];
  snapshot.alerts.find(item => item.id === 'zvenfit_lead_storage_errors').displayName = 'ZvenFit lead storage errors';
  snapshot.alerts.find(item => item.id === 'zvenfit_lead_storage_errors').delay = '4m';
  snapshot.alerts.find(item => item.id === 'zvenfit_lead_storage_errors').labels.service = 'wrong-service';
  snapshot.alerts.find(item => item.id === 'zvenfit_function_throttles').decomposeBy = [];
  snapshot.alerts.find(item => item.id === 'zvenfit_function_throttles').notificationChannelIds = [
    'zvenfit_email_alerts',
  ];
  snapshot.notificationChannels.find(item => item.id === 'zvenfit_telegram_alerts').name = 'Legacy Telegram name';
  snapshot.notificationPolicy.repeatMinutes = 15;
  snapshot.dashboard.runtimeErrors.metricSelector = '{name="legacy_runtime_errors"}';
  snapshot.alerts = snapshot.alerts.filter(item => item.id !== 'zvenfit_permanent_telegram_failures');
  snapshot.alerts.push({ id: 'zvenfit_legacy_alert' });

  const differences = diffMonitoringState(config, snapshot);
  const output = differences.join('\n');

  assert.match(output, /logMetrics\.zvenfit_lead_storage_errors_1m\.displayName/);
  assert.match(output, /logMetrics\.zvenfit_lead_storage_errors_1m\.selector/);
  assert.match(output, /logMetrics\.zvenfit_lead_storage_errors_1m\.groupBy/);
  assert.match(output, /alerts\.zvenfit_lead_storage_errors\.displayName/);
  assert.match(output, /alerts\.zvenfit_lead_storage_errors\.delay/);
  assert.match(output, /alerts\.zvenfit_lead_storage_errors\.labels/);
  assert.match(output, /alerts\.zvenfit_function_throttles\.decomposeBy/);
  assert.match(output, /alerts\.zvenfit_function_throttles\.notificationChannelIds/);
  assert.match(output, /notificationChannels\.zvenfit_telegram_alerts\.name/);
  assert.match(output, /notificationPolicy/);
  assert.match(output, /dashboard/);
  assert.match(output, /alerts\.zvenfit_permanent_telegram_failures: missing/);
  assert.match(output, /alerts\.zvenfit_legacy_alert: unexpected/);
});

test('ignores ordering-only differences in label and channel collections', () => {
  const snapshot = liveSnapshot();
  snapshot.logMetrics.find(item => item.id === 'zvenfit_site_page_views_by_class_5m').grouping.reverse();
  snapshot.notificationPolicy.channelIds.reverse();
  snapshot.alerts.find(item => item.id === 'zvenfit_function_throttles').decomposeBy.reverse();
  snapshot.dashboard.trafficWidgets.reverse();

  assert.deepEqual(diffMonitoringState(config, snapshot), []);
});

test('CLI reads a canonical snapshot without modifying it', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'zvenfit-monitoring-drift-'));
  const snapshotPath = path.join(temporaryDirectory, 'monium-live.json');

  try {
    fs.writeFileSync(snapshotPath, JSON.stringify(liveSnapshot()), 'utf8');
    const before = fs.readFileSync(snapshotPath, 'utf8');
    const result = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts/check-monitoring-drift.cjs'), '--snapshot', snapshotPath],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /live snapshot matches/);
    assert.equal(fs.readFileSync(snapshotPath, 'utf8'), before);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
