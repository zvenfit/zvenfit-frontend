import { ExportResultCode } from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import {
  AggregationTemporality,
  InstrumentType,
  MeterProvider,
  MetricReader,
  type PushMetricExporter,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics';

import type { Meter, MetricAttributes } from '@opentelemetry/api';

const METER_NAME = 'zvenfit-lead-intake';
const METER_VERSION = '1';

export interface MetricsTransport {
  addCounter(name: string, value: number, attributes?: MetricAttributes): void;
  recordGauge(name: string, value: number, attributes?: MetricAttributes): void;
  flush(): Promise<void>;
}

export interface MetricsTransportOptions {
  endpoint: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

type MetricsExporterFactory = (options: MetricsTransportOptions) => PushMetricExporter;

class OneShotMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}

  protected async onShutdown(): Promise<void> {}
}

class OtelMetricsTransport implements MetricsTransport {
  private readonly counters = new Map<string, ReturnType<Meter['createCounter']>>();
  private readonly gauges = new Map<string, ReturnType<Meter['createGauge']>>();
  private readonly provider: MeterProvider;
  private readonly reader: MetricReader;
  private readonly exporter: PushMetricExporter;
  private readonly meter: Meter;
  private readonly timeoutMs: number;

  public constructor(
    provider: MeterProvider,
    reader: MetricReader,
    exporter: PushMetricExporter,
    meter: Meter,
    timeoutMs: number,
  ) {
    this.provider = provider;
    this.reader = reader;
    this.exporter = exporter;
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
    let exportFailure: unknown;

    try {
      const { resourceMetrics, errors } = await this.reader.collect({ timeoutMillis: this.timeoutMs });
      if (errors.length > 0) {
        throw normalizeMetricError(errors[0], 'metrics_collection_failed');
      }
      if (resourceMetrics.scopeMetrics.length > 0) {
        await exportCollectedMetrics(this.exporter, resourceMetrics, this.timeoutMs);
      }
      await this.exporter.forceFlush();
    } catch (error) {
      exportFailure = normalizeMetricError(error, 'metrics_export_failed');
    }

    const [providerShutdown, exporterShutdown] = await Promise.all([
      settle(this.provider.shutdown({ timeoutMillis: this.timeoutMs })),
      settle(this.exporter.shutdown()),
    ]);

    if (exportFailure !== undefined) {
      throw exportFailure;
    }
    if (providerShutdown.status === 'rejected') {
      throw providerShutdown.reason;
    }
    if (exporterShutdown.status === 'rejected') {
      throw exporterShutdown.reason;
    }
  }
}

function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    value => ({ status: 'fulfilled', value }),
    reason => ({ status: 'rejected', reason }),
  );
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
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let completed = false;
    const timeoutState: { value?: NodeJS.Timeout } = {};
    const finish = (error?: Error) => {
      if (completed) {
        return;
      }
      completed = true;
      if (timeoutState.value) {
        clearTimeout(timeoutState.value);
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    timeoutState.value = setTimeout(() => {
      finish(Object.assign(new Error('Metric export timed out'), { code: 'metrics_export_timeout' }));
    }, timeoutMs);

    try {
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

function createOtelExporter(options: MetricsTransportOptions): PushMetricExporter {
  return new OTLPMetricExporter({
    url: options.endpoint,
    headers: options.headers,
    timeoutMillis: options.timeoutMs,
    // Each Cloud Function invocation owns a one-shot meter provider. DELTA
    // preserves event counts across those short-lived providers; CUMULATIVE
    // made every invocation restart the same series at 1.
    temporalityPreference: AggregationTemporality.DELTA,
  });
}

function selectAggregationTemporality(instrumentType: InstrumentType): AggregationTemporality {
  switch (instrumentType) {
    case InstrumentType.COUNTER:
    case InstrumentType.OBSERVABLE_COUNTER:
    case InstrumentType.HISTOGRAM:
      return AggregationTemporality.DELTA;
    default:
      return AggregationTemporality.CUMULATIVE;
  }
}

export function createOtelTransport(
  options: MetricsTransportOptions,
  exporterFactory: MetricsExporterFactory = createOtelExporter,
): MetricsTransport {
  const exporter = exporterFactory(options);
  const reader = new OneShotMetricReader({
    // Event counters are deltas for each short-lived function invocation.
    // Gauges are cumulative instant values so an explicit zero remains a
    // real sample instead of looking like missing telemetry in Monium.
    aggregationTemporalitySelector: selectAggregationTemporality,
  });
  const provider = new MeterProvider({ readers: [reader] });

  return new OtelMetricsTransport(
    provider,
    reader,
    exporter,
    provider.getMeter(METER_NAME, METER_VERSION),
    options.timeoutMs,
  );
}
