import assert from 'node:assert/strict';
import test from 'node:test';

import { _private } from '../handler';

import type { HandlerDependencies, HttpEvent, LeadStore } from '../types';

const LEAD_ID = '1cc32f4f-8f06-4dc8-915f-92955c829523';

function postEvent(): HttpEvent {
  return {
    httpMethod: 'POST',
    headers: { origin: 'https://zvenfit.ru', 'content-type': 'application/json' },
    body: JSON.stringify({
      submission_id: LEAD_ID,
      name: 'Анна',
      phone: '+7 (999) 111-22-33',
      service: 'Telegram',
      telegram_username: '@anna',
    }),
  };
}

test('POST rejects CSRF and non-JSON requests before persistence', async () => {
  let saved = false;
  const store = {
    async saveLead() {
      saved = true;
      throw new Error('unexpected_save');
    },
  } as Partial<LeadStore> as LeadStore;
  const handler = _private.createHandler({
    loggerFactory: () => ({ error() {} }),
    maxAttempts: () => 12,
    metricsFactory: () => ({ recordGauge() {}, async flush() {} }),
    notificationSender: async () => {},
    now: () => new Date('2026-08-08T12:00:00.000Z'),
    rateLimiter: async () => true,
    retryBatchSize: () => 5,
    store,
    uuid: () => '927c6260-678d-42d1-9293-a0ed5061c184',
  } satisfies HandlerDependencies);
  const cases: Array<[Record<string, string>, number, string]> = [
    [{ origin: '' }, 403, 'origin_not_allowed'],
    [{ origin: 'https://attacker.example' }, 403, 'origin_not_allowed'],
    [{ 'content-type': 'text/plain' }, 415, 'unsupported_media_type'],
  ];

  for (const [headers, status, error] of cases) {
    const event = postEvent();
    event.headers = { ...event.headers, ...headers };
    const response = await handler(event);
    assert.equal('statusCode' in response && response.statusCode, status);
    assert.ok('body' in response && typeof response.body === 'string');
    assert.deepEqual(JSON.parse(response.body), { ok: false, error });
  }

  assert.equal(saved, false);
});
