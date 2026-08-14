import assert from 'node:assert/strict';
import { channel } from 'node:diagnostics_channel';
import test from 'node:test';

import { observeYdbOperation, prepareAndObserveYdbOperation } from '../ydb';

import type { JsonObject, LoggerLike } from '../../types';

interface LogRecord extends JsonObject {
  level: string;
  event?: string;
  retry_attempts?: number;
  error_code?: string;
}

function memoryLogger(): LoggerLike & { records: LogRecord[] } {
  const records: LogRecord[] = [];
  const write = (level: string) => (fields: JsonObject) => records.push({ level, ...fields });

  return {
    records,
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
  };
}

function recordByEvent(records: LogRecord[], event: string): LogRecord {
  const record = records.find(candidate => candidate.event === event);
  assert.ok(record);

  return record;
}

function abortError(): Error {
  const error = new Error('The operation has been aborted');
  error.name = 'AbortError';

  return error;
}

test('records YDB latency and retry attempts', async () => {
  const logger = memoryLogger();

  const result = await observeYdbOperation('save_lead', logger, async () => {
    channel('ydb:retry.attempt.completed').publish({ outcome: 'retried' });

    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.equal(recordByEvent(logger.records, 'ydb_operation_completed').retry_attempts, 1);
  assert.equal(recordByEvent(logger.records, 'ydb_retry').retry_attempts, 1);
});

test('logs a safe error code without the database error message', async () => {
  const logger = memoryLogger();
  const databaseError = Object.assign(new Error('query contains a private phone number'), { code: 'OVERLOADED' });

  await assert.rejects(() => observeYdbOperation('save_lead', logger, async () => Promise.reject(databaseError)));

  const failure = recordByEvent(logger.records, 'ydb_operation_failed');
  assert.equal(failure.error_code, 'OVERLOADED');
  assert.equal(JSON.stringify(failure).includes('phone number'), false);
});

test('retries one AbortError for an explicitly safe read', async () => {
  const logger = memoryLogger();
  let attempts = 0;

  const result = await observeYdbOperation(
    'list_telegram_candidates',
    logger,
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw abortError();
      }

      return 'ok';
    },
    { retryAbortOnce: true },
  );

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
  assert.equal(recordByEvent(logger.records, 'ydb_operation_completed').retry_attempts, 1);
  assert.equal(recordByEvent(logger.records, 'ydb_retry').retry_attempts, 1);
  assert.equal(
    logger.records.some(record => record.event === 'ydb_operation_failed'),
    false,
  );
});

test('does not retry AbortError unless the operation opts in', async () => {
  const logger = memoryLogger();
  let attempts = 0;

  await assert.rejects(() =>
    observeYdbOperation('save_lead', logger, async () => {
      attempts += 1;
      throw abortError();
    }),
  );

  assert.equal(attempts, 1);
  assert.equal(recordByEvent(logger.records, 'ydb_operation_failed').error_code, 'AbortError');
});

test('stops after one AbortError retry', async () => {
  const logger = memoryLogger();
  let attempts = 0;

  await assert.rejects(() =>
    observeYdbOperation(
      'get_telegram_queue_health',
      logger,
      async () => {
        attempts += 1;
        throw abortError();
      },
      { retryAbortOnce: true },
    ),
  );

  assert.equal(attempts, 2);
  assert.equal(recordByEvent(logger.records, 'ydb_operation_failed').retry_attempts, 1);
});

test('excludes client preparation from operation latency', async () => {
  const logger = memoryLogger();
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  try {
    const result = await prepareAndObserveYdbOperation(
      'list_telegram_candidates',
      logger,
      async () => {
        now += 2_000;

        return 'ready-client';
      },
      async client => {
        assert.equal(client, 'ready-client');
        now += 50;

        return 'ok';
      },
    );

    assert.equal(result, 'ok');
    assert.equal(recordByEvent(logger.records, 'ydb_operation_completed').duration_ms, 50);
    assert.equal(
      logger.records.some(record => record.event === 'ydb_slow_operation'),
      false,
    );
  } finally {
    Date.now = originalNow;
  }
});
