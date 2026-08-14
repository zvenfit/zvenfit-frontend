import { gunzipSync } from 'node:zlib';

import type { CdnLogEntry } from './types';

export interface ParseResult {
  entries: CdnLogEntry[];
  invalidRecords: number;
}

function numericValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeEntry(value: unknown): CdnLogEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const requestUri = stringValue(record.request_uri);
  const timestamp = stringValue(record.timestamp_ms);
  if (!requestUri || !timestamp) {
    return null;
  }

  return {
    resource_id: stringValue(record.resource_id),
    timestamp_ms: timestamp,
    bytes_sent: numericValue(record.bytes_sent),
    request_uri: requestUri,
    status: stringValue(record.status),
    user_agent: stringValue(record.user_agent),
    remote_addr: stringValue(record.remote_addr),
    request_time: numericValue(record.request_time),
    upstream_cache_status: stringValue(record.upstream_cache_status),
    http_host: stringValue(record.http_host),
  };
}

function recordsFromDocument(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['records', 'logs', 'items']) {
      if (Array.isArray(record[key])) {
        return record[key] as unknown[];
      }
    }
  }

  return [value];
}

function decodePayload(payload: Buffer, objectKey: string): string {
  const isGzip = objectKey.endsWith('.gz') || (payload[0] === 0x1f && payload[1] === 0x8b);

  return (isGzip ? gunzipSync(payload) : payload).toString('utf8').trim();
}

export function parseCdnLogObject(payload: Buffer, objectKey: string): ParseResult {
  const text = decodePayload(payload, objectKey);
  if (!text) {
    return { entries: [], invalidRecords: 0 };
  }

  let rawRecords: unknown[];
  try {
    rawRecords = recordsFromDocument(JSON.parse(text));
  } catch {
    rawRecords = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        rawRecords.push(JSON.parse(trimmed));
      } catch {
        rawRecords.push(null);
      }
    }
  }

  const entries: CdnLogEntry[] = [];
  let invalidRecords = 0;
  for (const rawRecord of rawRecords) {
    const entry = normalizeEntry(rawRecord);
    if (entry) {
      entries.push(entry);
    } else {
      invalidRecords += 1;
    }
  }

  return { entries, invalidRecords };
}
