'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/monitoring.config.json'), 'utf8'));
const source = [
  'functions/lead-intake/src/handler.ts',
  'functions/lead-intake/src/notification/delivery.ts',
  'functions/lead-intake/src/telegram/delivery.ts',
  'functions/lead-intake/src/observability/ydb.ts',
  'functions/fitbase-schedule/src/handler.ts',
  'functions/fitbase-schedule/src/composition/production.ts',
  'functions/fitbase-schedule/src/observability/logger.ts',
  'functions/site-traffic/src/handler.ts',
]
  .map(file => fs.readFileSync(path.join(ROOT, file), 'utf8'))
  .join('\n');
const monitoringDocs = fs.readFileSync(path.join(ROOT, 'docs/monitoring.md'), 'utf8');
const smokeScript = fs.readFileSync(path.join(ROOT, 'scripts/test-monitoring-alerts.sh'), 'utf8');

test('every monitored event exists in application code and documentation', () => {
  for (const metric of config.logMetrics) {
    for (const event of metric.events || []) {
      assert.match(source, new RegExp(`['\"]${event}['\"]`), `${event} is missing from code`);
      assert.match(monitoringDocs, new RegExp(`\\b${event}\\b`), `${event} is missing from docs`);
    }

    if (!metric.events) {
      assert.equal(typeof metric.selector, 'string', `${metric.id} has no log selector`);
      assert.match(monitoringDocs, new RegExp(`\\b${metric.id}\\b`), `${metric.id} is missing from docs`);
    }
  }
});

