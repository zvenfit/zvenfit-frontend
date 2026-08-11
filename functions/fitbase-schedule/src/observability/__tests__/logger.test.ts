import assert from 'node:assert/strict';
import test from 'node:test';

import { createInvocationLogger } from '../logger';

interface LogRecord extends Record<string, unknown> {
  headers: Record<string, unknown>;
}

test('writes Yandex Cloud structured JSON with request context and redaction', () => {
  const lines: LogRecord[] = [];
  const destination = {
    write(line: string) {
      lines.push(JSON.parse(line) as LogRecord);
    },
  };
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

  const record = lines[0];
  assert.ok(record);
  assert.equal(record.level, 'ERROR');
  assert.equal(record.application, 'zvenfit-frontend');
  assert.equal(record.environment, 'production');
  assert.equal(record.service, 'zvenfit-fitbase-schedule');
  assert.equal(record.request_id, 'schedule-request-id');
  assert.equal(record.event, 'fitbase_schedule_error');
  assert.equal(record.message, 'fitbase_schedule_error');
  assert.equal(record.payload, '[REDACTED]');
  assert.equal(record.headers.Authorization, '[REDACTED]');
});
