import { createHash } from 'node:crypto';

import { classifyEntries } from './classifier';
import { buildMetricPoints, metricTimestamp, writeMetrics } from './metrics';
import { parseCdnLogObject } from './parser';
import { countTechnicalSessions } from './sessions';
import { downloadObject } from './storage';

import type { FunctionContext, ObjectStorageEvent } from './types';

const DEFAULT_MAX_OBJECT_BYTES = 20 * 1024 * 1024;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`cdn_config_missing:${name}`);
  }

  return value;
}

function objectHash(bucket: string, objectKey: string): string {
  return createHash('sha256').update(bucket).update('\u0000').update(objectKey).digest('hex');
}

export async function handler(event: ObjectStorageEvent, context: FunctionContext) {
  const iamToken = required(context.token?.access_token, 'iam_token');
  const folderId = required(process.env.YC_FOLDER_ID, 'YC_FOLDER_ID');
  const expectedResourceId = required(process.env.CDN_RESOURCE_ID, 'CDN_RESOURCE_ID');
  const hashSecret = required(process.env.SESSION_HASH_SECRET, 'SESSION_HASH_SECRET');
  const logPrefix = process.env.CDN_LOG_PREFIX || 'raw/zvenfit/';
  const statePrefix = process.env.SESSION_STATE_PREFIX || 'state/sessions/';
  const maxObjectBytes = positiveInteger(process.env.MAX_OBJECT_BYTES, DEFAULT_MAX_OBJECT_BYTES);
  const suspiciousThreshold = positiveInteger(process.env.SUSPICIOUS_REQUESTS_PER_BATCH, 100);
  const sessionTimeoutMinutes = positiveInteger(process.env.SESSION_TIMEOUT_MINUTES, 30);
  const siteHosts = new Set(
    (process.env.SITE_HOSTS || 'zvenfit.ru,www.zvenfit.ru,zvenigorod.zvenfit.ru')
      .split(',')
      .map(host => host.trim().toLowerCase())
      .filter(Boolean),
  );
  let objectsProcessed = 0;
  let recordsProcessed = 0;

  for (const message of event.messages ?? []) {
    const bucket = required(message.details?.bucket_id, 'bucket_id');
    const objectKey = required(message.details?.object_id, 'object_id');
    if (!objectKey.startsWith(logPrefix)) {
      continue;
    }

    const hash = objectHash(bucket, objectKey);
    const payload = await downloadObject(bucket, objectKey, iamToken, maxObjectBytes);
    const parsed = parseCdnLogObject(payload, objectKey);
    const accepted = parsed.entries.filter(entry => !entry.resource_id || entry.resource_id === expectedResourceId);
    const classified = classifyEntries(accepted, suspiciousThreshold, siteHosts);
    const technicalSessions = await countTechnicalSessions(classified, {
      bucket,
      hashSecret,
      iamToken,
      objectHash: hash,
      statePrefix,
      timeoutMinutes: sessionTimeoutMinutes,
    });
    const metrics = buildMetricPoints(classified, expectedResourceId, technicalSessions);
    await writeMetrics(metrics, folderId, iamToken, metricTimestamp(classified, hash));

    objectsProcessed += 1;
    recordsProcessed += classified.length;
    console.info(
      JSON.stringify({
        event: 'cdn_log_processed',
        invalid_records: parsed.invalidRecords,
        metric_points: metrics.length,
        object_hash: hash.slice(0, 12),
        records: classified.length,
        technical_sessions: technicalSessions,
      }),
    );
  }

  return { objectsProcessed, recordsProcessed };
}

export const _private = { objectHash, positiveInteger };
