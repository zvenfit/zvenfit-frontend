import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { decodeBasicCredentials, handler, isAuthorized } from '../handler';

const credentials = 'zvenfit-test:correct horse battery staple with enough entropy';
const authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
const expectedHash = createHash('sha256').update(credentials).digest('hex');

test('accepts the exact HTTP Basic credentials without exposing them in context', async () => {
  process.env.BASIC_AUTH_CREDENTIAL_SHA256 = expectedHash;

  const result = await handler({ headers: { Authorization: authorization } });

  assert.deepEqual(result, {
    isAuthorized: true,
    context: { environment: 'staging' },
  });
  assert.doesNotMatch(JSON.stringify(result), /correct horse|zvenfit-test/);
});

test('compares authorization headers case-insensitively', () => {
  assert.equal(isAuthorized({ headers: { authorization } }, expectedHash), true);
});

test('fails closed for missing, malformed, incorrect, or misconfigured credentials', () => {
  const wrong = `Basic ${Buffer.from('zvenfit-test:wrong').toString('base64')}`;

  assert.equal(isAuthorized({}, expectedHash), false);
  assert.equal(isAuthorized({ headers: { Authorization: 'Bearer token' } }, expectedHash), false);
  assert.equal(isAuthorized({ headers: { Authorization: wrong } }, expectedHash), false);
  assert.equal(isAuthorized({ headers: { Authorization: authorization } }, undefined), false);
  assert.equal(isAuthorized({ headers: { Authorization: authorization } }, 'not-a-hash'), false);
});

test('rejects Basic payloads without a username/password separator', () => {
  const encoded = Buffer.from('no-separator').toString('base64');
  assert.equal(decodeBasicCredentials(`Basic ${encoded}`), null);
});
