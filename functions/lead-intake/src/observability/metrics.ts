import { createOtelTransport, type MetricsTransport, type MetricsTransportOptions } from './otel-transport';

import type { ApplicationMetrics, FunctionContext, LoggerLike } from '../types';
import type { MetricAttributes } from '@opentelemetry/api';

const DEFAULT_ENDPOINT = 'https://ingest.monium.yandex.cloud/otlp/v1/metrics';
const DEFAULT_CLUSTER = 'default';
const DEFAULT_SERVICE = 'zvenfit-frontend';
const DEFAULT_APPLICATION = 'zvenfit-frontend';
const DEFAULT_ENVIRONMENT = 'production';
const DEFAULT_COMPONENT = 'zvenfit-lead-intake';
const DEFAULT_RESOURCE_ID = 'zvenfit-telegram-lead';
const DEFAULT_TIMEOUT_MS = 1000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 5000;

export interface InvocationMetrics extends ApplicationMetrics {
  addCounter(name: string, value?: number, attributes?: MetricAttributes): void;
  recordGauge(name: string, value: number, attributes?: MetricAttributes): void;
  flush(): Promise<void>;
}

type MetricsTransportFactory = (options: MetricsTransportOptions) => MetricsTransport;

interface CreateInvocationMetricsOptions {
  env?: NodeJS.ProcessEnv;
  transportFactory?: MetricsTransportFactory;
}

class LazyInvocationMetrics implements InvocationMetrics {
  private transport?: MetricsTransport;
  private initializationFailed = false;
  private flushed = false;
  private readonly transportOptions: MetricsTransportOptions;
  private readonly transportFactory: MetricsTransportFactory;
  private readonly logger: LoggerLike;
  private readonly defaultAttributes: MetricAttributes;

  public constructor(
    transportOptions: MetricsTransportOptions,
    transportFactory: MetricsTransportFactory,
    logger: LoggerLike,
    defaultAttributes: MetricAttributes,
  ) {
    this.transportOptions = transportOptions;
    this.transportFactory = transportFactory;
    this.logger = logger;
    this.defaultAttributes = defaultAttributes;
  }

  public addCounter(name: string, value = 1, attributes?: MetricAttributes): void {
    this.record(transport => transport.addCounter(name, value, this.withDefaultAttributes(attributes)));
  }

  public recordGauge(name: string, value: number, attributes?: MetricAttributes): void {
    this.record(transport => transport.recordGauge(name, value, this.withDefaultAttributes(attributes)));
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

  private withDefaultAttributes(attributes?: MetricAttributes): MetricAttributes {
    return {
      ...attributes,
      ...this.defaultAttributes,
    };
  }
}

const NOOP_METRICS: InvocationMetrics = {
  addCounter() {},
  recordGauge() {},
  async flush() {},
};

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
    {
      application: env.MONIUM_APPLICATION?.trim() || DEFAULT_APPLICATION,
      environment: env.MONIUM_ENVIRONMENT?.trim() || DEFAULT_ENVIRONMENT,
      component: env.MONIUM_COMPONENT?.trim() || DEFAULT_COMPONENT,
      resource_id: env.MONIUM_RESOURCE_ID?.trim() || DEFAULT_RESOURCE_ID,
    },
  );
}

export const _private = {
  DEFAULT_APPLICATION,
  DEFAULT_CLUSTER,
  DEFAULT_COMPONENT,
  DEFAULT_ENDPOINT,
  DEFAULT_ENVIRONMENT,
  DEFAULT_RESOURCE_ID,
  DEFAULT_SERVICE,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  createOtelTransport,
  metricsEnabled,
  metricsTimeoutMs,
};
