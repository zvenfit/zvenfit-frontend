import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseUtcTimestamp } from '../time';

test('interprets the CDN timestamp format as UTC', () => {
  assert.equal(parseUtcTimestamp('2026-08-14 10:15:30.125')?.toISOString(), '2026-08-14T10:15:30.125Z');
});

test('keeps RFC3339 timestamps and rejects invalid values', () => {
  assert.equal(parseUtcTimestamp('2026-08-14T10:15:30.125Z')?.toISOString(), '2026-08-14T10:15:30.125Z');
  assert.equal(parseUtcTimestamp('not-a-timestamp'), null);
});
