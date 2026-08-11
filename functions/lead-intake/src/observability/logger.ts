import { destination, pino, stdTimeFunctions, type DestinationStream, type Logger } from 'pino';

import type { FunctionContext } from '../types';

const SERVICE = 'zvenfit-lead-intake';
const APPLICATION = 'zvenfit-frontend';
const REDACT_PATHS = [
  'name',
  'phone',
  'telegram_username',
  'telegramUsername',
  'company_website',
  'companyWebsite',
  'source_ip',
  'sourceIp',
  'rate_key',
  'rateKey',
  'utm',
  'body',
  'payload',
  'token',
  'secret',
  'access_token',
  'authorization',
  'Authorization',
  'headers.authorization',
  'headers.Authorization',
  'req.body',
  'req.headers.authorization',
  'request.body',
  'request.headers.authorization',
  'context.token',
] as const;

export function createLogger(destination?: DestinationStream): Logger {
  const output = destination ?? destinationStream();

  return pino(
    {
      base: {
        application: APPLICATION,
        environment: process.env.NODE_ENV || 'production',
        service: SERVICE,
      },
      level: process.env.LOG_LEVEL || 'info',
      messageKey: 'message',
      formatters: {
        level(label) {
          return { level: label.toUpperCase() };
        },
      },
      redact: {
        paths: [...REDACT_PATHS],
        censor: '[REDACTED]',
      },
      timestamp: stdTimeFunctions.isoTime,
    },
    output,
  );
}

function destinationStream(): DestinationStream {
  return destination({ dest: 1, sync: true });
}

const logger = createLogger();

export function createInvocationLogger(context?: FunctionContext, destination?: DestinationStream): Logger {
  const invocationLogger = destination ? createLogger(destination) : logger;

  return context?.requestId ? invocationLogger.child({ request_id: context.requestId }) : invocationLogger;
}
