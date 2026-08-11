'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/monitoring.config.json'), 'utf8'));
const source = [
  'functions/lead-intake/src/handler.ts',
  'functions/lead-intake/src/telegram/delivery.ts',
  'functions/lead-intake/src/observability/ydb.ts',
  'functions/fitbase-schedule/src/handler.ts',
  'functions/fitbase-schedule/src/observability/logger.ts',
]
  .map(file => fs.readFileSync(path.join(ROOT, file), 'utf8'))
  .join('\n');
const monitoringDocs = fs.readFileSync(path.join(ROOT, 'docs/monitoring.md'), 'utf8');
const smokeScript = fs.readFileSync(path.join(ROOT, 'scripts/test-monitoring-alerts.sh'), 'utf8');

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
    const hasMetricQueries = Array.isArray(alert.queries) && alert.queries.length > 0;

    assert.equal(Boolean(hasLogMetric || hasPlatformMetric || hasMetricQueries), true, `${alert.id} references an unknown metric`);
    assert.equal(alertIds.has(alert.id), false, `${alert.id} is duplicated`);
    assert.match(monitoringDocs, new RegExp(`\\b${alert.id}\\b`), `${alert.id} is missing from docs`);
    assert.equal(alert.noData, alert.id === 'zvenfit_ydb_storage_usage' ? 'WARNING' : 'OK');
    assert.equal(typeof alert.warning, 'number', `${alert.id} has no Warning threshold`);
    assert.equal(typeof alert.alarm, 'number', `${alert.id} has no Alarm threshold`);
    assert.equal(alert.alarm > alert.warning, true, `${alert.id} requires Alarm > Warning`);
    assert.equal(typeof alert.delay, 'string', `${alert.id} has no evaluation delay`);
    alertIds.add(alert.id);
  }

  assert.equal(alertIds.size, 9);
});

test('anti-spam and accepted lead volume thresholds are explicit', () => {
  const rateMetric = config.logMetrics.find(metric => metric.id === 'zvenfit_lead_rate_limited_5m');
  const rateAlert = config.alerts.find(alert => alert.id === 'zvenfit_rate-limited_leads');
  const volumeAlert = config.alerts.find(alert => alert.id === 'zvenfit_persisted_leads_volume');

  assert.deepEqual(rateMetric.filters, { reason: 'rate_limit' });
  assert.deepEqual(
    { warning: rateAlert.warning, alarm: rateAlert.alarm, window: rateAlert.window },
    { warning: 0, alarm: 5, window: '10m' },
  );
  assert.deepEqual(
    { warning: volumeAlert.warning, alarm: volumeAlert.alarm, window: volumeAlert.window },
    { warning: 10, alarm: 20, window: '10m' },
  );
});

test('log-derived alerts account for aggregate delivery lag', () => {
  const metricIds = new Set(config.logMetrics.map(metric => metric.id));
  const logAlerts = config.alerts.filter(alert => metricIds.has(alert.metricId));

  assert.equal(logAlerts.length, 7);
  for (const alert of logAlerts) {
    assert.equal(alert.delay, '3m', `${alert.id} must wait for log aggregate delivery`);
  }
});

test('YDB retry thresholds expose reachable Warning and Alarm states', () => {
  const alert = config.alerts.find(item => item.id === 'zvenfit_ydb_retries');

  assert.deepEqual(
    { warning: alert.warning, alarm: alert.alarm, operator: alert.operator },
    { warning: 4.5, alarm: 5.5, operator: '>' },
  );
});

test('YDB storage alert uses live database metrics and 70/85 percent thresholds', () => {
  const alert = config.alerts.find(item => item.id === 'zvenfit_ydb_storage_usage');
  const queryText = alert.queries.map(query => query.query).join('\n');

  assert.match(queryText, /project="folder__b1ge1e4iopttj79hfdfm"/);
  assert.match(queryText, /name="resources\.storage\.used_bytes"/);
  assert.match(queryText, /name="resources\.storage\.limit_bytes"/);
  assert.match(queryText, /service="ydb"/);
  assert.match(queryText, /database\.serverless="zvenfit-leads"/);
  assert.equal(alert.signal, 'C');
  assert.equal(alert.warning, 70);
  assert.equal(alert.alarm, 85);
  assert.equal(alert.noData, 'WARNING');
});

test('runtime alert covers both production functions', () => {
  const runtimeAlert = config.alerts.find(alert => alert.id === 'zvenfit_function_runtime_errors');

  assert.match(runtimeAlert.metricSelector, /name="functions_errors"/);
  assert.match(runtimeAlert.metricSelector, /resource_id="zvenfit-telegram-lead\|zvenfit-fitbase-schedule"/);
  assert.doesNotMatch(runtimeAlert.metricSelector, /resource_id="d4e/);
  assert.doesNotMatch(monitoringDocs, /кнопк[^\n]*тестирован[^\n]*канал/i);
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
    application: 'zvenfit-frontend',
    environment: 'production',
    retentionDays: 3,
  });
  assert.deepEqual(config.metricOutput, {
    cluster: 'default',
    service: 'logging_aggregates',
    idLabel: 'name',
  });
});

test('every log selector is isolated by repository and environment', () => {
  assert.equal((monitoringDocs.match(/application="zvenfit-frontend"/g) || []).length >= 8, true);
  assert.equal((monitoringDocs.match(/environment="production"/g) || []).length >= 8, true);
  assert.match(smokeScript, /APPLICATION_NAME="zvenfit-frontend"/);
  assert.match(smokeScript, /MONITORING_ENVIRONMENT="\$\{NODE_ENV:-production\}"/);
  assert.match(monitoringDocs, /service="logging_aggregates"/);
});

test('manual provisioning and notification channel requirements are explicit', () => {
  assert.deepEqual(config.provisioning, {
    logMetrics: 'manual-console',
    notificationChannels: 'manual-console',
    alerts: 'manual-console',
    reason: 'Yandex Monitoring does not expose these resources in the public YC CLI or Terraform provider',
  });
  assert.deepEqual(config.notificationChannels, [
    {
      id: 'zvenfit_telegram_alerts',
      name: 'ZvenFit Telegram alerts',
      method: 'telegram',
      recipient: 'cloud-account',
      sendScreenshot: true,
    },
    {
      id: 'zvenfit_email_alerts',
      name: 'ZvenFit Email alerts',
      method: 'email',
      recipient: 'cloud-account',
    },
  ]);
  assert.deepEqual(config.notificationPolicy, {
    statuses: ['ALARM', 'WARNING', 'OK'],
    repeatMinutes: 30,
  });
});

test('monitoring smoke script requires confirmation and covers every log metric', () => {
  assert.match(smokeScript, /\$\{1:-\}.*--confirm/);

  for (const metric of config.logMetrics) {
    assert.equal(
      metric.events.some(event => new RegExp(`\\b${event}\\b`).test(smokeScript)),
      true,
      `${metric.id} is missing from smoke test`,
    );
  }

  assert.match(smokeScript, /reason\\?":\\?"rate_limit/);
  assert.match(smokeScript, /Expect seven log-based alerts/);
});
