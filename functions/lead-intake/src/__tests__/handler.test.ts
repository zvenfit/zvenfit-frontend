import assert from 'node:assert/strict';
import test from 'node:test';

import { _private } from '../handler';

import type {
  ApplicationMetrics,
  ClaimedLead,
  HandlerDependencies,
  HttpEvent,
  HttpResponse,
  LeadStore,
} from '../types';

const LEAD_ID = '1cc32f4f-8f06-4dc8-915f-92955c829523';
const DELIVERY_ID = '927c6260-678d-42d1-9293-a0ed5061c184';
const NOW = new Date('2026-08-08T12:00:00.000Z');

type StoreMock = Partial<LeadStore>;
type FailedDelivery = Parameters<LeadStore['markTelegramFailed']>[0];
type Handler = ReturnType<typeof _private.createHandler>;
type Call = [name: string, payload?: unknown];

function postEvent(overrides: Record<string, unknown> = {}): HttpEvent {
  return {
    httpMethod: 'POST',
    headers: { origin: 'https://zvenfit.ru', 'content-type': 'application/json' },
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

function claimedLead(overrides: Partial<ClaimedLead> = {}): ClaimedLead {
  return {
    leadId: LEAD_ID,
    createdAt: NOW,
    name: 'Анна',
    phone: '+7 (999) 111-22-33',
    contactMethod: 'Telegram',
    telegramUsername: '@anna',
    utm: { utm_source: 'direct' },
    telegramAttempts: 1,
    ...overrides,
  };
}

function dependencies(store: StoreMock, overrides: Partial<HandlerDependencies> = {}): Partial<HandlerDependencies> {
  return {
    loggerFactory: () => ({
      error(fields) {
        console.error(JSON.stringify(fields));
      },
    }),
    maxAttempts: () => 12,
    now: () => NOW,
    rateLimiter: async () => true,
    store: {
      async getTelegramQueueHealth() {
        return { pendingCount: 0, oldestPendingAgeSeconds: 0 };
      },
      ...store,
    } as LeadStore,
    telegramSender: async () => {},
    uuid: () => DELIVERY_ID,
    ...overrides,
  };
}

async function invokeHttp(handler: Handler, event = postEvent()): Promise<HttpResponse> {
  const result = await handler(event);
  if (!('statusCode' in result) || !('body' in result) || typeof result.body !== 'string') {
    throw new Error('expected_http_response');
  }

  return result as HttpResponse;
}

function readJson(body: string): Record<string, unknown> {
  return JSON.parse(body) as Record<string, unknown>;
}

test('POST persists a pending lead and returns before Telegram delivery', async () => {
  const calls: Call[] = [];
  const store: StoreMock = {
    async saveLead(lead) {
      calls.push(['save', lead]);

      return { created: true, telegramStatus: 'pending' };
    },
  };
  let telegramCalled = false;
  const handler = _private.createHandler(
    dependencies(store, {
      async telegramSender() {
        telegramCalled = true;
      },
    }),
  );

  const response = await invokeHttp(handler);
  const savedLead = calls[0]?.[1] as ClaimedLead;

  assert.equal(response.statusCode, 202);
  assert.deepEqual(readJson(response.body), { ok: true, lead_id: LEAD_ID, notification: 'pending' });
  assert.deepEqual(
    calls.map(call => call[0]),
    ['save'],
  );
  assert.equal(telegramCalled, false);
  assert.equal(savedLead.telegramUsername, '@anna');
  assert.deepEqual(savedLead.utm, { utm_source: 'direct' });
});

test('flushes metrics after asynchronous POST events have been recorded', async () => {
  const order: string[] = [];
  const store: StoreMock = {
    async saveLead() {
      await Promise.resolve();
      order.push('lead_saved');

      return { created: true, telegramStatus: 'pending' };
    },
  };
  const handler = _private.createHandler(
    dependencies(store, {
      loggerFactory: () => ({
        error() {},
        info() {},
      }),
      metricsFactory: () => ({
        addCounter(name) {
          order.push(`metric:${name}`);
        },
        recordGauge(name, value) {
          order.push(`gauge:${name}:${value}`);
        },
        async flush() {
          order.push('metrics_flushed');
        },
      }),
    }),
  );

  await invokeHttp(handler);

  assert.deepEqual(order, ['lead_saved', 'metric:zvenfit_leads_persisted_5m', 'metrics_flushed']);
});

test('timer keeps a persisted lead pending when Telegram is unavailable', async () => {
  let failedDelivery: FailedDelivery | undefined;
  const store: StoreMock = {
    async listTelegramCandidates() {
      return [LEAD_ID];
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
        throw Object.assign(new Error('offline'), { code: 'telegram_unreachable' });
      },
    }),
  );
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const result = await handler({
      messages: [{ event_metadata: { event_type: 'yandex.cloud.events.serverless.triggers.TimerMessage' } }],
    });

    assert.deepEqual(result, { processed: 1, sent: 0, pending: 1, failed: 0, skipped: 0 });
    assert.ok(failedDelivery);
    assert.equal(failedDelivery.errorCode, 'telegram_unreachable');
    assert.equal(failedDelivery.terminal, false);
    assert.equal(failedDelivery.failedAt.toISOString(), '2026-08-08T12:01:00.000Z');
  } finally {
    console.error = originalConsoleError;
  }
});

