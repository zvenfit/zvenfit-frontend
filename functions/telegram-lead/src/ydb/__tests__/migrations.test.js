'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const test = require('node:test');

const { MIGRATIONS } = require('../../../build/ydb/migrations');

test('lead schema migrations are ordered, unique, and append-only', () => {
  assert.deepEqual(
    MIGRATIONS.map(migration => [migration.version, migration.name]),
    [
      [1, 'create_leads_table'],
      [2, 'add_telegram_due_at'],
      [3, 'backfill_telegram_due_at'],
      [4, 'add_telegram_due_index'],
    ],
  );
  assert.equal(new Set(MIGRATIONS.map(migration => migration.version)).size, MIGRATIONS.length);
  assert.equal(
    MIGRATIONS.every(migration => typeof migration.apply === 'function'),
    true,
  );
});
