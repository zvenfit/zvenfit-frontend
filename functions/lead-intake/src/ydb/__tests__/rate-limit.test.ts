import assert from 'node:assert/strict';
import test from 'node:test';

import { _private } from '../rate-limit';

test('rate-limit key is stable inside a window and never contains the source IP', () => {
  const first = _private.rateKey('203.0.113.10', new Date('2026-08-10T10:01:00.000Z'), 600, 'test-secret');
  const sameWindow = _private.rateKey('203.0.113.10', new Date('2026-08-10T10:09:59.999Z'), 600, 'test-secret');
  const nextWindow = _private.rateKey('203.0.113.10', new Date('2026-08-10T10:10:00.000Z'), 600, 'test-secret');
  const otherIp = _private.rateKey('203.0.113.11', new Date('2026-08-10T10:01:00.000Z'), 600, 'test-secret');

  assert.equal(first, sameWindow);
  assert.notEqual(first, nextWindow);
  assert.notEqual(first, otherIp);
  assert.doesNotMatch(first, /203\.0\.113\.10/);
});

test('only a duplicate-key precondition error marks a rate-limit slot as occupied', () => {
  assert.equal(_private.isOccupiedSlotError({ code: 400120 }), true);
  assert.equal(_private.isOccupiedSlotError({ code: 400090 }), false);
  assert.equal(_private.isOccupiedSlotError(new Error('PRECONDITION_FAILED')), false);
});

test('rate-limit settings use safe defaults and require a secret', () => {
  const originalSecret = process.env.LEAD_RATE_LIMIT_SECRET;
  const originalMax = process.env.LEAD_RATE_LIMIT_MAX;
  const originalWindow = process.env.LEAD_RATE_LIMIT_WINDOW_SECONDS;

  try {
    process.env.LEAD_RATE_LIMIT_SECRET = 'test-secret-that-is-at-least-32-bytes';
    delete process.env.LEAD_RATE_LIMIT_MAX;
    delete process.env.LEAD_RATE_LIMIT_WINDOW_SECONDS;

    assert.deepEqual(_private.settings(), {
      maxRequests: 5,
      windowSeconds: 600,
      secret: 'test-secret-that-is-at-least-32-bytes',
    });

    delete process.env.LEAD_RATE_LIMIT_SECRET;
    assert.throws(() => _private.settings(), /lead_rate_limit_secret_missing/);
  } finally {
    if (originalSecret === undefined) {
      delete process.env.LEAD_RATE_LIMIT_SECRET;
    } else {
      process.env.LEAD_RATE_LIMIT_SECRET = originalSecret;
    }
    if (originalMax === undefined) {
      delete process.env.LEAD_RATE_LIMIT_MAX;
    } else {
      process.env.LEAD_RATE_LIMIT_MAX = originalMax;
    }
    if (originalWindow === undefined) {
      delete process.env.LEAD_RATE_LIMIT_WINDOW_SECONDS;
    } else {
      process.env.LEAD_RATE_LIMIT_WINDOW_SECONDS = originalWindow;
    }
  }
});
