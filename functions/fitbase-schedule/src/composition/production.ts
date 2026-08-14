import { createFitbaseProvider } from '../adapters/fitbase/provider';
import { createHandler } from '../handler';
import { createInvocationLogger } from '../observability/logger';

export const handler = createHandler({
  failurePolicy: {
    misconfiguredEvent: 'fitbase_schedule_misconfigured',
    unavailableError: 'fitbase_unreachable',
    unavailableEvent: 'fitbase_schedule_error',
  },
  loggerFactory: createInvocationLogger,
  providerFactory: () => createFitbaseProvider(process.env),
});
