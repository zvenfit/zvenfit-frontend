'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const test = require('node:test');

const { createInvocationLogger } = require('../logger');

test('writes Yandex Cloud structured JSON and redacts lead PII and secrets', () => {
  const lines = [];
  const destination = { write: line => lines.push(JSON.parse(line)) };
  const logger = createInvocationLogger({ requestId: 'lead-request-id' }, destination);

  logger.error(
    {
      event: 'lead_storage_error',
      lead_id: 'safe-technical-id',
      name: 'Анна',
      phone: '+7 999 111-22-33',
      utm: { utm_source: 'secret-campaign' },
      token: 'secret-token',
      context: { token: { access_token: 'iam-secret' } },
    },
    'lead_storage_error',
  );

  assert.equal(lines.length, 1);
  assert.deepEqual(
    {
      level: lines[0].level,
      service: lines[0].service,
      request_id: lines[0].request_id,
      event: lines[0].event,
      lead_id: lines[0].lead_id,
      message: lines[0].message,
    },
    {
      level: 'ERROR',
      service: 'zvenfit-telegram-lead',
      request_id: 'lead-request-id',
      event: 'lead_storage_error',
      lead_id: 'safe-technical-id',
      message: 'lead_storage_error',
    },
  );
  assert.equal(lines[0].name, '[REDACTED]');
  assert.equal(lines[0].phone, '[REDACTED]');
  assert.equal(lines[0].utm, '[REDACTED]');
  assert.equal(lines[0].token, '[REDACTED]');
  assert.equal(lines[0].context.token, '[REDACTED]');
  assert.equal('pid' in lines[0], false);
  assert.equal('hostname' in lines[0], false);
});
