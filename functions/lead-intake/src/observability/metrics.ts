import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { AggregationTemporality, MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

import type { ApplicationMetrics, FunctionContext, LoggerLike } from '../types';
import type { Meter, MetricAttributes } from '@opentelemetry/api';

const DEFAULT_ENDPOINT = 'https://ingest.monium.yandex.cloud/otlp/v1/metrics';
const DEFAULT_CLUSTER = 'default';
const DEFAULT_SERVICE = 'zvenfit-frontend';
const DEFAULT_TIMEOUT_MS = 1000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 5000;
const EXPORT_INTERVAL_MS = 60_000;
const METER_NAME = 'zvenfit-lead-intake';
const METER_VERSION = '1';

export interface InvocationMetrics extends ApplicationMetrics {
  addCounter(name: string, value?: number, attributes?: MetricAttributes): void;
  recordGauge(name: string, value: number, attributes?: MetricAttributes): void;
  flush(): Promise<void>;
}

interface MetricsTransport {
  addCounter(name: string, value: number, attributes?: MetricAttributes): void;
  recordGauge(name: string, value: number, attributes?: MetricAttributes): void;
  flush(): Promise<void>;
}

interface MetricsTransportOptions {
  endpoint: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

type MetricsTransportFactory = (options: MetricsTransportOptions) => MetricsTransport;

interface CreateInvocationMetricsOptions {
  env?: NodeJS.ProcessEnv;
  transportFactory?: MetricsTransportFactory;
}

class OtelMetricsTransport implements MetricsTransport {
  private readonly counters = new Map<string, ReturnType<Meter['createCounter']>>();
  private readonly gauges = new Map<string, ReturnType<Meter['createGauge']>>();
  private readonly provider: MeterProvider;
  private readonly meter: Meter;
  private readonly timeoutMs: number;

  public constructor(provider: MeterProvider, meter: Meter, timeoutMs: number) {
    this.provider = provider;
    this.meter = meter;
    this.timeoutMs = timeoutMs;
  }

  public addCounter(name: string, value: number, attributes?: MetricAttributes): void {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = this.meter.createCounter(name);
      this.counters.set(name, counter);
    }
    counter.add(value, attributes);
  }

  public recordGauge(name: string, value: number, attributes?: MetricAttributes): void {
    let gauge = this.gauges.get(name);
    if (!gauge) {
      gauge = this.meter.createGauge(name);
      this.gauges.set(name, gauge);
    }
    gauge.record(value, attributes);
  }

  public async flush(): Promise<void> {
    const exportResult = await settle(this.provider.forceFlush({ timeoutMillis: this.timeoutMs }));
    const shutdownResult = await settle(this.provider.shutdown({ timeoutMillis: this.timeoutMs }));

    if (exportResult.status === 'rejected') {
      throw exportResult.reason;
    }
    if (shutdownResult.status === 'rejected') {
      throw shutdownResult.reason;
    }
  }
}

class LazyInvocationMetrics implements InvocationMetrics {
  private transport?: MetricsTransport;
  private initializationFailed = false;
  private flushed = false;
  private readonly transportOptions: MetricsTransportOptions;
  private readonly transportFactory: MetricsTransportFactory;
  private readonly logger: LoggerLike;

  public constructor(
    transportOptions: MetricsTransportOptions,
    transportFactory: MetricsTransportFactory,
    logger: LoggerLike,
  ) {
    this.transportOptions = transportOptions;
    this.transportFactory = transportFactory;
    this.logger = logger;
  }

  public addCounter(name: string, value = 1, attributes?: MetricAttributes): void {
    this.record(transport => transport.addCounter(name, value, attributes));
  }

  public recordGauge(name: string, value: number, attributes?: MetricAttributes): void {
    this.record(transport => transport.recordGauge(name, value, attributes));
  }

  public async flush(): Promise<void> {
    if (this.flushed || !this.transport) {
      return;
    }
    this.flushed = true;

    try {
      await this.transport.flush();
    } catch (error) {
      logMetricError(this.logger, 'monium_metrics_export_error', error);
    }
  }

  private record(callback: (transport: MetricsTransport) => void): void {
    if (this.flushed || this.initializationFailed) {
      return;
    }

    try {
      this.transport ??= this.transportFactory(this.transportOptions);
      callback(this.transport);
    } catch (error) {
      this.initializationFailed = true;
      logMetricError(this.logger, 'monium_metrics_init_error', error);
    }
  }
}

const NOOP_METRICS: InvocationMetrics = {
  addCounter() {},
  recordGauge() {},
  async flush() {},
};

function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason }),
  );
}

function metricErrorCode(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'metrics_error';
  }

  const codedError = error as Error & { code?: unknown; cause?: { code?: unknown } };

  return String(codedError.code || codedError.cause?.code || error.name || 'metrics_error').slice(0, 64);
}

function logMetricError(logger: LoggerLike, event: string, error: unknown): void {
  logger.error({ event, error_code: metricErrorCode(error) }, event);
}

function logMisconfiguration(logger: LoggerLike, reason: string): void {
  const event = 'monium_metrics_misconfigured';
  logger.warn?.({ event, reason }, event);
}

function metricsEnabled(env: NodeJS.ProcessEnv): boolean {
  return ['1', 'true'].includes(env.MONIUM_METRICS_ENABLED?.trim().toLowerCase() ?? '');
}

function metricsTimeoutMs(env: NodeJS.ProcessEnv): number {
  const configured = Number.parseInt(env.MONIUM_METRICS_TIMEOUT_MS ?? '', 10);
  if (!Number.isInteger(configured)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(Math.max(configured, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

function createOtelTransport(options: MetricsTransportOptions): MetricsTransport {
  const exporter = new OTLPMetricExporter({
    url: options.endpoint,
    headers: options.headers,
    timeoutMillis: options.timeoutMs,
    temporalityPreference: AggregationTemporality.DELTA,
  });
  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: EXPORT_INTERVAL_MS,
    exportTimeoutMillis: options.timeoutMs,
  });
  const provider = new MeterProvider({ readers: [reader] });

  return new OtelMetricsTransport(provider, provider.getMeter(METER_NAME, METER_VERSION), options.timeoutMs);
}

export function createInvocationMetrics(
  _context: FunctionContext | undefined,
  logger: LoggerLike,
  options: CreateInvocationMetricsOptions = {},
): InvocationMetrics {
  const env = options.env ?? process.env;
  if (!metricsEnabled(env)) {
    return NOOP_METRICS;
  }

  const project = env.MONIUM_PROJECT?.trim();
  if (!project) {
    logMisconfiguration(logger, 'missing_project');

    return NOOP_METRICS;
  }

  const apiKey = env.MONIUM_API_KEY?.trim();
  if (!apiKey) {
    logMisconfiguration(logger, 'missing_api_key');

    return NOOP_METRICS;
  }

  return new LazyInvocationMetrics(
    {
      endpoint: env.MONIUM_METRICS_ENDPOINT?.trim() || DEFAULT_ENDPOINT,
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        'x-monium-project': project,
        'x-monium-cluster': env.MONIUM_CLUSTER?.trim() || DEFAULT_CLUSTER,
        'x-monium-service': env.MONIUM_SERVICE?.trim() || DEFAULT_SERVICE,
      },
      timeoutMs: metricsTimeoutMs(env),
    },
    options.transportFactory ?? createOtelTransport,
    logger,
  );
}

export const _private = {
  DEFAULT_CLUSTER,
  DEFAULT_ENDPOINT,
  DEFAULT_SERVICE,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  metricsEnabled,
  metricsTimeoutMs,
};
