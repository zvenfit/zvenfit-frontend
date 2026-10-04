import { ExportResultCode } from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import {
  AggregationTemporality,
  MeterProvider,
  MetricReader,
  type PushMetricExporter,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics';

import { createMetricsAgent } from './metrics-agent';

import type { Meter, MetricAttributes } from '@opentelemetry/api';

const METER_NAME = 'zvenfit-lead-intake';
const METER_VERSION = '1';

export interface MetricsTransport {
  recordGauge(name: string, value: number, attributes?: MetricAttributes): void;
  flush(): Promise<void>;
}

export interface MetricsTransportOptions {
  endpoint: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

type MetricsExporterFactory = (options: MetricsTransportOptions, signal: AbortSignal) => PushMetricExporter;

type MetricsFlushPhase = 'collect' | 'export' | 'force_flush' | 'shutdown';

class OneShotMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}

  protected async onShutdown(): Promise<void> {}
}

class OtelMetricsTransport implements MetricsTransport {
  private readonly gauges = new Map<string, ReturnType<Meter['createGauge']>>();
  private readonly provider: MeterProvider;
  private readonly reader: MetricReader;
  private exporter?: PushMetricExporter;
  private readonly exporterFactory: MetricsExporterFactory;
  private readonly options: MetricsTransportOptions;
  private readonly controller = new AbortController();
  private flushPromise?: Promise<void>;
  private shutdownPromise?: Promise<PromiseSettledResult<void>[]>;
  private readonly meter: Meter;
  private deadlineAt = 0;
  private phase: MetricsFlushPhase = 'collect';

  public constructor(
    provider: MeterProvider,
    reader: MetricReader,
    exporterFactory: MetricsExporterFactory,
    meter: Meter,
    options: MetricsTransportOptions,
  ) {
    this.provider = provider;
    this.reader = reader;
    this.exporterFactory = exporterFactory;
    this.meter = meter;
    this.options = options;
  }

  public recordGauge(name: string, value: number, attributes?: MetricAttributes): void {
    if (this.flushPromise) {
      return;
    }
    let gauge = this.gauges.get(name);
    if (!gauge) {
      gauge = this.meter.createGauge(name);
      this.gauges.set(name, gauge);
    }
    gauge.record(value, attributes);
  }

  public flush(): Promise<void> {
    this.flushPromise ??= this.flushOnce();

    return this.flushPromise;
  }

  private async flushOnce(): Promise<void> {
    this.deadlineAt = Date.now() + this.options.timeoutMs;
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = timeoutError(this.phase);
        // Set the outcome before aborting: the SDK can treat a truncated 2xx
        // response as success. Its late callback must never win this race.
        reject(error);
        this.controller.abort(error);
      }, this.options.timeoutMs);
    });
    try {
      await Promise.race([this.exportAndShutdown(), deadline]);
    } finally {
      clearTimeout(timer);
      this.controller.abort();
      // Start cleanup even if collect/forceFlush never returns. This promise
      // always fulfills with settled results; late failures remain observed.
      void this.shutdown();
    }
  }

  private remainingMs(): number {
    return Math.max(1, this.deadlineAt - Date.now());
  }

  private throwIfExpired(): void {
    if (Date.now() >= this.deadlineAt && !this.controller.signal.aborted) {
      this.controller.abort(timeoutError(this.phase));
    }
    this.controller.signal.throwIfAborted();
  }

  private shutdown(): Promise<PromiseSettledResult<void>[]> {
    this.shutdownPromise ??= Promise.allSettled([
      Promise.resolve().then(() => this.provider.shutdown({ timeoutMillis: this.remainingMs() })),
      Promise.resolve().then(() => this.exporter?.shutdown()),
    ]);

    return this.shutdownPromise;
  }

  private async exportAndShutdown(): Promise<void> {
    const { signal } = this.controller;
    let exportFailure: unknown;

    try {
      const { resourceMetrics, errors } = await this.reader.collect({ timeoutMillis: this.remainingMs() });
      this.throwIfExpired();
      if (errors.length > 0) {
        throw normalizeMetricError(errors[0], 'metrics_collection_failed');
      }
      if (resourceMetrics.scopeMetrics.length > 0) {
        this.phase = 'export';
        this.exporter = this.exporterFactory({ ...this.options, timeoutMs: this.remainingMs() }, signal);
        await exportCollectedMetrics(this.exporter, resourceMetrics, signal);
        this.throwIfExpired();
        this.phase = 'force_flush';
        await this.exporter.forceFlush();
      }
    } catch (error) {
      exportFailure = withPhase(normalizeMetricError(error, 'metrics_export_failed'), this.phase);
    }

    this.phase = 'shutdown';
    const results = await this.shutdown();
    this.throwIfExpired();

    if (exportFailure !== undefined) {
      throw exportFailure;
    }
    for (const result of results) {
      if (result.status === 'rejected') {
        throw withPhase(normalizeMetricError(result.reason, 'metrics_shutdown_failed'), 'shutdown');
      }
    }
  }
}

function timeoutError(phase: MetricsFlushPhase): Error {
  return Object.assign(new Error('Metrics flush timed out'), { code: 'metrics_export_timeout', phase });
}

// The phase that ran out of budget or failed is safe to log and tells a
// delivered export with slow cleanup apart from one that never completed.
function withPhase(error: Error, phase: MetricsFlushPhase): Error {
  return 'phase' in error ? error : Object.assign(error, { phase });
}

function normalizeMetricError(error: unknown, code: string): Error {
  if (error instanceof Error) {
    return error;
  }

  return Object.assign(new Error(code), { code });
}

function exportCollectedMetrics(
  exporter: PushMetricExporter,
  resourceMetrics: ResourceMetrics,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let completed = false;
    function finish(error?: Error): void {
      if (completed) {
        return;
      }
      completed = true;
      signal.removeEventListener('abort', onAbort);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }
    function onAbort(): void {
      finish(normalizeMetricError(signal.reason, 'metrics_export_timeout'));
    }
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      signal.throwIfAborted();
      exporter.export(resourceMetrics, result => {
        finish(
          result.code === ExportResultCode.SUCCESS
            ? undefined
            : (result.error ?? Object.assign(new Error('Metric export failed'), { code: 'metrics_export_failed' })),
        );
      });
    } catch (error) {
      finish(normalizeMetricError(error, 'metrics_export_failed'));
    }
  });
}

function createOtelExporter(options: MetricsTransportOptions, signal: AbortSignal): PushMetricExporter {
  return new OTLPMetricExporter({
    url: options.endpoint,
    headers: options.headers,
    timeoutMillis: options.timeoutMs,
    temporalityPreference: AggregationTemporality.CUMULATIVE,
    httpAgentOptions: protocol => createMetricsAgent(protocol, signal),
  });
}

export function createOtelTransport(
  options: MetricsTransportOptions,
  exporterFactory: MetricsExporterFactory = createOtelExporter,
): MetricsTransport {
  const reader = new OneShotMetricReader({
    // An explicit zero is a real queue-health sample, not missing telemetry.
    aggregationTemporalitySelector: () => AggregationTemporality.CUMULATIVE,
  });
  const provider = new MeterProvider({ readers: [reader] });

  return new OtelMetricsTransport(
    provider,
    reader,
    exporterFactory,
    provider.getMeter(METER_NAME, METER_VERSION),
    options,
  );
}
