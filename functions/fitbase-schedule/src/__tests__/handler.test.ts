import assert from 'node:assert/strict';
import test from 'node:test';

import { _private } from '../handler';

import type { HttpEvent, JsonObject } from '../types';

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

function createTestHandler(messages: CapturedLog[]) {
  return _private.createHandler({
    loggerFactory: () => ({
      error(fields, message) {
        messages.push({ fields, message });
      },
    }),
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

test('logs a structured event when the Fitbase token is missing', async () => {
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
