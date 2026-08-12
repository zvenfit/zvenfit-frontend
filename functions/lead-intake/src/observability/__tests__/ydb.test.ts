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
