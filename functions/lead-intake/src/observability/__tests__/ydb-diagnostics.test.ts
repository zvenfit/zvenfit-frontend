import assert from 'node:assert/strict';
import test from 'node:test';

import { memoryLogger, namedError, recordByEvent, tracePhase, type TestPhase } from './ydb-test-helpers';
import { observeYdbOperation } from '../ydb';

test('captures the real SDK retry cause and failed query phase even with zero backoff', async () => {
  const { retry } = await import('@ydbjs/retry');
  const logger = memoryLogger();
  const originalNow = Date.now;
  let now = 1_000;
  let attempts = 0;
  Date.now = () => now;

  try {
    const result = await observeYdbOperation('list_telegram_candidates', logger, () =>
      retry({ retry: true, budget: 2, strategy: 0, idempotent: true }, () =>
        tracePhase('query.execute', async () => {
          attempts += 1;
          now += attempts === 1 ? 1_100 : 50;
          if (attempts === 1) {
            throw Object.assign(new Error('SELECT private payload and secret'), { code: 14 });
          }

          return 'ok';
        }),
      ),
    );

    assert.equal(result, 'ok');
    const recovered = recordByEvent(logger.records, 'ydb_retry');
    assert.equal(recovered.retry_attempts, 1);
    assert.equal(recovered.retry_source, 'sdk');
    assert.equal(recovered.error_code, 'UNAVAILABLE');
    assert.equal(recovered.retriable, true);
    assert.equal(recovered.phase, 'query_execute');
    assert.equal(recovered.failed_phase_duration_ms, 1_100);
    assert.equal(recovered.duration_ms, 1_150);
    assert.equal(recovered.query_execute_attempts, 2);
    assert.equal(logger.records.filter(record => record.event === 'ydb_retry').length, 1);
    assert.doesNotMatch(JSON.stringify(logger.records), /SELECT|private payload|secret/);
  } finally {
    Date.now = originalNow;
  }
});

test('captures the innermost session failure recovered by the read fallback', async () => {
  const logger = memoryLogger();
  let attempts = 0;

  await observeYdbOperation(
    'list_telegram_candidates',
    logger,
    async () => {
      attempts += 1;
      await tracePhase('query.session.acquire', () =>
        tracePhase('query.session.create', async () => {
          if (attempts === 1) {
            throw namedError('TimeoutError');
          }
        }),
      );
    },
    { readRetry: { budgetMs: 10_000 } },
  );

  const recovered = recordByEvent(logger.records, 'ydb_retry');
  assert.equal(recovered.retry_source, 'read_fallback');
  assert.equal(recovered.error_type, 'TimeoutError');
  assert.equal(recovered.error_code, 'TimeoutError');
  assert.equal(recovered.phase, 'session_create');
  assert.equal(typeof recovered.failed_phase_duration_ms, 'number');
  assert.doesNotMatch(JSON.stringify(logger.records), /details must not be logged/);
});

test('keeps retry causes isolated between concurrent operations', async () => {
  const { retry } = await import('@ydbjs/retry');
  const run = async (operation: string, code: number, phase: TestPhase) => {
    const logger = memoryLogger();
    let attempts = 0;
    await observeYdbOperation(operation, logger, () =>
      retry({ retry: true, budget: 2, strategy: 0 }, () =>
        tracePhase(phase, async () => {
          await Promise.resolve();
          attempts += 1;
          if (attempts === 1) {
            throw Object.assign(new Error('private details'), { code });
          }
        }),
      ),
    );

    return recordByEvent(logger.records, 'ydb_retry');
  };

  const [query, session] = await Promise.all([
    run('list_telegram_candidates', 14, 'query.execute'),
    run('get_telegram_queue_health', 8, 'query.session.acquire'),
  ]);
  assert.equal(query.error_code, 'UNAVAILABLE');
  assert.equal(query.phase, 'query_execute');
  assert.equal(session.error_code, 'RESOURCE_EXHAUSTED');
  assert.equal(session.phase, 'session_acquire');
});

test('captures the active query when SDK timeout wins the race against its trace', async () => {
  const { retry } = await import('@ydbjs/retry');
  const logger = memoryLogger();
  const deadline = new AbortController();
  const timeout = new DOMException('private timeout reason', 'TimeoutError');
  let unwind: () => void = () => {};
  let attempts = 0;
  try {
    await observeYdbOperation(
      'list_telegram_candidates',
      logger,
      async () => {
        attempts += 1;
        if (attempts > 1) {
          return 'ok';
        }

        return retry({ signal: deadline.signal }, () =>
          tracePhase(
            'query.execute',
            () =>
              new Promise<never>((_, reject) => {
                unwind = () => reject(new DOMException('private late unwind', 'AbortError'));
                queueMicrotask(() => deadline.abort(timeout));
              }),
          ),
        );
      },
      { readRetry: { budgetMs: 2_000 } },
    );

    const recovered = recordByEvent(logger.records, 'ydb_retry');
    assert.equal(recovered.error_code, 'TimeoutError');
    assert.equal(recovered.phase, 'query_execute');
    assert.equal(recovered.phase_source, 'active_trace');
    assert.equal(typeof recovered.failed_phase_duration_ms, 'number');
    assert.equal(recovered.retry_source, 'read_fallback');
    assert.doesNotMatch(JSON.stringify(logger.records), /private/);
  } finally {
    unwind();
    await new Promise(resolve => setImmediate(resolve));
  }
});

