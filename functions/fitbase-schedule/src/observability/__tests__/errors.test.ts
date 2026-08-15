import assert from 'node:assert/strict';
import test from 'node:test';

import { safeErrorFields } from '../errors';

test('returns bounded error diagnostics without raw upstream content', () => {
  const error = Object.assign(new Error('private upstream response'), {
    code: 'fitbase_request_failed',
    status: 502,
  });

  const fields = safeErrorFields(error, { fallbackCode: 'fitbase_schedule_error', retriable: true });

  assert.deepEqual(
    {
      error_type: fields.error_type,
      error_code: fields.error_code,
      retriable: fields.retriable,
      upstream_status: fields.upstream_status,
    },
    {
      error_type: 'Error',
      error_code: 'fitbase_request_failed',
      retriable: true,
      upstream_status: 502,
    },
  );
  assert.match(String(fields.stack_fingerprint), /^[a-f0-9]{16}$/);
  assert.doesNotMatch(JSON.stringify(fields), /private upstream|errors\.test/);
});

test('does not use an identifier-shaped upstream message as a diagnostic code', () => {
  const fields = safeErrorFields(new Error('private_token_123'), {
    fallbackCode: 'fitbase_schedule_error',
    retriable: true,
  });

  assert.equal(fields.error_code, 'fitbase_schedule_error');
  assert.doesNotMatch(JSON.stringify(fields), /private_token_123/);
});
