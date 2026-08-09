'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const { AsyncLocalStorage } = require('node:async_hooks');
const { channel } = require('node:diagnostics_channel');

const { slowOperationMs } = require('./ydb-config');

const operationStorage = new AsyncLocalStorage();
let subscribed = false;

function subscribeToRetries() {
  if (subscribed) {
    return;
  }

  channel('ydb:retry.attempt.completed').subscribe(message => {
    const operation = operationStorage.getStore();

    if (operation && message?.outcome === 'retried') {
      operation.retries += 1;
    }
  });
  subscribed = true;
}

function errorCode(error) {
  return String(error?.code || error?.cause?.code || error?.name || 'ydb_error').slice(0, 64);
}

function writeLog(logger, level, fields) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](fields, fields.event);
  }
}

async function observeYdbOperation(operationName, logger, callback) {
  subscribeToRetries();

  const startedAt = Date.now();
  const operation = { retries: 0 };

  try {
    const result = await operationStorage.run(operation, callback);
    const durationMs = Date.now() - startedAt;

    writeLog(logger, 'info', {
      event: 'ydb_operation_completed',
      operation: operationName,
      duration_ms: durationMs,
      retry_attempts: operation.retries,
    });

    if (operation.retries > 0) {
      writeLog(logger, 'warn', {
        event: 'ydb_retry',
        operation: operationName,
        retry_attempts: operation.retries,
      });
    }

    if (durationMs >= slowOperationMs()) {
      writeLog(logger, 'warn', {
        event: 'ydb_slow_operation',
        operation: operationName,
        duration_ms: durationMs,
      });
    }

    return result;
  } catch (error) {
    writeLog(logger, 'error', {
      event: 'ydb_operation_failed',
      operation: operationName,
      duration_ms: Date.now() - startedAt,
      retry_attempts: operation.retries,
      error_code: errorCode(error),
    });
    throw error;
  }
}

module.exports = {
  observeYdbOperation,
  _private: {
    errorCode,
    subscribeToRetries,
    writeLog,
  },
};
