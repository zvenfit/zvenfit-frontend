'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const { channel } = require('node:diagnostics_channel');
const test = require('node:test');

const { observeYdbOperation } = require('../build/ydb-observability');

function memoryLogger() {
  const records = [];

  return {
    records,
    info(fields) {
      records.push({ level: 'info', ...fields });
    },
    warn(fields) {
      records.push({ level: 'warn', ...fields });
    },
    error(fields) {
      records.push({ level: 'error', ...fields });
    },
  };
}

test('records YDB latency and retry attempts', async () => {
  const logger = memoryLogger();

  const result = await observeYdbOperation('save_lead', logger, async () => {
    channel('ydb:retry.attempt.completed').publish({ outcome: 'retried' });

    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.equal(logger.records.find(record => record.event === 'ydb_operation_completed').retry_attempts, 1);
  assert.equal(logger.records.find(record => record.event === 'ydb_retry').retry_attempts, 1);
});

test('logs a safe error code without the database error message', async () => {
  const logger = memoryLogger();
  const databaseError = new Error('query contains a private phone number');
  databaseError.code = 'OVERLOADED';

  await assert.rejects(() => observeYdbOperation('save_lead', logger, async () => Promise.reject(databaseError)));

  const failure = logger.records.find(record => record.event === 'ydb_operation_failed');
  assert.equal(failure.error_code, 'OVERLOADED');
  assert.equal(JSON.stringify(failure).includes('phone number'), false);
});
