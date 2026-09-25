import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { retryRead } from '../read-retry';
import { isTransientReadError } from '../read-retry-policy';

function deadlineError(): Error {
  return Object.assign(new Error('private transport details'), { name: 'ClientError', code: 4 });
}

test('recovers three session deadlines with spaced retries and one shared signal', async context => {
  context.mock.method(Math, 'random', () => 0);
  const starts: number[] = [];
  const signals: AbortSignal[] = [];
  const causes: unknown[] = [];
  const error = deadlineError();
  const result = await retryRead(
    async signal => {
      signals.push(signal);
      starts.push(performance.now());
      if (starts.length < 4) {
        throw error;
      }

      return 'recovered';
    },
    { budgetMs: 10_000, onRetry: cause => causes.push(cause) },
  );

  assert.equal(result, 'recovered');
  assert.equal(starts.length, 4);
  const [first, second, third, fourth] = starts;
  assert.ok(first !== undefined && second !== undefined && third !== undefined && fourth !== undefined);
  assert.ok(second - first >= 490);
  assert.ok(third - second >= 990);
  assert.ok(fourth - third >= 1_990);
  assert.deepEqual(causes, [error, error, error]);
  assert.equal(new Set(signals).size, 1);
  const signal = signals[0];
  assert.ok(signal);
  assert.equal(getEventListeners(signal, 'abort').length, 0);
});

test('one budget cancels an in-flight retry and is not reset per attempt', async context => {
  context.mock.method(Math, 'random', () => 0);
  let attempts = 0;
  let retries = 0;
  let observedSignal: AbortSignal | undefined;
  const startedAt = performance.now();
  await assert.rejects(
    retryRead(
      async signal => {
        observedSignal = signal;
        attempts += 1;
        if (attempts === 1) {
          throw deadlineError();
        }

        // Simulate an SDK call whose cancellation unwind is delayed indefinitely.
        return new Promise<never>(() => {});
      },
      {
        budgetMs: 650,
        onRetry: () => {
          retries += 1;
        },
      },
    ),
    { code: 'ydb_read_budget_exhausted' },
  );

  assert.equal(attempts, 2);
  assert.equal(retries, 1);
  assert.equal(observedSignal?.aborted, true);
  assert.ok(performance.now() - startedAt < 950);
  assert.ok(observedSignal);
  assert.equal(getEventListeners(observedSignal, 'abort').length, 0);
});

test('does not start a retry when its backoff would exhaust the budget', async () => {
  let attempts = 0;
  let retries = 0;
  const error = deadlineError();
  await assert.rejects(
    retryRead(
      async () => {
        attempts += 1;
        throw error;
      },
      {
        budgetMs: 100,
        onRetry: () => {
          retries += 1;
        },
      },
    ),
    candidate => candidate === error,
  );
  assert.equal(attempts, 1);
  assert.equal(retries, 0);
});

test('cleans up the deadline timer after a successful read', async () => {
  const signal = await retryRead(async signal => signal, { budgetMs: 20, onRetry: () => assert.fail() });
  await delay(35);
  assert.equal(signal.aborted, false);
  assert.equal(getEventListeners(signal, 'abort').length, 0);
});

test('recovers when a query timeout cancels the real SDK backoff', async () => {
  const { retry } = await import('@ydbjs/retry');
  const timeout = new DOMException('private timeout details', 'TimeoutError');
  const causes: unknown[] = [];
  let attempts = 0;
  let sdkAttempts = 0;
  const result = await retryRead(
    async signal => {
      attempts += 1;
      if (attempts > 1) {
        return 'recovered';
      }
      const queryDeadline = new AbortController();

      return retry(
        {
          signal: AbortSignal.any([signal, queryDeadline.signal]),
          retry: true,
          budget: 2,
          strategy: () => {
            // Cancel after the SDK has entered timers/promises backoff.
            queueMicrotask(() => queryDeadline.abort(timeout));

            return 1_000;
          },
        },
        async () => {
          sdkAttempts += 1;
          throw deadlineError();
        },
      );
    },
    { budgetMs: 2_000, onRetry: error => causes.push(error) },
  );

  assert.equal(result, 'recovered');
  assert.equal(attempts, 2);
  assert.equal(sdkAttempts, 1);
  assert.equal(causes.length, 1);
  assert.ok(causes[0] instanceof Error);
  assert.equal(causes[0].name, 'AbortError');
  assert.equal((causes[0] as NodeJS.ErrnoException).code, 'ABORT_ERR');
  assert.equal(causes[0].cause, timeout);
});

test('the shared deadline during SDK backoff does not start another application attempt', async () => {
  const { retry } = await import('@ydbjs/retry');
  let attempts = 0;
  await assert.rejects(
    retryRead(
      signal => {
        attempts += 1;

        return retry({ signal, retry: true, budget: 2, strategy: 1_000 }, async () => {
          throw deadlineError();
        });
      },
      { budgetMs: 30, onRetry: () => assert.fail('the exhausted budget must not be retried') },
    ),
    { code: 'ydb_read_budget_exhausted', retriable: true },
  );
  assert.equal(attempts, 1);
});

test('rejects a late result even when the event loop has not delivered the deadline timer', async context => {
  let now = 0;
  context.mock.method(performance, 'now', () => now);
  let signal: AbortSignal | undefined;
  await assert.rejects(
    retryRead(
      async currentSignal => {
        signal = currentSignal;
        now = 101;

        return 'late result';
      },
      { budgetMs: 100, onRetry: () => assert.fail() },
    ),
    { code: 'ydb_read_budget_exhausted' },
  );
  assert.equal(signal?.aborted, true);
});

test('permanent codes override timeout text and generic wrapper names', () => {
  for (const code of [7, 'PERMISSION_DENIED', 400020, 'BAD_REQUEST']) {
    const permanent = Object.assign(new Error('DEADLINE_EXCEEDED private details'), { name: 'ClientError', code });
    assert.equal(isTransientReadError(permanent), false);
    assert.equal(
      isTransientReadError(Object.assign(new Error('wrapper'), { name: 'ClientError', cause: permanent })),
      false,
    );
    assert.equal(
      isTransientReadError(
        Object.assign(new Error('cancelled', { cause: permanent }), { name: 'AbortError', code: 'ABORT_ERR' }),
      ),
      false,
    );
  }
  assert.equal(isTransientReadError(new DOMException('private', 'TimeoutError')), true);
  assert.equal(isTransientReadError(new DOMException('private', 'AbortError')), true);
  assert.equal(isTransientReadError(Object.assign(new Error('private'), { code: 400060 })), true);
});
