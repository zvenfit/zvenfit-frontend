import { randomUUID } from 'node:crypto';

import { createHandler } from '../handler';
import { createInvocationLogger } from '../observability/logger';
import { createInvocationMetrics } from '../observability/metrics';
import { sendTelegram } from '../telegram/delivery';
import * as leadStore from '../ydb/lead-store';
import { consumeLeadRateLimit } from '../ydb/rate-limit';

import type { HandlerDependencies } from '../types';

const DEFAULT_MAX_ATTEMPTS = 12;
const DEFAULT_RETRY_BATCH_SIZE = 5;
const MAX_RETRY_BATCH_SIZE = 25;

function positiveInteger(value: string | undefined, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function createProductionDependencies(environment: NodeJS.ProcessEnv = process.env): HandlerDependencies {
  return {
    loggerFactory: createInvocationLogger,
    maxAttempts: () => positiveInteger(environment.MAX_TELEGRAM_ATTEMPTS, DEFAULT_MAX_ATTEMPTS),
    metricsFactory: createInvocationMetrics,
    notificationSender: sendTelegram,
    now: () => new Date(),
    rateLimiter: consumeLeadRateLimit,
    retryBatchSize: () =>
      positiveInteger(environment.TELEGRAM_RETRY_BATCH_SIZE, DEFAULT_RETRY_BATCH_SIZE, MAX_RETRY_BATCH_SIZE),
    store: leadStore,
    uuid: randomUUID,
  };
}

export const handler = createHandler(createProductionDependencies());
