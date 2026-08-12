import { createHmac } from 'node:crypto';

import { parsePositiveInt, rateLimitsTableName } from './config';
import { observed, timed, ydbTimestamp, ydbUint32 } from './context';

import type { LoggerLike } from '../types';

const DEFAULT_MAX_REQUESTS = 5;
const DEFAULT_WINDOW_SECONDS = 10 * 60;
const MIN_SECRET_LENGTH = 32;
const MAX_CONFIGURED_REQUESTS = 1000;
const MAX_WINDOW_SECONDS = 24 * 60 * 60;
const COUNTER_RETENTION_MS = 24 * 60 * 60 * 1000;
const YDB_PRECONDITION_FAILED = 400120;

function settings(): { maxRequests: number; windowSeconds: number; secret: string } {
  const secret = (process.env.LEAD_RATE_LIMIT_SECRET || '').trim();
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error('lead_rate_limit_secret_missing');
  }

  return {
    maxRequests: Math.min(
      parsePositiveInt(process.env.LEAD_RATE_LIMIT_MAX, DEFAULT_MAX_REQUESTS),
      MAX_CONFIGURED_REQUESTS,
    ),
    windowSeconds: Math.min(
      parsePositiveInt(process.env.LEAD_RATE_LIMIT_WINDOW_SECONDS, DEFAULT_WINDOW_SECONDS),
      MAX_WINDOW_SECONDS,
    ),
    secret,
  };
}

function windowStart(now: Date, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;

  return Math.floor(now.getTime() / windowMs) * windowMs;
}

function rateKey(sourceIp: string, now: Date, windowSeconds: number, secret: string): string {
  const ipDigest = createHmac('sha256', secret).update(sourceIp.trim()).digest('hex');

  return `${ipDigest}:${windowStart(now, windowSeconds)}`;
}

function isOccupiedSlotError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === YDB_PRECONDITION_FAILED;
}

export async function consumeLeadRateLimit({
  sourceIp,
  now,
  logger,
}: {
  sourceIp: string;
  now: Date;
  logger?: LoggerLike;
}): Promise<boolean> {
  return observed('lead_rate_limit', logger, async sql => {
    const { maxRequests, windowSeconds, secret } = settings();
    const rateLimitsTable = sql.identifier(rateLimitsTableName());
    const key = rateKey(sourceIp, now, windowSeconds, secret);
    const expiresAt = new Date(windowStart(now, windowSeconds) + COUNTER_RETENTION_MS);
    // A counter update can lose the predicate race under concurrent YDB
    // transactions: multiple callers may all observe request_count < max and
    // report success. Model the limit as maxRequests unique primary-key slots
    // instead. INSERT is the atomic arbiter: exactly one caller can occupy each
    // slot, and the first caller that finds no free slot is rejected.
    for (let slot = 1; slot <= maxRequests; slot += 1) {
      try {
        await timed(sql`
          INSERT INTO ${rateLimitsTable} (rate_key, request_count, expires_at)
          VALUES (${`${key}:${slot}`}, ${ydbUint32(slot)}, ${ydbTimestamp(expiresAt)});
        `);

        return true;
      } catch (error) {
        if (!isOccupiedSlotError(error)) {
          throw error;
        }
      }
    }

    return false;
  });
}

export const _private = { isOccupiedSlotError, rateKey, settings, windowStart };
