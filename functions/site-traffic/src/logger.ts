import { destination, pino, stdTimeFunctions, type DestinationStream, type Logger } from 'pino';

import type { FunctionContext } from './types';

const logger = createLogger();

export function createLogger(output?: DestinationStream): Logger {
  return pino(
    {
      base: {
        application: 'zvenfit-frontend',
        environment: process.env.NODE_ENV || 'production',
        service: 'zvenfit-site-traffic',
      },
      level: process.env.LOG_LEVEL || 'info',
      messageKey: 'message',
      formatters: {
        level(label) {
          return { level: label.toUpperCase() };
        },
      },
      redact: {
        paths: ['authorization', 'Authorization', 'headers.authorization', 'headers.Authorization'],
        censor: '[REDACTED]',
      },
      timestamp: stdTimeFunctions.isoTime,
    },
    output ?? destination({ dest: 1, sync: true }),
  );
}

export function createInvocationLogger(context?: FunctionContext): Logger {
  return context?.requestId ? logger.child({ request_id: context.requestId }) : logger;
}
