'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const test = require('node:test');

const { createInvocationLogger } = require('../build/logger');

test('writes Yandex Cloud structured JSON with request context and redaction', () => {
  const lines = [];
  const destination = { write: line => lines.push(JSON.parse(line)) };
  const logger = createInvocationLogger({ requestId: 'schedule-request-id' }, destination);

  logger.error(
    {
      event: 'fitbase_schedule_error',
      status: 503,
      payload: { token: 'must-not-leak' },
      headers: { Authorization: 'Bearer secret' },
    },
    'fitbase_schedule_error',
  );

  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, 'ERROR');
  assert.equal(lines[0].service, 'zvenfit-fitbase-schedule');
  assert.equal(lines[0].request_id, 'schedule-request-id');
  assert.equal(lines[0].event, 'fitbase_schedule_error');
  assert.equal(lines[0].message, 'fitbase_schedule_error');
  assert.equal(lines[0].payload, '[REDACTED]');
  assert.equal(lines[0].headers.Authorization, '[REDACTED]');
});
