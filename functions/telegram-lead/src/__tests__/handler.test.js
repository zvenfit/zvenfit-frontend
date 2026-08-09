'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const test = require('node:test');

const { _private } = require('../../build/handler');

const LEAD_ID = '1cc32f4f-8f06-4dc8-915f-92955c829523';
const DELIVERY_ID = '927c6260-678d-42d1-9293-a0ed5061c184';
const NOW = new Date('2026-08-08T12:00:00.000Z');

function postEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: { origin: 'https://zvenfit.ru' },
    body: JSON.stringify({
      submission_id: LEAD_ID,
      name: 'Анна',
      phone: '+7 (999) 111-22-33',
      service: 'Telegram',
      telegram_username: '@anna',
      utm: { utm_source: 'direct', unknown: 'ignored' },
      ...overrides,
    }),
  };
}

function claimedLead(overrides = {}) {
  return {
    leadId: LEAD_ID,
    createdAt: NOW,
    name: 'Анна',
    phone: '+7 (999) 111-22-33',
    service: 'Telegram',
    telegramUsername: '@anna',
    utm: { utm_source: 'direct' },
    telegramAttempts: 1,
    ...overrides,
  };
}

function dependencies(store, overrides = {}) {
  return {
    loggerFactory: () => ({
      error(fields) {
        console.error(JSON.stringify(fields));
      },
    }),
    maxAttempts: () => 12,
    now: () => NOW,
    store,
    telegramSender: async () => {},
    uuid: () => DELIVERY_ID,
    ...overrides,
  };
}

test('POST persists lead before Telegram delivery and returns success', async () => {
  const calls = [];
  const store = {
    async saveLead(lead) {
      calls.push(['save', lead]);

      return { created: true, telegramStatus: 'pending' };
    },
    async claimForTelegram() {
      calls.push(['claim']);

      return claimedLead();
    },
    async markTelegramDelivered(args) {
      calls.push(['delivered', args]);
    },
  };
  const handler = _private.createHandler(
    dependencies(store, {
      async telegramSender(lead) {
        calls.push(['telegram', lead]);
      },
    }),
  );

  const response = await handler(postEvent());
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body, { ok: true, lead_id: LEAD_ID, notification: 'sent' });
  assert.deepEqual(
    calls.map(call => call[0]),
    ['save', 'claim', 'telegram', 'delivered'],
  );
  assert.equal(calls[0][1].telegramUsername, '@anna');
  assert.deepEqual(calls[0][1].utm, { utm_source: 'direct' });
});

test('POST acknowledges a persisted lead when Telegram is unavailable', async () => {
  let failedDelivery;
  const store = {
    async saveLead() {
      return { created: true, telegramStatus: 'pending' };
    },
    async claimForTelegram() {
      return claimedLead();
    },
    async markTelegramFailed(args) {
      failedDelivery = args;
    },
  };
  const handler = _private.createHandler(
    dependencies(store, {
      async telegramSender() {
        const error = new Error('offline');
        error.code = 'telegram_unreachable';
        throw error;
      },
    }),
  );
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const response = await handler(postEvent());

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { ok: true, lead_id: LEAD_ID, notification: 'pending' });
    assert.equal(failedDelivery.errorCode, 'telegram_unreachable');
    assert.equal(failedDelivery.terminal, false);
    assert.equal(failedDelivery.failedAt.toISOString(), '2026-08-08T12:01:00.000Z');
  } finally {
    console.error = originalConsoleError;
  }
});

test('POST keeps the lead and exposes failed notification after the retry limit', async () => {
  let failedDelivery;
  const errorLogs = [];
  const store = {
    async saveLead() {
      return { created: false, telegramStatus: 'pending' };
    },
    async claimForTelegram() {
      return claimedLead({ telegramAttempts: 12 });
    },
    async markTelegramFailed(args) {
      failedDelivery = args;
    },
  };
  const handler = _private.createHandler(
    dependencies(store, {
      async telegramSender() {
        const error = new Error('offline');
        error.code = 'telegram_unreachable';
        throw error;
      },
    }),
  );
  const originalConsoleError = console.error;
  console.error = message => errorLogs.push(message);

  try {
    const response = await handler(postEvent());

    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).notification, 'failed');
    assert.equal(failedDelivery.terminal, true);
    assert.equal(failedDelivery.failedAt.toISOString(), NOW.toISOString());
    assert.deepEqual(JSON.parse(errorLogs[0]), {
      event: 'telegram_delivery_failed_permanently',
      lead_id: LEAD_ID,
      error_code: 'telegram_unreachable',
      attempts: 12,
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test('POST does not resend a lead already marked as sent', async () => {
  let claimed = false;
  const store = {
    async saveLead() {
      return { created: false, telegramStatus: 'sent' };
    },
    async claimForTelegram() {
      claimed = true;

      return null;
    },
  };
  const handler = _private.createHandler(dependencies(store));

  const response = await handler(postEvent());

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).notification, 'sent');
  assert.equal(claimed, false);
});

test('POST returns 503 and does not call Telegram when durable storage fails', async () => {
  let telegramCalled = false;
  const errorLogs = [];
  const store = {
    async saveLead() {
      throw new Error('database offline');
    },
  };
  const handler = _private.createHandler(
    dependencies(store, {
      async telegramSender() {
        telegramCalled = true;
      },
    }),
  );
  const originalConsoleError = console.error;
  console.error = message => errorLogs.push(message);

  try {
    const response = await handler(postEvent());

    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), { ok: false, error: 'storage_unavailable' });
    assert.equal(telegramCalled, false);
    assert.deepEqual(JSON.parse(errorLogs[0]), {
      event: 'lead_storage_error',
      lead_id: LEAD_ID,
      error_code: 'storage_error',
      attempts: 0,
    });
  } finally {
    console.error = originalConsoleError;
  }
});

test('POST rejects malformed idempotency key before persistence', async () => {
  let saved = false;
  const store = {
    async saveLead() {
      saved = true;
    },
  };
  const handler = _private.createHandler(dependencies(store));

  const response = await handler(postEvent({ submission_id: 'not-a-uuid' }));

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { ok: false, error: 'invalid_submission_id' });
  assert.equal(saved, false);
});

test('timer retries persisted pending leads', async () => {
  const delivered = [];
  const store = {
    async listTelegramCandidates() {
      return [LEAD_ID];
    },
    async claimForTelegram() {
      return claimedLead({ telegramAttempts: 2 });
    },
    async markTelegramDelivered(args) {
      delivered.push(args.leadId);
    },
  };
  const handler = _private.createHandler(dependencies(store));
  const event = {
    messages: [
      {
        event_metadata: {
          event_type: 'yandex.cloud.events.serverless.triggers.TimerMessage',
        },
      },
    ],
  };

  const result = await handler(event);

  assert.deepEqual(result, { processed: 1, sent: 1, pending: 0, failed: 0, skipped: 0 });
  assert.deepEqual(delivered, [LEAD_ID]);
});
