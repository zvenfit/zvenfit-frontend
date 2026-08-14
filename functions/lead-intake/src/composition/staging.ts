import { randomUUID } from 'node:crypto';

import { discardNotification } from '../adapters/notification/discard-sink';
import { createHandler } from '../handler';
import { createInvocationLogger } from '../observability/logger';
import { createInvocationMetrics } from '../observability/metrics';
import * as leadStore from '../ydb/lead-store';
import { consumeLeadRateLimit } from '../ydb/rate-limit';

export const handler = createHandler({
  loggerFactory: createInvocationLogger,
  maxAttempts: () => 1,
  metricsFactory: createInvocationMetrics,
  notificationSender: discardNotification,
  now: () => new Date(),
  rateLimiter: consumeLeadRateLimit,
  retryBatchSize: () => 25,
  store: leadStore,
  uuid: randomUUID,
});
