import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { memoryLogger, recordByEvent } from '../../observability/__tests__/ydb-test-helpers';
import { runReadOnlyYdbOperation } from '../read-operation';

for (const recovers of [true, false]) {
  const outcome = recovers ? 'recovers three session deadlines' : 'cancels a read at its deadline';
  test(`real SDK ${outcome} while an independent write commits on the same pool`, async context => {
    context.mock.method(Math, 'random', () => 0);
    const { query } = await import('@ydbjs/query');
    const { StatusIds_StatusCode } = await import('@ydbjs/api/operation');
    const success = StatusIds_StatusCode.SUCCESS;
    let creates = 0;
    let readCreates = 0;
    let commits = 0;
    let rollbacks = 0;
    let inserted = false;
    let persisted = false;
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>(resolve => {
      releaseWrite = resolve;
    });
    let writeOpened!: () => void;
    const writeReady = new Promise<void>(resolve => {
      writeOpened = resolve;
    });
    const writeController = new AbortController();
    const client = {
      async createSession(_request: unknown, { signal }: { signal: AbortSignal }) {
        creates += 1;
        // The first session belongs to the independent transaction. The read
        // must acquire another session; reproduce the three ~500 ms failures.
        if (creates > 1) {
          readCreates += 1;
          if (readCreates <= 3) {
            await delay(500, undefined, { signal });
            throw Object.assign(new Error('synthetic session deadline'), { name: 'ClientError', code: 4 });
          }
        }

        return { status: success, sessionId: `session-${creates}`, nodeId: 1n };
      },
      async *attachSession(_request: unknown, { signal }: { signal: AbortSignal }) {
        yield { status: success };
        await new Promise<void>(resolve => {
          if (signal.aborted) {
            resolve();
          } else {
            signal.addEventListener('abort', () => resolve(), { once: true });
          }
        });
      },
      async beginTransaction() {
        return { status: success, txMeta: { id: 'synthetic-write' } };
      },
      async *executeQuery(request: { query: { value: { text: string } } }) {
        if (request.query.value.text.includes('INSERT')) {
          inserted = true;
        }
        yield { status: success };
      },
      async commitTransaction() {
        commits += 1;
        persisted = inserted;

        return { status: success };
      },
      async rollbackTransaction() {
        rollbacks += 1;

        return { status: success };
      },
      async deleteSession() {
        return { status: success };
      },
    };
    const driver = { identity: {}, async ready() {}, createClient: () => client };
    const sql = query(driver as unknown as Parameters<typeof query>[0], { poolOptions: { maxSize: 2 } });
    const logger = memoryLogger();
    const write = sql.begin({ idempotent: true, signal: writeController.signal }, async tx => {
      writeOpened();
      await writeGate;
      await tx`INSERT INTO synthetic_leads (lead_id) VALUES ('synthetic');`;
    });
    try {
      await writeReady;
      const read = runReadOnlyYdbOperation(
        'list_telegram_candidates',
        logger,
        async () => sql,
        async (prepared, signal) => prepared`SELECT 1;`.idempotent(true).signal(signal).timeout(10_000),
        recovers ? 10_000 : 100,
      );
      if (recovers) {
        assert.deepEqual(await read, []);
        assert.equal(readCreates, 4);
        assert.equal(recordByEvent(logger.records, 'ydb_retry').retry_attempts, 3);
        assert.equal(recordByEvent(logger.records, 'ydb_retry').phase, 'session_create');
        assert.equal(
          logger.records.some(record => record.event === 'ydb_operation_failed'),
          false,
        );
      } else {
        await assert.rejects(read, { code: 'ydb_read_budget_exhausted' });
        assert.equal(readCreates, 1);
        assert.equal(recordByEvent(logger.records, 'ydb_operation_failed').phase, 'session_create');
        assert.equal(
          logger.records.some(record => record.event === 'ydb_retry'),
          false,
        );
      }
      assert.equal(writeController.signal.aborted, false);
      releaseWrite();
      await write;
      assert.equal(persisted, true);
      assert.equal(commits, 1);
      assert.equal(rollbacks, 0);
      // Both operations released their sessions and left the shared pool usable.
      await sql`SELECT 1;`.idempotent(true).timeout(1_000);
      assert.equal(creates, recovers ? 5 : 2);
    } finally {
      releaseWrite();
      await write.catch(() => {});
      await sql[Symbol.asyncDispose]();
    }
  });
}
