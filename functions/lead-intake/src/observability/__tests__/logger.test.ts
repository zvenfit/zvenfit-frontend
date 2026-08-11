import assert from 'node:assert/strict';
import test from 'node:test';

import { createInvocationLogger } from '../logger';

interface LogRecord extends Record<string, unknown> {
  context: { token: unknown };
}

test('writes Yandex Cloud structured JSON and redacts lead PII and secrets', () => {
  const lines: LogRecord[] = [];
  const destination = { write: (line: string) => lines.push(JSON.parse(line) as LogRecord) };
  const logger = createInvocationLogger({ requestId: 'lead-request-id' }, destination);

  logger.error(
    {
      event: 'lead_storage_error',
      lead_id: 'safe-technical-id',
      name: 'Анна',
      phone: '+7 999 111-22-33',
      utm: { utm_source: 'secret-campaign' },
      token: 'secret-token',
      sourceIp: '203.0.113.10',
      rate_key: 'hashed-rate-key',
      context: { token: { access_token: 'iam-secret' } },
    },
    'lead_storage_error',
  );

  const record = lines[0];
  assert.ok(record);
  assert.deepEqual(
    {
      level: record.level,
      application: record.application,
      environment: record.environment,
      service: record.service,
      request_id: record.request_id,
      event: record.event,
      lead_id: record.lead_id,
      message: record.message,
    },
    {
      level: 'ERROR',
      application: 'zvenfit-frontend',
      environment: 'production',
      service: 'zvenfit-lead-intake',
      request_id: 'lead-request-id',
      event: 'lead_storage_error',
      lead_id: 'safe-technical-id',
      message: 'lead_storage_error',
    },
  );
  assert.equal(record.name, '[REDACTED]');
  assert.equal(record.phone, '[REDACTED]');
  assert.equal(record.utm, '[REDACTED]');
  assert.equal(record.token, '[REDACTED]');
  assert.equal(record.sourceIp, '[REDACTED]');
  assert.equal(record.rate_key, '[REDACTED]');
  assert.equal(record.context.token, '[REDACTED]');
  assert.equal('pid' in record, false);
  assert.equal('hostname' in record, false);
});
