import assert from 'node:assert/strict';
import test from 'node:test';

import { _private } from '../handler';

import type { LeadStore } from '../types';

test('timer exports queue health and heartbeat after a successful retry pass', async () => {
  const gauges: Array<{ name: string; value: number }> = [];
  const handler = _private.createHandler({
    loggerFactory: () => ({ error() {} }),
    metricsFactory: () => ({
      addCounter() {},
      recordGauge(name, value) {
        gauges.push({ name, value });
      },
      async flush() {},
    }),
    now: () => new Date('2026-08-08T12:00:00.000Z'),
    store: {
      async saveLead() {
        throw new Error('not_used');
      },
      async claimForTelegram() {
        return null;
      },
      async markTelegramDelivered() {},
      async markTelegramFailed() {},
      async listTelegramCandidates() {
        return [];
      },
      async getTelegramQueueHealth() {
        return { pendingCount: 2, oldestPendingAgeSeconds: 901 };
      },
    } satisfies LeadStore,
  });

  const result = await handler({
    messages: [{ event_metadata: { event_type: 'yandex.cloud.events.serverless.triggers.TimerMessage' } }],
  });

  assert.deepEqual(result, { processed: 0, sent: 0, pending: 0, failed: 0, skipped: 0 });
  assert.deepEqual(gauges, [
    { name: 'zvenfit_telegram_pending_leads', value: 2 },
    { name: 'zvenfit_telegram_oldest_pending_age_seconds', value: 901 },
    { name: 'zvenfit_retry_worker_heartbeat', value: 1 },
  ]);
});
