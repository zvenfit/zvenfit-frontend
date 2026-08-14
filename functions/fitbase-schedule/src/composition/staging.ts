import { createSyntheticScheduleProvider } from '../adapters/synthetic/schedule-provider';
import { createHandler } from '../handler';
import { createInvocationLogger } from '../observability/logger';

export const handler = createHandler({
  failurePolicy: {
    misconfiguredEvent: 'staging_schedule_misconfigured',
    unavailableError: 'schedule_unavailable',
    unavailableEvent: 'staging_schedule_error',
  },
  loggerFactory: createInvocationLogger,
  providerFactory: createSyntheticScheduleProvider,
});