test('every log metric declares an application event or an exact platform selector', () => {
  for (const metric of config.logMetrics) {
    const hasEvents = Array.isArray(metric.events) && metric.events.length > 0;
    const hasPlatformSelector = metric.sourceType === 'platform-runtime' && typeof metric.selector === 'string';

    assert.equal(hasEvents || hasPlatformSelector, true, `${metric.id} has no log source`);
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
    const alarmIsMoreSevere = alert.operator === '<' ? alert.alarm < alert.warning : alert.alarm > alert.warning;
    assert.equal(alarmIsMoreSevere, true, `${alert.id} has inverted Warning and Alarm thresholds`);
    assert.equal(typeof alert.delay, 'string', `${alert.id} has no evaluation delay`);
    alertIds.add(alert.id);
  }

  assert.equal(alertIds.size, 16);
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

test('count-sensitive and caught application alerts use the log aggregate pipeline', () => {
  const metricIds = new Set(config.logMetrics.map(metric => metric.id));
  const logAlerts = config.alerts.filter(alert => metricIds.has(alert.metricId));

  assert.deepEqual(logAlerts.map(alert => alert.id), [
    'zvenfit_fitbase_errors',
    'zvenfit_schedule_runtime_errors',
    'zvenfit_schedule_cancellations',
    'zvenfit_ydb_retries',
    'zvenfit_slow_ydb_operations',
    'zvenfit_rate-limited_leads',
    'zvenfit_persisted_leads_volume',
    'zvenfit_rate_limit_health_errors',
  ]);
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
  assert.equal(alert.metricId, 'zvenfit_ydb_slow_operations_5m');
  assert.match(alert.metricSelector, /service="logging_aggregates"/);
  assert.equal(alert.delay, '3m');
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

test('direct lead health alerts select the same canonical taxonomy emitted by the function', () => {
  const expectedLabels = {
    application: 'zvenfit-frontend',
    environment: 'production',
    service: 'zvenfit-lead-intake',
    resource_id: 'zvenfit-telegram-lead',
  };

  for (const id of ['zvenfit_retry_worker_heartbeat', 'zvenfit_telegram_delivery_backlog']) {
    const alert = config.alerts.find(item => item.id === id);

    assert.ok(alert, `${id} is missing`);
    assert.match(alert.metricSelector, /application="zvenfit-frontend"/);
    assert.match(alert.metricSelector, /environment="production"/);
    assert.match(alert.metricSelector, /component="zvenfit-lead-intake"/);
    assert.match(alert.metricSelector, /resource_id="zvenfit-telegram-lead"/);
    assert.deepEqual(alert.labels, expectedLabels);
  }
});

test('runtime multialert covers every production function and keeps schedule cancellations separate', () => {
  const generalRuntimeAlert = config.alerts.find(alert => alert.id === 'zvenfit_function_runtime_errors');
  const throttlesAlert = config.alerts.find(alert => alert.id === 'zvenfit_function_throttles');
  const scheduleRuntimeAlert = config.alerts.find(alert => alert.id === 'zvenfit_schedule_runtime_errors');
  const cancellationAlert = config.alerts.find(alert => alert.id === 'zvenfit_schedule_cancellations');
  const scheduleRuntimeMetric = config.logMetrics.find(
    metric => metric.id === 'zvenfit_schedule_runtime_errors_1m',
  );
  const cancellationMetric = config.logMetrics.find(
    metric => metric.id === 'zvenfit_schedule_client_cancellations_5m',
  );

  assert.match(generalRuntimeAlert.metricSelector, /name="functions_errors"/);
  assert.match(generalRuntimeAlert.metricSelector, /resource_id="zvenfit-telegram-lead\|/);
  assert.match(generalRuntimeAlert.metricSelector, /zvenfit-fitbase-schedule/);
  assert.match(generalRuntimeAlert.metricSelector, /zvenfit-site-traffic/);
  assert.equal(generalRuntimeAlert.scope, 'production-functions');
  assert.deepEqual(generalRuntimeAlert.decomposeBy, ['resource_id']);
  assert.equal(generalRuntimeAlert.groupNotifications, true);
  assert.deepEqual(generalRuntimeAlert.labels, {
    application: 'zvenfit-frontend',
    environment: 'production',
  });
  assert.deepEqual(
    generalRuntimeAlert.notificationChannelIds,
    config.notificationPolicy.channelIds,
  );
  assert.doesNotMatch(generalRuntimeAlert.metricSelector, /cdn-analytics/);
  assert.doesNotMatch(generalRuntimeAlert.metricSelector, /resource_id="d4e/);

  assert.match(throttlesAlert.metricSelector, /name="functions_throttles"/);
  for (const resourceId of [
    'zvenfit-telegram-lead',
    'zvenfit-fitbase-schedule',
    'zvenfit-site-traffic',
  ]) {
    assert.match(throttlesAlert.metricSelector, new RegExp(resourceId));
  }
  assert.deepEqual(throttlesAlert.decomposeBy, ['resource_id']);
  assert.equal(throttlesAlert.groupNotifications, true);
  assert.deepEqual(throttlesAlert.notificationChannelIds, config.notificationPolicy.channelIds);

  assert.match(scheduleRuntimeMetric.selector, /resource_id="d4e80noc1hjn2g8u0beq"/);
  assert.match(scheduleRuntimeMetric.selector, /resource_type="serverless\.function"/);
  assert.doesNotMatch(scheduleRuntimeMetric.selector, /d4ea7c6tcac97hu62rab/);
  assert.match(scheduleRuntimeMetric.selector, /level="ERROR"/);
  assert.match(scheduleRuntimeMetric.selector, /message!=\*"Code: 499"/);
  assert.equal(scheduleRuntimeMetric.synthetic, false);
  assert.equal(scheduleRuntimeMetric.window, '1m');
  assert.equal(scheduleRuntimeAlert.metricId, scheduleRuntimeMetric.id);
  assert.deepEqual(
    {
      aggregation: scheduleRuntimeAlert.aggregation,
      warning: scheduleRuntimeAlert.warning,
      alarm: scheduleRuntimeAlert.alarm,
      window: scheduleRuntimeAlert.window,
      delay: scheduleRuntimeAlert.delay,
    },
    { aggregation: 'max', warning: 0, alarm: 0.5, window: '5m', delay: '3m' },
  );

  assert.match(cancellationMetric.selector, /resource_id="d4e80noc1hjn2g8u0beq"/);
  assert.match(cancellationMetric.selector, /message=\*"Code: 499"/);
  assert.equal(cancellationMetric.synthetic, false);
  assert.equal(cancellationMetric.window, '5m');
  assert.equal(cancellationAlert.metricId, cancellationMetric.id);
  assert.deepEqual(
    {
      aggregation: cancellationAlert.aggregation,
      warning: cancellationAlert.warning,
      alarm: cancellationAlert.alarm,
      window: cancellationAlert.window,
      delay: cancellationAlert.delay,
    },
    { aggregation: 'sum', warning: 0, alarm: 9.5, window: '10m', delay: '3m' },
  );
  assert.doesNotMatch(monitoringDocs, /кнопк[^\n]*тестирован[^\n]*канал/i);
});

test('lead storage alert uses the direct OTLP application metric', () => {
  const alert = config.alerts.find(item => item.id === 'zvenfit_lead_storage_errors');

  assert.match(alert.metricSelector, /service="zvenfit-frontend"/);
  assert.match(alert.metricSelector, /name="zvenfit_lead_storage_errors"/);
});

test('instant lead pipeline alerts use direct OTLP application metrics', () => {
  const directIds = [
    'zvenfit_lead_storage_errors',
    'zvenfit_permanent_telegram_failures',
    'zvenfit_retry_worker_heartbeat',
    'zvenfit_telegram_delivery_backlog',
  ];

  for (const id of directIds) {
    const alert = config.alerts.find(item => item.id === id);
    assert.match(alert.metricSelector, /service="zvenfit-frontend"/, `${id} is not direct`);
    assert.equal(alert.delay, '30s', `${id} should use direct metric latency`);
  }
});

test('count-sensitive lead pipeline alerts use true log counts', () => {
  const countSensitiveIds = [
    'zvenfit_ydb_retries',
    'zvenfit_slow_ydb_operations',
    'zvenfit_rate-limited_leads',
    'zvenfit_persisted_leads_volume',
    'zvenfit_rate_limit_health_errors',
  ];

  for (const id of countSensitiveIds) {
    const alert = config.alerts.find(item => item.id === id);
    assert.match(alert.metricSelector, /service="logging_aggregates"/, `${id} is not a log count`);
    assert.equal(alert.delay, '3m', `${id} should wait for log ingestion`);
  }
  assert.match(monitoringDocs, /единичная точка может стать\s+значением больше `1`/);
});

test('Fitbase alert uses the application error aggregate because the handler catches upstream failures', () => {
  const alert = config.alerts.find(item => item.id === 'zvenfit_fitbase_errors');

  assert.equal(alert.metricId, 'zvenfit_fitbase_errors_5m');
  assert.match(alert.metricSelector, /service="logging_aggregates"/);
  assert.match(alert.metricSelector, /name="zvenfit_fitbase_errors_5m"/);
  assert.equal(alert.delay, '3m');
  assert.match(source, /catch \(error\)[\s\S]*failurePolicy\.unavailableEvent[\s\S]*jsonResponse\(502/);
});

test('retry worker health covers missing heartbeats, delivery backlog, and trigger failures', () => {
  const heartbeat = config.alerts.find(item => item.id === 'zvenfit_retry_worker_heartbeat');
  const backlog = config.alerts.find(item => item.id === 'zvenfit_telegram_delivery_backlog');
  const trigger = config.alerts.find(item => item.id === 'zvenfit_retry_trigger_errors');

  assert.equal(heartbeat.noData, 'ALARM');
  assert.equal(heartbeat.aggregation, 'last');
  assert.equal(heartbeat.operator, '<');
  assert.deepEqual({ warning: heartbeat.warning, alarm: heartbeat.alarm }, { warning: 0.9, alarm: 0.5 });
  assert.ok(heartbeat.alarm < heartbeat.warning);
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

test('rate limiter fail-open path has a count-based health alert', () => {
  const alert = config.alerts.find(item => item.id === 'zvenfit_rate_limit_health_errors');

  assert.equal(alert.metricId, 'zvenfit_rate_limit_errors_5m');
  assert.match(alert.metricSelector, /service="logging_aggregates"/);
  assert.match(alert.metricSelector, /name="zvenfit_rate_limit_errors_5m"/);
  assert.equal(alert.delay, '3m');
  assert.deepEqual(
    { warning: alert.warning, alarm: alert.alarm, window: alert.window },
    { warning: 0, alarm: 2, window: '10m' },
  );
});

test('transient Telegram retries remain log-only', () => {
  const monitoredEvents = config.logMetrics.flatMap(metric => metric.events || []);

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

test('technical traffic analytics uses a stateless page-view log and built-in edge metrics', () => {
  const metric = config.logMetrics.find(item => item.id === 'zvenfit_site_page_views_by_class_5m');

  assert.equal(config.trafficAnalytics.cdnResourceId, 'bc8rubabuwzpqqp7rifz');
  assert.equal(config.trafficAnalytics.ingestion, 'browser-beacon-cloud-function-cloud-logging');
  assert.equal(config.trafficAnalytics.productionFunctionName, 'zvenfit-site-traffic');
  assert.deepEqual(config.trafficAnalytics.siteHosts, [
    'zvenfit.ru',
    'www.zvenfit.ru',
    'zvenigorod.zvenfit.ru',
  ]);
  assert.deepEqual(config.trafficAnalytics.trafficClasses, [
    'browser_like',
    'known_bot',
    'synthetic',
    'unknown',
  ]);
  assert.deepEqual(config.trafficAnalytics.measures, ['edge_requests', 'page_views']);
  assert.equal(config.trafficAnalytics.freshnessCard.title, 'Последний page view');
  assert.equal(config.trafficAnalytics.freshnessCard.source, 'zvenfit_site_page_views_by_class_5m');
  assert.match(config.trafficAnalytics.freshnessCard.query, /^series_sum\(/);
  assert.match(config.trafficAnalytics.freshnessCard.query, /name="zvenfit_site_page_views_by_class_5m"/);
  assert.equal(config.trafficAnalytics.freshnessCard.visualization, 'tile');
  assert.equal(config.trafficAnalytics.freshnessCard.aggregation, 'last');
  assert.equal(config.trafficAnalytics.freshnessCard.exactLogTimestamp, false);
  assert.equal(config.trafficAnalytics.freshnessCard.pagingAlert, false);
  assert.deepEqual(metric, {
    id: 'zvenfit_site_page_views_by_class_5m',
    events: ['site_page_view'],
    filters: {
      'meta.service': 'zvenfit-site-traffic',
      'meta.traffic_class': '*',
      host: '*',
    },
    aggregation: 'count',
    window: '5m',
    grouping: ['meta.traffic_class', 'host'],
    synthetic: false,
  });
  for (const metricName of [
    'edge.requests',
    'edge.requests_status',
    'edge.requests_cache_status',
    'edge.bytes_sent',
    'edge.request_time_seconds',
  ]) {
    assert.match(
      Object.values(config.trafficAnalytics.monitoringSelectors).join('\n'),
      new RegExp(metricName.replace('.', '\\.')),
    );
  }
  assert.deepEqual(config.trafficAnalytics.privacy, {
    rawIpInLogs: true,
    rawUserAgentInLogs: true,
    rawUrlInLogs: true,
    rawFieldsInMetricLabels: false,
    persistentClientState: false,
  });
  assert.match(monitoringDocs, /browser_like.*known_bot.*synthetic.*unknown/s);
  assert.doesNotMatch(monitoringDocs, /provision:cdn-raw-logs|Cloud CDN raw logs →/i);
});

test('traffic runtime errors page through the shared multialert and legacy stateful widgets are removed', () => {
  const runtimeErrors = config.dashboard.runtimeErrors;
  const criticalRuntimeAlert = config.alerts.find(alert => alert.id === 'zvenfit_function_runtime_errors');

  assert.equal(runtimeErrors.title, 'Ошибки Cloud Functions');
  assert.match(runtimeErrors.metricSelector, /name="functions_errors"/);
  assert.match(runtimeErrors.metricSelector, /zvenfit-telegram-lead/);
  assert.match(runtimeErrors.metricSelector, /zvenfit-fitbase-schedule/);
  assert.match(runtimeErrors.metricSelector, /zvenfit-site-traffic/);
  assert.equal(runtimeErrors.pagingAlert, true);
  assert.deepEqual(runtimeErrors.decomposeBy, ['resource_id']);
  assert.match(criticalRuntimeAlert.metricSelector, /zvenfit-site-traffic/);
  assert.deepEqual(config.dashboard.trafficWidgets, [
    'Cloud CDN: запросы',
    'Cloud CDN: HTTP-статусы',
    'Трафик: просмотры страниц по классам',
    'Последний page view',
  ]);
  assert.deepEqual(config.dashboard.removeTrafficWidgets, [
    'Трафик: запросы по классам',
    'Трафик: технические сессии людей',
  ]);
  assert.match(monitoringDocs, /zvenfit-site-traffic.*zvenfit_function_runtime_errors/is);
});

test('every log selector is isolated by repository and environment', () => {
  const platformMetrics = config.logMetrics.filter(metric => metric.sourceType === 'platform-runtime');

  assert.equal((monitoringDocs.match(/application="zvenfit-frontend"/g) || []).length >= 8, true);
  assert.equal((monitoringDocs.match(/environment="production"/g) || []).length >= 8, true);
  assert.match(smokeScript, /APPLICATION_NAME="zvenfit-frontend"/);
  assert.match(smokeScript, /MONITORING_ENVIRONMENT="\$\{NODE_ENV:-production\}"/);
  assert.match(monitoringDocs, /service="logging_aggregates"/);
  assert.doesNotMatch(monitoringDocs, /[,{]\s*application="zvenfit-frontend"/);
  assert.doesNotMatch(monitoringDocs, /[,{]\s*environment="production"/);

  assert.equal(platformMetrics.length, 2);
  for (const metric of platformMetrics) {
    assert.match(metric.selector, /project="folder__b1ge1e4iopttj79hfdfm"/);
    assert.match(metric.selector, /cluster="default"/);
    assert.match(metric.selector, /service="default"/);
    assert.match(metric.selector, /resource_type="serverless\.function"/);
  }
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
      name: 'ZvenFit · production · Telegram',
      method: 'telegram',
      recipient: 'cloud-account',
      sendScreenshot: true,
    },
    {
      id: 'zvenfit_email_alerts',
      name: 'ZvenFit · production · Email',
      method: 'email',
      recipient: 'cloud-account',
    },
  ]);
  assert.deepEqual(config.notificationPolicy, {
    channelIds: ['zvenfit_telegram_alerts', 'zvenfit_email_alerts'],
    statuses: ['ALARM', 'WARNING', 'OK'],
    repeatMinutes: 30,
  });
});

test('monitoring smoke script requires confirmation and covers every application log metric', () => {
  assert.match(smokeScript, /\$\{1:-\}.*--confirm/);

  for (const metric of config.logMetrics.filter(item => item.synthetic !== false)) {
    assert.equal(
      metric.events.some(event => new RegExp(`\\b${event}\\b`).test(smokeScript)),
      true,
      `${metric.id} is missing from smoke test`,
    );
  }

  assert.match(smokeScript, /reason\\?":\\?"rate_limit/);
  assert.match(smokeScript, /synthetic Fitbase event intentionally exercises the production Fitbase alert/);
});
