import assert from 'node:assert/strict';
import test from 'node:test';

import { _private } from '../handler';

import type { ClaimedLead, HandlerDependencies, HttpResponse, LeadStore } from '../types';

const LEAD_ID = '1cc32f4f-8f06-4dc8-915f-92955c829523';
const now = new Date('2026-10-14T12:00:00Z');
function claimedLead(): ClaimedLead {
  return {
    leadId: LEAD_ID,
    createdAt: now,
    name: 'Test',
    phone: '+70000000000',
    contactMethod: 'Позвонить',
    telegramUsername: '',
    utm: {},
    telegramAttempts: 1,
  };
}
function dependencies(store: Partial<LeadStore>, overrides: Partial<HandlerDependencies> = {}): HandlerDependencies {
  return {
    loggerFactory: () => ({ error() {}, info() {} }),
    maxAttempts: () => 12,
    metricsFactory: () => ({ recordGauge() {}, async flush() {} }),
    notificationSender: async () => {},
    now: () => now,
    rateLimiter: async () => true,
    retryBatchSize: () => 5,
    uuid: () => '927c6260-678d-42d1-9293-a0ed5061c184',
    store: {
      async getTelegramQueueHealth() {
        return { pendingCount: 0, oldestPendingAgeSeconds: 0 };
      },
      ...store,
    } as LeadStore,
    ...overrides,
  };
}
async function invokeHttp(handler: ReturnType<typeof _private.createHandler>): Promise<HttpResponse> {
  return (await handler({
    httpMethod: 'POST',
    headers: { origin: 'https://zvenfit.ru', 'content-type': 'application/json' },
    body: JSON.stringify({ submission_id: LEAD_ID, name: 'Test', phone: '+70000000000', service: 'Позвонить' }),
  })) as HttpResponse;
}
const readJson = (body: string): Record<string, unknown> => JSON.parse(body);

test('POST saves before sending and a concurrent timer cannot claim the same lead', async () => {
  const order: string[] = [];
  let claimed = false;
  const handler = _private.createHandler(
    dependencies(
      {
        async saveLead() {
          order.push('save');

          return { created: true, telegramStatus: 'pending' };
        },
        async claimForTelegram({ signal }) {
          if (claimed) {
            return null;
          }
          assert.ok(signal);
          claimed = true;
          order.push('claim');

          return claimedLead();
        },
        async listTelegramCandidates() {
          return [LEAD_ID];
        },
        async markTelegramDelivered() {
          order.push('mark');
        },
      },
      {
        async notificationSender(_lead, options) {
          assert.ok(options?.signal);
          order.push('send');
          const timer = await handler({
            messages: [{ event_metadata: { event_type: 'yandex.cloud.events.serverless.triggers.TimerMessage' } }],
          });
          assert.ok('skipped' in timer);
          assert.equal(timer.skipped, 1);
        },
        metricsFactory: () => ({
          recordGauge() {},
          async flush() {
            order.push('flush');
          },
        }),
      },
    ),
  );
  const response = await invokeHttp(handler);
  assert.equal(response.statusCode, 200);
  assert.equal(readJson(response.body).notification, 'sent');
  assert.deepEqual(order, ['save', 'claim', 'send', 'flush', 'mark', 'flush']);
});

test('delivery failures after saving never turn an accepted form into HTTP 503', async t => {
  for (const stage of ['claim', 'send', 'mark'] as const) {
    await t.test(stage, async () => {
      let saved = false;
      let retryScheduled = false;
      const handler = _private.createHandler(
        dependencies(
          {
            async saveLead() {
              saved = true;

              return { created: true, telegramStatus: 'pending' };
            },
            async claimForTelegram() {
              if (stage === 'claim') {
                throw new Error('claim unavailable');
              }

              return claimedLead();
            },
            async markTelegramDelivered() {
              if (stage === 'mark') {
                throw new Error('write unavailable');
              }
            },
            async markTelegramFailed() {
              retryScheduled = true;
            },
          },
          {
            loggerFactory: () => ({ error() {} }),
            async notificationSender() {
              if (stage === 'send') {
                throw new Error('telegram unavailable');
              }
            },
          },
        ),
      );
      const response = await invokeHttp(handler);
      assert.equal(saved, true);
      assert.equal(response.statusCode, 202);
      assert.equal(readJson(response.body).ok, true);
      assert.equal(retryScheduled, stage !== 'claim');
    });
  }
});

test('reposting a pending lead does not bypass its retry schedule', async () => {
  let claims = 0;
  const handler = _private.createHandler(
    dependencies({
      async saveLead() {
        return { created: false, telegramStatus: 'pending' };
      },
      async claimForTelegram() {
        claims++;

        return claimedLead();
      },
    }),
  );
  assert.equal((await invokeHttp(handler)).statusCode, 202);
  assert.equal(claims, 0);
});

test('POST does not resend a lead already marked as sent', async () => {
  let claimed = false;
  const store: Partial<LeadStore> = {
    async saveLead() {
      return { created: false, telegramStatus: 'sent' };
    },
    async claimForTelegram() {
      claimed = true;

      return null;
    },
  };
  const response = await invokeHttp(_private.createHandler(dependencies(store)));

  assert.equal(readJson(response.body).notification, 'sent');
  assert.equal(claimed, false);
});
