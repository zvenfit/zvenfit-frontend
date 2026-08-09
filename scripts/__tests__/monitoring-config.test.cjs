'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/monitoring.config.json'), 'utf8'));
const source = [
  'functions/telegram-lead/handler.ts',
  'functions/telegram-lead/ydb-observability.ts',
  'functions/fitbase-schedule/handler.ts',
  'functions/fitbase-schedule/logger.ts',
]
  .map(file => fs.readFileSync(path.join(ROOT, file), 'utf8'))
  .join('\n');
const monitoringDocs = fs.readFileSync(path.join(ROOT, 'docs/monitoring.md'), 'utf8');

test('every monitored event exists in application code and documentation', () => {
  for (const metric of config.logMetrics) {
    for (const event of metric.events) {
      assert.match(source, new RegExp(`['\"]${event}['\"]`), `${event} is missing from code`);
      assert.match(monitoringDocs, new RegExp(`\\b${event}\\b`), `${event} is missing from docs`);
    }
  }
});

test('every alert references a metric and is documented', () => {
  const metricIds = new Set(config.logMetrics.map(metric => metric.id));
  const alertIds = new Set();

  for (const alert of config.alerts) {
    const hasLogMetric = alert.metricId && metricIds.has(alert.metricId);
    const hasPlatformMetric = typeof alert.metricSelector === 'string';

    assert.equal(Boolean(hasLogMetric || hasPlatformMetric), true, `${alert.id} references an unknown metric`);
    assert.equal(alertIds.has(alert.id), false, `${alert.id} is duplicated`);
    assert.match(monitoringDocs, new RegExp(`\\b${alert.id}\\b`), `${alert.id} is missing from docs`);
    assert.equal(alert.noData, 'OK');
    alertIds.add(alert.id);
  }

  assert.equal(alertIds.size, 6);
});

test('runtime alert covers both production functions', () => {
  const runtimeAlert = config.alerts.find(alert => alert.id === 'zvenfit-function-runtime-errors');

  assert.match(runtimeAlert.metricSelector, /name="functions_errors"/);
  assert.match(runtimeAlert.metricSelector, /d4ea7c6tcac97hu62rab/);
  assert.match(runtimeAlert.metricSelector, /d4e80noc1hjn2g8u0beq/);
});

test('transient Telegram retries remain log-only', () => {
  const monitoredEvents = config.logMetrics.flatMap(metric => metric.events);

  assert.equal(monitoredEvents.includes('telegram_delivery_retry_scheduled'), false);
  assert.match(monitoringDocs, /`telegram_delivery_retry_scheduled`\s+\| Telegram временно недоступен/);
});

test('production log source and retention are explicit', () => {
  assert.equal(config.project, 'folder__b1ge1e4iopttj79hfdfm');
  assert.deepEqual(config.source, {
    cluster: 'default',
    service: 'default',
    retentionDays: 3,
  });
});