test('does not attribute a later session timeout to a cancelled query still unwinding', async () => {
  const { retry } = await import('@ydbjs/retry');
  const logger = memoryLogger();
  const unwinds: (() => void)[] = [];
  let attempts = 0;
  try {
    await observeYdbOperation(
      'list_telegram_candidates',
      logger,
      async () => {
        attempts += 1;
        if (attempts === 3) {
          return 'ok';
        }
        const deadline = new AbortController();
        const phase = attempts === 1 ? 'query.execute' : 'query.session.create';

        return retry({ signal: deadline.signal }, () =>
          tracePhase(
            phase,
            () =>
              new Promise<never>((_, reject) => {
                unwinds.push(() => reject(new DOMException('private unwind', 'AbortError')));
                queueMicrotask(() => deadline.abort(new DOMException('private reason', 'TimeoutError')));
              }),
          ),
        );
      },
      { readRetry: { budgetMs: 2_000 } },
    );
    const recovered = recordByEvent(logger.records, 'ydb_retry');
    assert.equal(recovered.retry_attempts, 2);
    assert.equal(recovered.phase, 'session_create');
    assert.equal(recovered.phase_source, 'active_trace');
  } finally {
    unwinds.forEach(unwind => unwind());
    await new Promise(resolve => setImmediate(resolve));
  }
});

test('the shared deadline reaches a real SDK query while CreateSession is in flight', async () => {
  const { query } = await import('@ydbjs/query');
  const logger = memoryLogger();
  let rpcSignal: AbortSignal | undefined;
  const driver = {
    identity: {},
    async ready() {},
    createClient() {
      return {
        createSession(_request: unknown, { signal }: { signal: AbortSignal }) {
          rpcSignal = signal;

          return new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          });
        },
      };
    },
  };
  const sql = query(driver as unknown as Parameters<typeof query>[0]);
  try {
    await assert.rejects(
      observeYdbOperation(
        'list_telegram_candidates',
        logger,
        async signal => sql`SELECT 1;`.idempotent(true).signal(signal).timeout(1_000),
        { readRetry: { budgetMs: 30 } },
      ),
      { code: 'ydb_read_budget_exhausted' },
    );
    assert.equal(rpcSignal?.aborted, true);
    const failure = recordByEvent(logger.records, 'ydb_operation_failed');
    assert.equal(failure.phase, 'session_create');
    assert.equal(failure.error_code, 'ydb_read_budget_exhausted');
    assert.equal(failure.retriable, true);
    assert.equal(failure.retry_attempts, 0);
    assert.equal(
      logger.records.some(record => record.event === 'ydb_operation_completed'),
      false,
    );
  } finally {
    await sql[Symbol.asyncDispose]();
  }
});

for (const metadataCompletes of [false, true]) {
  test(`a ${metadataCompletes ? 'completed' : 'stalled'} metadata-token retry preserves CreateSession`, async context => {
    const { query } = await import('@ydbjs/query');
    const { MetadataCredentialsProvider } = await import('@ydbjs/auth/metadata');
    const logger = memoryLogger();
    let metadataSignal: AbortSignal | undefined;
    let tokenFetched = false;
    context.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
      const signal = options.signal;
      assert.ok(signal);
      metadataSignal = signal;
      if (metadataCompletes) {
        return new Response(JSON.stringify({ access_token: 'synthetic-token', expires_in: 3_600 }));
      }

      return new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const credentials = new MetadataCredentialsProvider({ endpoint: 'http://synthetic.invalid/token' });
    const driver = {
      identity: {},
      async ready() {},
      createClient() {
        return {
          async createSession(_request: unknown, { signal }: { signal: AbortSignal }) {
            await credentials.getToken(false, signal);
            tokenFetched = true;

            return new Promise<never>((_, reject) => {
              signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            });
          },
        };
      },
    };
    const sql = query(driver as unknown as Parameters<typeof query>[0]);
    try {
      await assert.rejects(
        observeYdbOperation(
          'list_telegram_candidates',
          logger,
          async signal => sql`SELECT 1;`.idempotent(true).signal(signal).timeout(1_000),
          { readRetry: { budgetMs: 30 } },
        ),
        { code: 'ydb_read_budget_exhausted' },
      );
      assert.equal(metadataSignal?.aborted, true);
      assert.equal(tokenFetched, metadataCompletes);
      const failure = recordByEvent(logger.records, 'ydb_operation_failed');
      assert.equal(failure.phase, 'session_create');
      assert.equal(typeof failure.failed_phase_duration_ms, 'number');
      assert.equal(failure.retriable, true);
    } finally {
      await sql[Symbol.asyncDispose]();
    }
  });
}

test('final failures retain the innermost phase and never become a recovered event', async () => {
  const logger = memoryLogger();
  await assert.rejects(
    observeYdbOperation(
      'list_telegram_candidates',
      logger,
      () =>
        tracePhase('query.session.acquire', () =>
          tracePhase('query.session.create', async () => {
            throw namedError('ClientError', 4);
          }),
        ),
      { readRetry: { budgetMs: 2_000 } },
    ),
  );
  const failure = recordByEvent(logger.records, 'ydb_operation_failed');
  assert.equal(failure.retry_attempts, 2);
  assert.equal(failure.phase, 'session_create');
  assert.equal(failure.phase_source, 'error_trace');
  assert.equal(failure.error_code, 'DEADLINE_EXCEEDED');
  assert.equal(
    logger.records.some(record => record.event === 'ydb_retry'),
    false,
  );
});
