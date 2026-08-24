import assert from 'node:assert/strict';
import { channel, tracingChannel } from 'node:diagnostics_channel';
import test from 'node:test';

import { recordInitializationAttempts } from '../../ydb/initialization-attempts';
import { observeYdbOperation, prepareAndObserveYdbOperation } from '../ydb';

import type { JsonObject, LoggerLike } from '../../types';

interface LogRecord extends JsonObject {
  level: string;
  event?: string;
  retry_attempts?: number;
  error_code?: string;
}

type TestPhase = 'query.execute' | 'query.session.acquire' | 'query.session.create';

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

function namedError(name: string, code?: string | number): Error {
  const error = new Error(`${name} details must not be logged`);
  error.name = name;

  return Object.assign(error, code === undefined ? {} : { code });
}

async function tracePhase<T>(phase: TestPhase, callback: () => Promise<T>): Promise<T> {
  let result: T | undefined;
  await Promise.resolve(
    tracingChannel(`tracing:ydb:${phase}`).tracePromise(async () => {
      result = await callback();
    }, {}),
  );

  return result as T;
}

async function withSlowThreshold<T>(value: string, callback: () => Promise<T>): Promise<T> {
  const original = process.env.YDB_SLOW_OPERATION_MS;
  process.env.YDB_SLOW_OPERATION_MS = value;

  try {
    return await callback();
  } finally {
    if (original === undefined) {
      delete process.env.YDB_SLOW_OPERATION_MS;
    } else {
      process.env.YDB_SLOW_OPERATION_MS = original;
    }
  }
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
  assert.equal(failure.error_type, 'Error');
  assert.equal(failure.retriable, true);
  assert.equal(failure.upstream_status, null);
  assert.match(String(failure.stack_fingerprint), /^[a-f0-9]{16}$/);
  assert.equal(JSON.stringify(failure).includes('phone number'), false);
});

test('retries one transient error for an explicitly safe read', async () => {
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
    { retryTransientOnce: true },
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

test('retries TimeoutError and ClientError for explicitly safe reads', async () => {
  for (const errorName of ['TimeoutError', 'ClientError']) {
    const logger = memoryLogger();
    let attempts = 0;

    const result = await observeYdbOperation(
      'list_telegram_candidates',
      logger,
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw namedError(errorName);
        }

        return 'ok';
      },
      { retryTransientOnce: true },
    );

    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
    assert.equal(recordByEvent(logger.records, 'ydb_operation_completed').retry_attempts, 1);
  }
});

test('retries a nested transient gRPC error for an explicitly safe read', async () => {
  const logger = memoryLogger();
  let attempts = 0;

  const result = await observeYdbOperation(
    'get_telegram_queue_health',
    logger,
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('session acquisition failed'), {
          cause: namedError('TransportError', 14),
        });
      }

      return 'ok';
    },
    { retryTransientOnce: true },
  );

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});

test('does not retry transient errors unless the operation opts in', async () => {
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

test('does not retry a permanent read error', async () => {
  const logger = memoryLogger();
  let attempts = 0;

  await assert.rejects(() =>
    observeYdbOperation(
      'get_telegram_queue_health',
      logger,
      async () => {
        attempts += 1;
        throw namedError('PermissionError', 'PERMISSION_DENIED');
      },
      { retryTransientOnce: true },
    ),
  );

  assert.equal(attempts, 1);
  assert.equal(recordByEvent(logger.records, 'ydb_operation_failed').retry_attempts, 0);
});

test('does not retry ClientError with an explicit permanent code', async () => {
  const logger = memoryLogger();
  let attempts = 0;

  await assert.rejects(() =>
    observeYdbOperation(
      'get_telegram_queue_health',
      logger,
      async () => {
        attempts += 1;
        throw namedError('ClientError', 'PERMISSION_DENIED');
      },
      { retryTransientOnce: true },
    ),
  );

  assert.equal(attempts, 1);
});

test('stops after one transient retry', async () => {
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
      { retryTransientOnce: true },
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

test('logs client preparation failures with their initialization attempts', async () => {
  const logger = memoryLogger();
  const error = Object.assign(new Error('private initialization details'), {
    code: 'UNAVAILABLE',
  });
  recordInitializationAttempts(error, 2);

  await assert.rejects(
    prepareAndObserveYdbOperation(
      'list_telegram_candidates',
      logger,
      async () => {
        throw error;
      },
      async () => 'ok',
    ),
  );

  const failure = recordByEvent(logger.records, 'ydb_operation_failed');
  assert.equal(failure.phase, 'client_preparation');
  assert.equal(failure.initialization_attempts, 2);
  assert.equal(failure.retry_attempts, 0);
  assert.equal(failure.error_code, 'UNAVAILABLE');
  assert.equal(failure.retriable, true);
  assert.doesNotMatch(JSON.stringify(failure), /private initialization details/);
});

test('records query and session phase durations without logging SQL text', async () => {
  const logger = memoryLogger();
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  try {
    await observeYdbOperation('list_telegram_candidates', logger, async () => {
      await tracePhase('query.session.acquire', async () => {
        await tracePhase('query.session.create', async () => {
          now += 700;
        });
      });
      await tracePhase('query.execute', async () => {
        now += 80;
      });
    });

    const completed = recordByEvent(logger.records, 'ydb_operation_completed');
    assert.equal(completed.duration_ms, 780);
    assert.equal(completed.query_execute_duration_ms, 80);
    assert.equal(completed.query_execute_max_duration_ms, 80);
    assert.equal(completed.session_acquire_duration_ms, 700);
    assert.equal(completed.session_create_duration_ms, 700);
    assert.equal(JSON.stringify(completed).includes('SELECT'), false);
  } finally {
    Date.now = originalNow;
  }
});

test('slow session creation is diagnostic and does not trigger the slow-query event', async () => {
  const logger = memoryLogger();
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  try {
    await withSlowThreshold('1000', () =>
      observeYdbOperation('list_telegram_candidates', logger, async () => {
        await tracePhase('query.session.acquire', async () => {
          await tracePhase('query.session.create', async () => {
            now += 7_600;
          });
        });
        await tracePhase('query.execute', async () => {
          now += 40;
        });
      }),
    );

    const diagnostic = recordByEvent(logger.records, 'ydb_slow_session_phase');
    assert.equal(diagnostic.phase, 'session_create');
    assert.equal(diagnostic.duration_ms, 7_600);
    assert.equal(
      logger.records.some(record => record.event === 'ydb_slow_operation'),
      false,
    );
  } finally {
    Date.now = originalNow;
  }
});

test('slow ExecuteQuery triggers the existing paging event with query-only latency', async () => {
  const logger = memoryLogger();
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  try {
    await withSlowThreshold('1000', () =>
      observeYdbOperation('list_telegram_candidates', logger, async () => {
        await tracePhase('query.session.acquire', async () => {
          now += 60;
        });
        await tracePhase('query.execute', async () => {
          now += 1_500;
        });
      }),
    );

    const slowQuery = recordByEvent(logger.records, 'ydb_slow_operation');
    assert.equal(slowQuery.phase, 'query_execute');
    assert.equal(slowQuery.duration_ms, 1_500);
    assert.equal(slowQuery.total_duration_ms, 1_560);
    assert.equal(
      logger.records.some(record => record.event === 'ydb_slow_session_phase'),
      false,
    );
  } finally {
    Date.now = originalNow;
  }
});
