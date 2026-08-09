'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const pino = require('pino');

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
];

function createLogger(destination) {
  const output = destination || pino.destination({ dest: 1, sync: true });

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
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    output,
  );
}

const logger = createLogger();

function createInvocationLogger(context, destination) {
  const invocationLogger = destination ? createLogger(destination) : logger;

  return context?.requestId ? invocationLogger.child({ request_id: context.requestId }) : invocationLogger;
}

function logScheduleFailure(loggerInstance, event, error = null) {
  loggerInstance.error(
    {
      event,
      error_code: error?.message?.slice(0, 64) || event,
      status: Number.isInteger(error?.status) ? error.status : null,
    },
    event,
  );
}

module.exports = {
  createInvocationLogger,
  createLogger,
  logScheduleFailure,
};
