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

    assert.equal(
      Boolean(hasLogMetric || hasPlatformMetric || hasMetricQueries),
      true,
      `${alert.id} references an unknown metric`,
    );
    assert.equal(alertIds.has(alert.id), false, `${alert.id} is duplicated`);
    assert.match(monitoringDocs, new RegExp(`\\b${alert.id}\\b`), `${alert.id} is missing from docs`);
    const expectedNoData =
      alert.id === 'zvenfit_ydb_storage_usage'
        ? 'WARNING'
        : alert.id === 'zvenfit_retry_worker_heartbeat'
          ? 'ALARM'
          : 'OK';
    assert.equal(alert.noData, expectedNoData);
    assert.equal(typeof alert.warning, 'number', `${alert.id} has no Warning threshold`);
    assert.equal(typeof alert.alarm, 'number', `${alert.id} has no Alarm threshold`);
    assert.equal(alert.alarm > alert.warning, true, `${alert.id} requires Alarm > Warning`);
    assert.equal(typeof alert.delay, 'string', `${alert.id} has no evaluation delay`);
    alertIds.add(alert.id);
  }

  assert.equal(alertIds.size, 13);
});

test('anti-spam and accepted lead volume thresholds are explicit', () => {
  const rateMetric = config.logMetrics.find(metric => metric.id === 'zvenfit_lead_rate_limited_5m');
  const rateAlert = config.alerts.find(alert => alert.id === 'zvenfit_rate-limited_leads');
  const volumeAlert = config.alerts.find(alert => alert.id === 'zvenfit_persisted_leads_volume');

  assert.deepEqual(rateMetric.filters, { 'meta.reason': 'rate_limit' });
  assert.deepEqual(
    { warning: rateAlert.warning, alarm: rateAlert.alarm, window: rateAlert.window },
    { warning: 0, alarm: 5, window: '10m' },
  );
  assert.deepEqual(
    { warning: volumeAlert.warning, alarm: volumeAlert.alarm, window: volumeAlert.window },
    { warning: 10, alarm: 20, window: '10m' },
  );
});

test('only the caught Fitbase application error depends on the log aggregate pipeline', () => {
  const metricIds = new Set(config.logMetrics.map(metric => metric.id));
  const logAlerts = config.alerts.filter(alert => metricIds.has(alert.metricId));

  assert.deepEqual(logAlerts.map(alert => alert.id), ['zvenfit_fitbase_errors']);
});

test('YDB retry thresholds expose reachable Warning and Alarm states', () => {
  const alert = config.alerts.find(item => item.id === 'zvenfit_ydb_retries');

  assert.deepEqual(
    { warning: alert.warning, alarm: alert.alarm, operator: alert.operator },
    { warning: 4.5, alarm: 5.5, operator: '>' },
  );
});

test('slow YDB alert warns on one event and alarms on three events in ten minutes', () => {
  const alert = config.alerts.find(item => item.id === 'zvenfit_slow_ydb_operations');

  assert.deepEqual(
    {
      warning: alert.warning,
      alarm: alert.alarm,
      aggregation: alert.aggregation,
      operator: alert.operator,
      window: alert.window,
    },
    { warning: 0.5, alarm: 2.5, aggregation: 'sum', operator: '>', window: '10m' },
  );
  assert.match(monitoringDocs, /единичное превышение\s+даёт `Warning`/);
  assert.match(monitoringDocs, /`Alarm` требует минимум три превышения за 10 минут/);
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

test('lead storage alert uses the direct OTLP application metric', () => {
  const alert = config.alerts.find(item => item.id === 'zvenfit_lead_storage_errors');

  assert.match(alert.metricSelector, /service="zvenfit-frontend"/);
  assert.match(alert.metricSelector, /name="zvenfit_lead_storage_errors"/);
});

test('lead pipeline alerts use direct OTLP application metrics', () => {
  const directIds = [
    'zvenfit_lead_storage_errors',
    'zvenfit_permanent_telegram_failures',
    'zvenfit_ydb_retries',
    'zvenfit_slow_ydb_operations',
    'zvenfit_rate-limited_leads',
    'zvenfit_persisted_leads_volume',
    'zvenfit_retry_worker_heartbeat',
    'zvenfit_telegram_delivery_backlog',
    'zvenfit_rate_limit_health_errors',
  ];

  for (const id of directIds) {
    const alert = config.alerts.find(item => item.id === id);
    assert.match(alert.metricSelector, /service="zvenfit-frontend"/, `${id} is not direct`);
    assert.equal(alert.delay, '30s', `${id} should use direct metric latency`);
  }
});

test('Fitbase alert uses the application error aggregate because the handler catches upstream failures', () => {
  const alert = config.alerts.find(item => item.id === 'zvenfit_fitbase_errors');

  assert.equal(alert.metricId, 'zvenfit_fitbase_errors_5m');
  assert.match(alert.metricSelector, /service="logging_aggregates"/);
  assert.match(alert.metricSelector, /name="zvenfit_fitbase_errors_5m"/);
  assert.equal(alert.delay, '3m');
  assert.match(source, /catch \(error\)[\s\S]*fitbase_schedule_error[\s\S]*jsonResponse\(502/);
});

test('retry worker health covers missing heartbeats, delivery backlog, and trigger failures', () => {
  const heartbeat = config.alerts.find(item => item.id === 'zvenfit_retry_worker_heartbeat');
  const backlog = config.alerts.find(item => item.id === 'zvenfit_telegram_delivery_backlog');
  const trigger = config.alerts.find(item => item.id === 'zvenfit_retry_trigger_errors');

  assert.equal(heartbeat.noData, 'ALARM');
  assert.equal(heartbeat.aggregation, 'last');
  assert.match(heartbeat.metricSelector, /name="zvenfit_retry_worker_heartbeat"/);
  assert.deepEqual(
    { warning: backlog.warning, alarm: backlog.alarm, aggregation: backlog.aggregation },
    { warning: 600, alarm: 1800, aggregation: 'last' },
  );
  assert.match(backlog.metricSelector, /name="zvenfit_telegram_oldest_pending_age_seconds"/);
  assert.match(trigger.metricSelector, /serverless\.triggers\.access_error_per_second/);
  assert.match(trigger.metricSelector, /serverless\.triggers\.error_per_second/);
  assert.match(trigger.metricSelector, /trigger="a1smkp9ng1f4g9vqgm7u"/);
});

test('rate limiter fail-open path has a direct health alert', () => {
  const alert = config.alerts.find(item => item.id === 'zvenfit_rate_limit_health_errors');

  assert.match(alert.metricSelector, /name="zvenfit_rate_limit_errors_5m"/);
  assert.deepEqual(
    { warning: alert.warning, alarm: alert.alarm, window: alert.window },
    { warning: 0, alarm: 2, window: '10m' },
  );
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
    labels: {
      'meta.application': 'zvenfit-frontend',
      'meta.environment': 'production',
    },
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
  assert.doesNotMatch(monitoringDocs, /[,{]\s*application="zvenfit-frontend"/);
  assert.doesNotMatch(monitoringDocs, /[,{]\s*environment="production"/);
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
  assert.match(smokeScript, /synthetic Fitbase event intentionally exercises the production Fitbase alert/);
});