test('timer marks the lead failed after the Telegram retry limit', async () => {
  let failedDelivery: FailedDelivery | undefined;
  const errorLogs: string[] = [];
  const store: StoreMock = {
    async listTelegramCandidates() {
      return [LEAD_ID];
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
        throw Object.assign(new Error('offline'), { code: 'telegram_unreachable' });
      },
    }),
  );
  const originalConsoleError = console.error;
  console.error = (...data: unknown[]) => errorLogs.push(String(data[0]));

  try {
    const result = await handler({
      messages: [{ event_metadata: { event_type: 'yandex.cloud.events.serverless.triggers.TimerMessage' } }],
    });

    assert.deepEqual(result, { processed: 1, sent: 0, pending: 0, failed: 1, skipped: 0 });
    assert.ok(failedDelivery);
    assert.equal(failedDelivery.terminal, true);
    assert.equal(failedDelivery.failedAt.toISOString(), NOW.toISOString());
    assert.deepEqual(JSON.parse(errorLogs[0] ?? ''), {
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
  const store: StoreMock = {
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

test('POST returns 503 and does not call Telegram when durable storage fails', async () => {
  let telegramCalled = false;
  let metricFlushes = 0;
  const metricCounters: Array<{ name: string; value: number }> = [];
  const errorLogs: string[] = [];
  const store: StoreMock = {
    async saveLead() {
      throw new Error('database offline');
    },
  };
  const handler = _private.createHandler(
    dependencies(store, {
      metricsFactory: () =>
        ({
          addCounter(name, value = 1) {
            metricCounters.push({ name, value });
          },
          recordGauge() {},
          async flush() {
            metricFlushes += 1;
          },
        }) satisfies ApplicationMetrics,
      async telegramSender() {
        telegramCalled = true;
      },
    }),
  );
  const originalConsoleError = console.error;
  console.error = (...data: unknown[]) => errorLogs.push(String(data[0]));

  try {
    const response = await invokeHttp(handler);

    assert.equal(response.statusCode, 503);
    assert.deepEqual(readJson(response.body), { ok: false, error: 'storage_unavailable' });
    assert.equal(telegramCalled, false);
    assert.deepEqual(metricCounters, [{ name: 'zvenfit_lead_storage_errors', value: 1 }]);
    assert.equal(metricFlushes, 1);
    assert.deepEqual(JSON.parse(errorLogs[0] ?? ''), {
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
  const store: StoreMock = {
    async saveLead() {
      saved = true;
      throw new Error('unexpected_save');
    },
  };
  const handler = _private.createHandler(dependencies(store));
  const response = await invokeHttp(handler, postEvent({ submission_id: 'not-a-uuid' }));

  assert.equal(response.statusCode, 400);
  assert.deepEqual(readJson(response.body), { ok: false, error: 'invalid_submission_id' });
  assert.equal(saved, false);
});

test('POST silently accepts honeypot submissions without persisting them', async () => {
  let saved = false;
  const warnings: Record<string, unknown>[] = [];
  const store: StoreMock = {
    async saveLead() {
      saved = true;
      throw new Error('unexpected_save');
    },
  };
  const handler = _private.createHandler(
    dependencies(store, {
      loggerFactory: () => ({
        error() {},
        warn(fields) {
          warnings.push(fields);
        },
      }),
    }),
  );
  const response = await invokeHttp(handler, postEvent({ company_website: 'https://spam.example' }));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(readJson(response.body), { ok: true });
  assert.equal(saved, false);
  assert.deepEqual(warnings, [{ event: 'lead_submission_blocked', reason: 'honeypot' }]);
});

test('POST rejects oversized payloads before parsing or persistence', async () => {
  let saved = false;
  const warnings: Record<string, unknown>[] = [];
  const store: StoreMock = {
    async saveLead() {
      saved = true;
      throw new Error('unexpected_save');
    },
  };
  const handler = _private.createHandler(
    dependencies(store, {
      loggerFactory: () => ({
        error() {},
        warn(fields) {
          warnings.push(fields);
        },
      }),
    }),
  );
  const response = await invokeHttp(handler, { ...postEvent(), body: 'x'.repeat(16 * 1024 + 1) });

  assert.equal(response.statusCode, 413);
  assert.deepEqual(readJson(response.body), { ok: false, error: 'payload_too_large' });
  assert.equal(saved, false);
  assert.deepEqual(warnings, [{ event: 'lead_submission_blocked', reason: 'payload_too_large' }]);
});

test('POST rejects contact methods outside the form allowlist', async () => {
  let saved = false;
  const store: StoreMock = {
    async saveLead() {
      saved = true;
      throw new Error('unexpected_save');
    },
  };
  const handler = _private.createHandler(dependencies(store));
  const response = await invokeHttp(handler, postEvent({ service: 'Email' }));

  assert.equal(response.statusCode, 400);
  assert.deepEqual(readJson(response.body), { ok: false, error: 'invalid_contact_method' });
  assert.equal(saved, false);
});

test('POST rate-limits a source IP before persistence', async () => {
  let saved = false;
  const warnings: Record<string, unknown>[] = [];
  const store: StoreMock = {
    async saveLead() {
      saved = true;
      throw new Error('unexpected_save');
    },
  };
  const handler = _private.createHandler(
    dependencies(store, {
      loggerFactory: () => ({
        error() {},
        warn(fields) {
          warnings.push(fields);
        },
      }),
      rateLimiter: async ({ sourceIp }) => {
        assert.equal(sourceIp, '203.0.113.10');

        return false;
      },
    }),
  );
  const response = await invokeHttp(handler, {
    ...postEvent(),
    requestContext: { identity: { sourceIp: '203.0.113.10' } },
  });

  assert.equal(response.statusCode, 429);
  assert.deepEqual(readJson(response.body), { ok: false, error: 'rate_limit_exceeded' });
  assert.equal(saved, false);
  assert.deepEqual(warnings, [{ event: 'lead_submission_blocked', reason: 'rate_limit' }]);
  assert.doesNotMatch(JSON.stringify(warnings), /203\.0\.113\.10/);
});

test('POST fails open without logging the IP when the rate limiter is unavailable', async () => {
  const errors: Record<string, unknown>[] = [];
  let saved = false;
  const store: StoreMock = {
    async saveLead() {
      saved = true;

      return { created: false, telegramStatus: 'sent' };
    },
  };
  const handler = _private.createHandler(
    dependencies(store, {
      loggerFactory: () => ({
        error(fields) {
          errors.push(fields);
        },
      }),
      rateLimiter: async () => {
        throw new Error('database offline for 203.0.113.10');
      },
    }),
  );
  const response = await invokeHttp(handler, {
    ...postEvent(),
    requestContext: { identity: { sourceIp: '203.0.113.10' } },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(saved, true);
  assert.deepEqual(errors, [{ event: 'lead_rate_limit_error', error_code: 'rate_limit_unavailable' }]);
  assert.doesNotMatch(JSON.stringify(errors), /203\.0\.113\.10/);
});

test('timer retries persisted pending leads', async () => {
  const delivered: string[] = [];
  const store: StoreMock = {
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
  const result = await handler({
    messages: [{ event_metadata: { event_type: 'yandex.cloud.events.serverless.triggers.TimerMessage' } }],
  });

  assert.deepEqual(result, { processed: 1, sent: 1, pending: 0, failed: 0, skipped: 0 });
  assert.deepEqual(delivered, [LEAD_ID]);
});
