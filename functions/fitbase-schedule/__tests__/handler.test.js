'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const test = require('node:test');

const { _private } = require('../build/handler');

function getEvent() {
  return {
    httpMethod: 'GET',
    headers: { origin: 'https://zvenfit.ru' },
    queryStringParameters: {
      from: '2026-08-09',
      to: '2026-08-09',
    },
  };
}

function createTestHandler(messages) {
  return _private.createHandler({
    loggerFactory: () => ({
      error(fields, message) {
        messages.push({ fields, message });
      },
    }),
  });
}

test('logs a structured event without an API response body when Fitbase fails', async () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.FITBASE_API_TOKEN;
  const messages = [];
  const handler = createTestHandler(messages);
  process.env.FITBASE_API_TOKEN = 'test-token';
  global.fetch = async () => ({
    ok: false,
    status: 503,
    async json() {
      return { private: 'must-not-be-logged' };
    },
  });

  try {
    const result = await handler(getEvent(), { requestId: 'schedule-request-id' });

    assert.equal(result.statusCode, 502);
    assert.deepEqual(JSON.parse(result.body), { ok: false, error: 'fitbase_unreachable' });
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], {
      message: 'fitbase_schedule_error',
      fields: {
        event: 'fitbase_schedule_error',
        error_code: 'fitbase_request_failed',
        status: 503,
      },
    });
    assert.doesNotMatch(JSON.stringify(messages[0]), /must-not-be-logged/);
  } finally {
    global.fetch = originalFetch;

    if (originalToken === undefined) {
      delete process.env.FITBASE_API_TOKEN;
    } else {
      process.env.FITBASE_API_TOKEN = originalToken;
    }
  }
});

test('logs a structured event when the Fitbase token is missing', async () => {
  const originalToken = process.env.FITBASE_API_TOKEN;
  const messages = [];
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
