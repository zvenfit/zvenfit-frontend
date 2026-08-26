import { ExportResultCode } from '@opentelemetry/core';
import { AggregationTemporality, type PushMetricExporter, type ResourceMetrics } from '@opentelemetry/sdk-metrics';
import assert from 'node:assert/strict';
import test from 'node:test';

import { _private, createInvocationMetrics, type InvocationMetrics } from '../metrics';

import type { JsonObject, LoggerLike } from '../../types';
import type { MetricAttributes } from '@opentelemetry/api';

interface TransportOptions {
  endpoint: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

class TestLogger implements LoggerLike {
  public readonly errors: JsonObject[] = [];
  public readonly infos: JsonObject[] = [];
  public readonly warnings: JsonObject[] = [];

  public error(fields: JsonObject): void {
    this.errors.push(fields);
  }

  public info(fields: JsonObject): void {
    this.infos.push(fields);
  }

  public warn(fields: JsonObject): void {
    this.warnings.push(fields);
  }
}

function enabledEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    MONIUM_METRICS_ENABLED: 'true',
    MONIUM_API_KEY: 'monium-api-key',
    MONIUM_PROJECT: 'folder__test',
    ...overrides,
  };
}

test('stays inert when metrics are disabled', async () => {
  const logger = new TestLogger();
  let factoryCalls = 0;
  const metrics = createInvocationMetrics(undefined, logger, {
    env: {},
    transportFactory: () => {
      factoryCalls += 1;
      throw new Error('must not initialize');
    },
  });

  metrics.recordGauge('test_gauge', 1);
  await metrics.flush();

  assert.equal(factoryCalls, 0);
  assert.deepEqual(logger.errors, []);
  assert.deepEqual(logger.warnings, []);
});

test('requires an explicit project and API key', () => {
  const missingProjectLogger = new TestLogger();
  createInvocationMetrics(undefined, missingProjectLogger, {
    env: { MONIUM_METRICS_ENABLED: '1' },
  });
  assert.deepEqual(missingProjectLogger.warnings, [
    { event: 'monium_metrics_misconfigured', reason: 'missing_project' },
  ]);

  const missingApiKeyLogger = new TestLogger();
  createInvocationMetrics(undefined, missingApiKeyLogger, {
    env: enabledEnv({ MONIUM_API_KEY: '' }),
  });
  assert.deepEqual(missingApiKeyLogger.warnings, [
    { event: 'monium_metrics_misconfigured', reason: 'missing_api_key' },
  ]);
});

test('lazily records metrics with Monium headers and flushes only once', async () => {
  const logger = new TestLogger();
  const calls: Array<{ kind: string; name: string; value: number; attributes?: MetricAttributes }> = [];
  const transportOptions: TransportOptions[] = [];
  let flushCalls = 0;
  const metrics = createInvocationMetrics(undefined, logger, {
    env: enabledEnv({
      MONIUM_CLUSTER: 'production',
      MONIUM_SERVICE: 'zvenfit-frontend',
      MONIUM_METRICS_TIMEOUT_MS: '750',
    }),
    transportFactory: options => {
      transportOptions.push(options);

      return {
        recordGauge: (name, value, attributes) => calls.push({ kind: 'gauge', name, value, attributes }),
        flush: async () => {
          flushCalls += 1;
        },
      };
    },
  });

  assert.equal(transportOptions.length, 0);
  metrics.recordGauge('lead_pipeline_health', 1, {
    outcome: 'healthy',
    resource_id: 'must-not-override-function',
  });
  await metrics.flush();
  await metrics.flush();

  assert.deepEqual(calls, [
    {
      kind: 'gauge',
      name: 'lead_pipeline_health',
      value: 1,
      attributes: {
        application: 'zvenfit-frontend',
        environment: 'production',
        component: 'zvenfit-lead-intake',
        resource_id: 'zvenfit-telegram-lead',
        outcome: 'healthy',
      },
    },
  ]);
  assert.equal(flushCalls, 1);
  assert.deepEqual(transportOptions, [
    {
      endpoint: 'https://ingest.monium.yandex.cloud/otlp/v1/metrics',
      headers: {
        Authorization: 'Api-Key monium-api-key',
        'x-monium-project': 'folder__test',
        'x-monium-cluster': 'production',
        'x-monium-service': 'zvenfit-frontend',
      },
      timeoutMs: 750,
    },
  ]);
  assert.deepEqual(logger.errors, []);
  assert.equal(logger.infos.length, 1);
  assert.equal(logger.infos[0]?.event, 'monium_metrics_export_completed');
  assert.equal(logger.infos[0]?.outcome, 'success');
  assert.equal(typeof logger.infos[0]?.duration_ms, 'number');
});

