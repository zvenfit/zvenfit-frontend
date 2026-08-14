import { parseUtcTimestamp } from './time';

import type { ClassifiedEntry, MetricPoint } from './types';

function normalizedHost(value: string): string {
  const host = value.toLowerCase().split(':')[0]?.trim() || 'unknown';

  return /^[a-z0-9.-]+$/.test(host) ? host : 'unknown';
}

function normalizedLabel(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '_')
    .slice(0, 64);

  return normalized || 'unknown';
}

function statusClass(status: string): string {
  return /^[1-5]\d\d$/.test(status) ? `${status[0]}xx` : 'unknown';
}

function add(totals: Map<string, MetricPoint>, name: string, labels: Record<string, string>, value = 1): void {
  const key = JSON.stringify([name, Object.entries(labels).sort()]);
  const existing = totals.get(key);
  if (existing) {
    existing.value += value;
  } else {
    totals.set(key, { labels, name, type: 'IGAUGE', value });
  }
}

export function buildMetricPoints(
  entries: ClassifiedEntry[],
  resourceId: string,
  technicalSessions: number,
): MetricPoint[] {
  const totals = new Map<string, MetricPoint>();
  for (const classified of entries) {
    const common = {
      cdn_resource: normalizedLabel(resourceId || classified.entry.resource_id),
      host: normalizedHost(classified.entry.http_host),
      traffic_class: classified.trafficClass,
    };
    add(totals, 'zvenfit_cdn_requests', common);
    add(totals, 'zvenfit_cdn_bytes_sent', common, Math.max(0, classified.entry.bytes_sent));
    add(totals, 'zvenfit_cdn_responses', {
      ...common,
      status_class: statusClass(classified.entry.status),
    });
    add(totals, 'zvenfit_cdn_cache_requests', {
      ...common,
      cache_status: normalizedLabel(classified.entry.upstream_cache_status),
    });
    if (classified.isPage) {
      add(totals, 'zvenfit_cdn_page_views', common);
    }
  }

  if (technicalSessions > 0) {
    add(
      totals,
      'zvenfit_cdn_technical_sessions',
      {
        cdn_resource: normalizedLabel(resourceId),
        host: 'zvenfit.ru',
        traffic_class: 'browser',
      },
      technicalSessions,
    );
  }

  return [...totals.values()];
}

export async function writeMetrics(
  metrics: MetricPoint[],
  folderId: string,
  iamToken: string,
  timestamp: string,
): Promise<void> {
  if (metrics.length === 0) {
    return;
  }
  const endpoint = new URL('https://monitoring.api.cloud.yandex.net/monitoring/v2/data/write');
  endpoint.searchParams.set('folderId', folderId);
  endpoint.searchParams.set('service', 'custom');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${iamToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      labels: { environment: 'production', source: 'cdn_raw_logs' },
      metrics,
      ts: timestamp,
    }),
  });
  if (!response.ok) {
    throw new Error(`cdn_metrics_write_failed:${response.status}`);
  }
}

export function metricTimestamp(entries: ClassifiedEntry[], objectHash: string): string {
  const maxTimestamp = entries.reduce((current, classified) => {
    const value = parseUtcTimestamp(classified.entry.timestamp_ms)?.getTime();

    return value === undefined ? current : Math.max(current, value);
  }, 0);
  const base = maxTimestamp || Date.now();
  const offset = Number.parseInt(objectHash.slice(0, 6), 16) % 1000;

  return new Date(base + offset).toISOString();
}
