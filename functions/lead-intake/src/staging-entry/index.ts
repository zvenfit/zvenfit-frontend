import { randomUUID } from 'node:crypto';

import { createHandler } from '../handler';
import { discardStagingNotification } from './notification-sink';
import { createInvocationLogger } from '../observability/logger';
import { createInvocationMetrics } from '../observability/metrics';
import * as leadStore from '../ydb/lead-store';
import { consumeLeadRateLimit } from '../ydb/rate-limit';

export const handler = createHandler({
  loggerFactory: createInvocationLogger,
  maxAttempts: () => 1,
  metricsFactory: createInvocationMetrics,
  notificationSender: discardStagingNotification,
  now: () => new Date(),
  rateLimiter: consumeLeadRateLimit,
  retryBatchSize: () => 25,
  store: leadStore,
  uuid: randomUUID,
});