test('does not propagate initialization or export failures', async () => {
  const initializationLogger = new TestLogger();
  const initializationMetrics = createInvocationMetrics(undefined, initializationLogger, {
    env: enabledEnv(),
    transportFactory: () => {
      throw Object.assign(new Error('unavailable'), { code: 'collector_unavailable' });
    },
  });

  assert.doesNotThrow(() => initializationMetrics.recordGauge('lead_pipeline_health', 0));
  assert.deepEqual(initializationLogger.errors, [
    {
      event: 'monium_metrics_init_error',
      outcome: 'failure',
      error_type: 'initialization',
      error_code: 'collector_unavailable',
    },
  ]);

  const exportLogger = new TestLogger();
  const exportMetrics: InvocationMetrics = createInvocationMetrics(undefined, exportLogger, {
    env: enabledEnv(),
    transportFactory: () => ({
      recordGauge() {},
      flush: async () => {
        throw Object.assign(new Error('timeout'), { code: 'export_timeout' });
      },
    }),
  });

  exportMetrics.recordGauge('lead_pipeline_health', 0);
  await assert.doesNotReject(exportMetrics.flush());
  assert.deepEqual(exportLogger.errors, []);
  assert.equal(exportLogger.warnings.length, 1);
  assert.deepEqual(
    {
      event: exportLogger.warnings[0]?.event,
      outcome: exportLogger.warnings[0]?.outcome,
      error_type: exportLogger.warnings[0]?.error_type,
      error_code: exportLogger.warnings[0]?.error_code,
    },
    {
      event: 'monium_metrics_export_error',
      outcome: 'failure',
      error_type: 'timeout',
      error_code: 'export_timeout',
    },
  );
  assert.equal(typeof exportLogger.warnings[0]?.duration_ms, 'number');
  assert.equal(JSON.stringify(exportLogger.warnings).includes('monium-api-key'), false);
});

test('bounds the exporter timeout', () => {
  const observedTimeouts: number[] = [];
  const logger = new TestLogger();

  assert.equal(_private.metricsTimeoutMs(enabledEnv()), 5000);

  for (const configured of ['10', '9000']) {
    const metrics = createInvocationMetrics(undefined, logger, {
      env: enabledEnv({ MONIUM_METRICS_TIMEOUT_MS: configured }),
      transportFactory: options => {
        observedTimeouts.push(options.timeoutMs);

        return { recordGauge() {}, async flush() {} };
      },
    });
    metrics.recordGauge('test_gauge', 1);
  }

  assert.deepEqual(observedTimeouts, [100, 5000]);
});

test('collects a gauge once and waits for the exporter callback before shutdown', async () => {
  let exportedMetrics: ResourceMetrics | undefined;
  let callbackCompleted = false;
  let shutdownCalls = 0;
  const exporter: PushMetricExporter = {
    export(metrics, resultCallback) {
      exportedMetrics = metrics;
      setTimeout(() => {
        callbackCompleted = true;
        resultCallback({ code: ExportResultCode.SUCCESS });
      }, 10);
    },
    async forceFlush() {},
    async shutdown() {
      shutdownCalls += 1;
    },
  };
  const transport = _private.createOtelTransport(
    { endpoint: 'https://example.test', headers: {}, timeoutMs: 100 },
    () => exporter,
  );

  transport.recordGauge('zvenfit_test_health', 2, { outcome: 'stored' });
  const flushPromise = transport.flush();
  assert.equal(callbackCompleted, false);
  await flushPromise;

  assert.equal(callbackCompleted, true);
  assert.equal(shutdownCalls, 1);
  const metric = exportedMetrics?.scopeMetrics
    .flatMap(scope => scope.metrics)
    .find(item => item.descriptor.name === 'zvenfit_test_health');
  assert.ok(metric);
  assert.equal(metric.aggregationTemporality, AggregationTemporality.CUMULATIVE);
  assert.equal(metric.dataPoints[0]?.value, 2);
  assert.deepEqual(metric.dataPoints[0]?.attributes, { outcome: 'stored' });
});

test('exports zero-valued gauges as cumulative instant values', async () => {
  let exportedMetrics: ResourceMetrics | undefined;
  const exporter: PushMetricExporter = {
    export(metrics, resultCallback) {
      exportedMetrics = metrics;
      resultCallback({ code: ExportResultCode.SUCCESS });
    },
    async forceFlush() {},
    async shutdown() {},
  };
  const transport = _private.createOtelTransport(
    { endpoint: 'https://example.test', headers: {}, timeoutMs: 100 },
    () => exporter,
  );

  transport.recordGauge('zvenfit_telegram_pending_leads', 0);
  transport.recordGauge('zvenfit_telegram_oldest_pending_age_seconds', 0);
  transport.recordGauge('zvenfit_retry_worker_heartbeat', 1);
  await transport.flush();

  const metrics = exportedMetrics?.scopeMetrics.flatMap(scope => scope.metrics) ?? [];
  const gauges = new Map(metrics.map(metric => [metric.descriptor.name, metric]));

  for (const [name, expectedValue] of [
    ['zvenfit_telegram_pending_leads', 0],
    ['zvenfit_telegram_oldest_pending_age_seconds', 0],
    ['zvenfit_retry_worker_heartbeat', 1],
  ] as const) {
    const gauge = gauges.get(name);
    assert.ok(gauge, `${name} was not exported`);
    assert.equal(gauge.aggregationTemporality, AggregationTemporality.CUMULATIVE);
    assert.equal(gauge.dataPoints[0]?.value, expectedValue);
  }
});

test('rejects when the exporter callback reports a failure', async () => {
  const exporter: PushMetricExporter = {
    export(_metrics, resultCallback) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: Object.assign(new Error('collector rejected metrics'), { code: 'collector_rejected' }),
      });
    },
    async forceFlush() {},
    async shutdown() {},
  };
  const transport = _private.createOtelTransport(
    { endpoint: 'https://example.test', headers: {}, timeoutMs: 100 },
    () => exporter,
  );

  transport.recordGauge('zvenfit_test_health', 1);
  await assert.rejects(transport.flush(), { code: 'collector_rejected' });
});
