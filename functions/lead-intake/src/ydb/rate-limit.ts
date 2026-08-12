import { createHmac } from 'node:crypto';

import { parsePositiveInt, rateLimitsTableName } from './config';
import { firstResultSet, observed, transactionOptions, ydbTimestamp, ydbUint32 } from './context';

import type { LoggerLike } from '../types';

const DEFAULT_MAX_REQUESTS = 5;
const DEFAULT_WINDOW_SECONDS = 10 * 60;
const MIN_SECRET_LENGTH = 32;
const MAX_CONFIGURED_REQUESTS = 1000;
const MAX_WINDOW_SECONDS = 24 * 60 * 60;
const COUNTER_RETENTION_MS = 24 * 60 * 60 * 1000;

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

    return sql.begin(transactionOptions(), async tx => {
      const rows = firstResultSet(
        await tx`
          SELECT request_count
          FROM ${rateLimitsTable}
          WHERE rate_key = ${key};
        `,
      );
      const currentCount = Number(rows[0]?.request_count || 0);

      if (currentCount >= maxRequests) {
        return false;
      }

      if (rows.length === 0) {
        await tx`
          INSERT INTO ${rateLimitsTable} (rate_key, request_count, expires_at)
          VALUES (${key}, ${ydbUint32(1)}, ${ydbTimestamp(expiresAt)});
        `;
      } else {
        await tx`
          UPDATE ${rateLimitsTable}
          SET request_count = ${ydbUint32(currentCount + 1)}
          WHERE rate_key = ${key};
        `;
      }

      return true;
    });
  });
}

export const _private = { rateKey, settings, windowStart };
