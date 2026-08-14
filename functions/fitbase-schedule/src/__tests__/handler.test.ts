import assert from 'node:assert/strict';
import test from 'node:test';

import { _private } from '../handler';
import { createFitbaseProvider } from '../providers/fitbase-provider';

import type { HttpEvent, JsonObject, ScheduleProviderFactory } from '../types';

interface CapturedLog {
  fields: JsonObject;
  message?: string;
}

function getEvent(): HttpEvent {
  return {
    httpMethod: 'GET',
    headers: { origin: 'https://zvenfit.ru' },
    queryStringParameters: { from: '2026-08-09', to: '2026-08-09' },
  };
}

function createTestHandler(
  messages: CapturedLog[],
  providerFactory: ScheduleProviderFactory = () => createFitbaseProvider(process.env),
) {
  return _private.createHandler({
    failurePolicy: {
      misconfiguredEvent: 'fitbase_schedule_misconfigured',
      unavailableError: 'fitbase_unreachable',
      unavailableEvent: 'fitbase_schedule_error',
    },
    loggerFactory: () => ({
      error(fields, message) {
        messages.push({ fields, message });
      },
    }),
    providerFactory,
  });
}

test('logs a structured event without an API response body when Fitbase fails', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.FITBASE_API_TOKEN;
  const messages: CapturedLog[] = [];
  const handler = createTestHandler(messages);
  process.env.FITBASE_API_TOKEN = 'test-token';
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ private: 'must-not-be-logged' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const result = await handler(getEvent(), { requestId: 'schedule-request-id' });

    assert.equal(result.statusCode, 502);
    assert.deepEqual(JSON.parse(result.body), { ok: false, error: 'fitbase_unreachable' });
    assert.deepEqual(messages, [
      {
        message: 'fitbase_schedule_error',
        fields: {
          event: 'fitbase_schedule_error',
          error_code: 'fitbase_request_failed',
          status: 503,
        },
      },
    ]);
    assert.doesNotMatch(JSON.stringify(messages[0]), /must-not-be-logged/);
  } finally {
    globalThis.fetch = originalFetch;

    if (originalToken === undefined) {
      delete process.env.FITBASE_API_TOKEN;
    } else {
      process.env.FITBASE_API_TOKEN = originalToken;
    }
  }
});

test('keeps the production Fitbase misconfiguration event backward compatible', async () => {
  const originalToken = process.env.FITBASE_API_TOKEN;
  const messages: CapturedLog[] = [];
  const handler = createTestHandler(messages);
  delete process.env.FITBASE_API_TOKEN;

  try {
    const result = await handler(getEvent());

    assert.equal(result.statusCode, 500);
    assert.deepEqual(messages[0], {
      message: 'fitbase_schedule_misconfigured',
      fields: {
        event: 'fitbase_schedule_misconfigured',
        error_code: 'fitbase_schedule_misconfigured',
        status: null,
      },
    });
  } finally {
    if (originalToken !== undefined) {
      process.env.FITBASE_API_TOKEN = originalToken;
    }
  }
});

test('uses the injected failure policy without inspecting a provider subtype', async () => {
  const messages: CapturedLog[] = [];
  const handler = _private.createHandler({
    failurePolicy: {
      misconfiguredEvent: 'staging_schedule_misconfigured',
      unavailableError: 'schedule_unavailable',
      unavailableEvent: 'staging_schedule_error',
    },
    loggerFactory: () => ({
      error(fields, message) {
        messages.push({ fields, message });
      },
    }),
    providerFactory: () => {
      throw new Error('not configured');
    },
  });

  const result = await handler(getEvent());

  assert.equal(result.statusCode, 500);
  assert.deepEqual(messages[0], {
    message: 'staging_schedule_misconfigured',
    fields: {
      event: 'staging_schedule_misconfigured',
      error_code: 'staging_schedule_misconfigured',
      status: null,
    },
  });
});

test('serves the provider contract without requiring Fitbase credentials', async () => {
  const messages: CapturedLog[] = [];
  const handler = _private.createHandler({
    failurePolicy: {
      misconfiguredEvent: 'staging_schedule_misconfigured',
      unavailableError: 'schedule_unavailable',
      unavailableEvent: 'staging_schedule_error',
    },
    loggerFactory: () => ({
      error(fields, message) {
        messages.push({ fields, message });
      },
    }),
    providerFactory: () => ({
      async getSchedule(from, to) {
        return [
          {
            id: 'fixture-item',
            date: from,
            timeStart: '09:00',
            timeEnd: '10:00',
            duration: 60,
            title: 'Тестовое занятие',
            description: '',
            color: '#00d10e',
            trainers: [],
            place: '',
            club: 'ZvenFit Staging',
            type: 'group',
            ageType: 'adult',
            cancelled: false,
            registrationClosed: false,
            registrationRequired: false,
            maxParticipants: null,
            transfer: null,
          },
        ].filter(item => item.date <= to);
      },
    }),
  });

  const result = await handler(getEvent());
  const payload = JSON.parse(result.body);

  assert.equal(result.statusCode, 200);
  assert.equal(payload.count, 1);
  assert.equal(payload.items[0].id, 'fixture-item');
  assert.deepEqual(messages, []);
});
