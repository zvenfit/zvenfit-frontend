import { destination, pino, stdTimeFunctions, type DestinationStream, type Logger } from 'pino';

import type { FitbaseError, FunctionContext, LoggerLike } from '../types';

const SERVICE = 'zvenfit-fitbase-schedule';
const REDACT_PATHS = [
  'name',
  'phone',
  'telegram_username',
  'telegramUsername',
  'utm',
  'body',
  'payload',
  'token',
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
      base: { service: SERVICE },
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

export function logScheduleFailure(loggerInstance: LoggerLike, event: string, error?: FitbaseError): void {
  loggerInstance.error(
    {
      event,
      error_code: error?.message.slice(0, 64) || event,
      status: Number.isInteger(error?.status) ? error?.status : null,
    },
    event,
  );
}
