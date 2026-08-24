import assert from 'node:assert/strict';
import test from 'node:test';

import { safeErrorFields } from '../errors';

test('extracts stable diagnostic fields without exposing the error message or stack', () => {
  const error = Object.assign(new Error('private phone +7 999 111-22-33'), {
    code: 'OVERLOADED',
    status: 503,
  });

  const fields = safeErrorFields(error, { fallbackCode: 'storage_error' });

  assert.deepEqual(
    {
      error_type: fields.error_type,
      error_code: fields.error_code,
      retriable: fields.retriable,
      upstream_status: fields.upstream_status,
    },
    {
      error_type: 'Error',
      error_code: 'OVERLOADED',
      retriable: true,
      upstream_status: 503,
    },
  );
  assert.match(String(fields.stack_fingerprint), /^[a-f0-9]{16}$/);
  assert.doesNotMatch(JSON.stringify(fields), /private phone|111-22-33|errors\.test/);
});

test('uses a safe fallback for unstructured values and honors explicit retryability', () => {
  const fields = safeErrorFields('raw private failure', {
    fallbackCode: 'notification_error',
    retriable: false,
  });

  assert.deepEqual(fields, {
    error_type: 'UnknownError',
    error_code: 'notification_error',
    retriable: false,
    upstream_status: null,
    stack_fingerprint: null,
  });
});

test('never promotes an identifier-shaped raw message into the error code', () => {
  const fields = safeErrorFields(new Error('private_token_123'), { fallbackCode: 'storage_error' });

  assert.equal(fields.error_code, 'storage_error');
  assert.doesNotMatch(JSON.stringify(fields), /private_token_123/);
});

test('derives only an allowlisted transient code from an error message', () => {
  const error = new Error('/Ydb.Discovery.V1.DiscoveryService/ListEndpoints DEADLINE_EXCEEDED: private details');
  error.name = 'ClientError';

  const fields = safeErrorFields(error, { fallbackCode: 'ydb_initialization_error' });

  assert.equal(fields.error_code, 'DEADLINE_EXCEEDED');
  assert.equal(fields.retriable, true);
  assert.doesNotMatch(JSON.stringify(fields), /private details|ListEndpoints/);
});
