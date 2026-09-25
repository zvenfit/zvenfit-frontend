import assert from 'node:assert/strict';
import test from 'node:test';

import { QueueReadUnavailableError } from '../../notification/queue-read-unavailable';
import { readQueue } from '../queue-read';

test('translates only positively identified temporary read failures to the storage port', async () => {
  const errors = [
    Object.assign(new Error('private'), { code: 4 }),
    Object.assign(new Error('private'), { code: 'UNAVAILABLE' }),
    Object.assign(new Error('private'), { code: 400060 }),
    new DOMException('private', 'TimeoutError'),
    Object.assign(new Error('budget'), { code: 'ydb_read_budget_exhausted' }),
  ];
  for (const error of errors) {
    await assert.rejects(
      readQueue(async () => {
        throw error;
      }),
      candidate => candidate instanceof QueueReadUnavailableError && candidate.cause === error,
    );
  }
  assert.equal(await readQueue(async () => 'healthy'), 'healthy');
});

test('unknown, permanent, and ambiguous errors remain visible as runtime failures', async () => {
  const permanent = Object.assign(new Error('DEADLINE_EXCEEDED'), { code: 'PERMISSION_DENIED' });
  const unknown = Object.assign(new Error('DEADLINE_EXCEEDED'), { name: 'ClientError' });
  for (const error of [
    permanent,
    unknown,
    new TypeError('bug'),
    Object.assign(new Error('wrapper', { cause: permanent }), { name: 'TimeoutError' }),
    Object.assign(new Error('budget', { cause: unknown }), { code: 'ydb_read_budget_exhausted' }),
  ]) {
    await assert.rejects(
      readQueue(async () => {
        throw error;
      }),
      candidate => candidate === error,
    );
  }
});
