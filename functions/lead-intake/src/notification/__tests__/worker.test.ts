import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandler } from '../../handler';
import { QueueReadUnavailableError } from '../queue-read-unavailable';

import type { HandlerDependencies, JsonObject } from '../../types';

const TIMER = {
  messages: [{ event_metadata: { event_type: 'yandex.cloud.events.serverless.triggers.TimerMessage' } }],
};

function fixture() {
  const logs: JsonObject[] = [];
  const gauges: string[] = [];
  let sends = 0;
  let flushes = 0;
  let delivered = false;
  const dependencies: HandlerDependencies = {
    loggerFactory: () => ({
      error: fields => logs.push(fields),
      warn: fields => logs.push(fields),
      info: fields => logs.push(fields),
    }),
    metricsFactory: () => ({
      recordGauge: name => gauges.push(name),
      async flush() {
        flushes += 1;
      },
    }),
    maxAttempts: () => 12,
    retryBatchSize: () => 5,
    now: () => new Date('2026-09-25T10:00:00Z'),
    uuid: () => 'synthetic-token',
    rateLimiter: async () => true,
    notificationSender: async () => {
      sends += 1;
    },
    store: {
      async saveLead() {
        return { created: true, telegramStatus: 'pending' };
      },
      async listTelegramCandidates() {
        return delivered ? [] : ['synthetic-lead'];
      },
      async claimForTelegram() {
        return {
          leadId: 'synthetic-lead',
          createdAt: dependencies.now(),
          name: 'Synthetic',
          phone: '70000000000',
          contactMethod: 'phone',
          telegramUsername: '',
          utm: {},
          telegramAttempts: 1,
        };
      },
      async markTelegramDelivered() {
        delivered = true;
      },
      async markTelegramFailed() {
        assert.fail('No delivery failure was expected');
      },
      async getTelegramQueueHealth() {
        return { pendingCount: delivered ? 0 : 1, oldestPendingAgeSeconds: 0 };
      },
    },
  };

  return {
    dependencies,
    logs,
    gauges,
    handler: createHandler(dependencies),
    sends: () => sends,
    flushes: () => flushes,
    delivered: () => delivered,
  };
}

test('a deferred pass leaves the durable lead available and the next pass delivers it once', async () => {
  const f = fixture();
  const list = f.dependencies.store.listTelegramCandidates;
  f.dependencies.store.listTelegramCandidates = async () => {
    throw new QueueReadUnavailableError(new Error('private'));
  };
  assert.deepEqual(await f.handler(TIMER), { deferred: true, stage: 'delivery' });
  assert.equal(f.delivered(), false);
  assert.equal(f.sends(), 0);
  assert.deepEqual(f.gauges, []);
  assert.deepEqual(f.logs, [{ event: 'retry_worker_deferred', stage: 'delivery', reason: 'queue_read_unavailable' }]);
  assert.equal(f.flushes(), 1);
  f.dependencies.store.listTelegramCandidates = list;
  await f.handler(TIMER);
  await f.handler(TIMER);
  assert.equal(f.sends(), 1);
  assert.equal(f.delivered(), true);
  assert.equal(f.logs.filter(log => log.event === 'retry_worker_completed').length, 2);
});

test('a prolonged outage emits every failed pass without inventing heartbeats or queue gauges', async () => {
  const f = fixture();
  f.dependencies.store.listTelegramCandidates = async () => {
    throw new QueueReadUnavailableError(new Error('private'));
  };
  for (let pass = 0; pass < 10; pass += 1) {
    await f.handler(TIMER);
  }
  assert.equal(f.logs.filter(log => log.event === 'retry_worker_deferred').length, 10);
  assert.deepEqual(f.gauges, []);
  assert.equal(f.flushes(), 10);
  assert.equal(f.sends(), 0);
  assert.equal(f.delivered(), false);
});

test('a failed health read does not undo delivery or send the notification again', async () => {
  const f = fixture();
  const health = f.dependencies.store.getTelegramQueueHealth;
  f.dependencies.store.getTelegramQueueHealth = async () => {
    throw new QueueReadUnavailableError(new Error('private'));
  };
  assert.deepEqual(await f.handler(TIMER), { deferred: true, stage: 'queue_health' });
  assert.equal(f.delivered(), true);
  assert.deepEqual(f.gauges, []);
  f.dependencies.store.getTelegramQueueHealth = health;
  await f.handler(TIMER);
  assert.equal(f.sends(), 1);
});

test('an unknown timer failure still rejects and flushes metrics', async () => {
  const f = fixture();
  const error = new TypeError('unknown');
  f.dependencies.store.listTelegramCandidates = async () => {
    throw error;
  };
  await assert.rejects(f.handler(TIMER), candidate => candidate === error);
  assert.deepEqual(f.logs, []);
  assert.deepEqual(f.gauges, []);
  assert.equal(f.flushes(), 1);
});

test('a delivery write failure keeps its critical event and is never classified as a deferred read', async () => {
  const f = fixture();
  f.dependencies.store.claimForTelegram = async () => {
    throw Object.assign(new Error('private'), { code: 4 });
  };
  await f.handler(TIMER);
  assert.equal(f.logs.filter(log => log.event === 'telegram_delivery_retry_error').length, 1);
  assert.equal(
    f.logs.some(log => log.event === 'retry_worker_deferred'),
    false,
  );
  assert.equal(f.delivered(), false);
  assert.equal(f.sends(), 0);
});
