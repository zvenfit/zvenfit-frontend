import assert from 'node:assert/strict';
import test from 'node:test';

import { MIGRATIONS, _private } from '../migrations';

test('lead schema migrations are ordered, unique, and append-only', () => {
  assert.deepEqual(
    MIGRATIONS.map(migration => [migration.version, migration.name]),
    [
      [1, 'create_lead_storage'],
      [2, 'add_telegram_queue_health_index'],
    ],
  );
  assert.equal(new Set(MIGRATIONS.map(migration => migration.version)).size, MIGRATIONS.length);
  assert.equal(
    MIGRATIONS.every(migration => typeof migration.apply === 'function'),
    true,
  );
});

test('lead rows do not expire, while technical rate-limit counters do', () => {
  const leadsSchema = _private.createLeadsTable.toString();
  const queueHealthIndexMigration = _private.createQueueHealthIndex.toString();
  const rateLimitsSchema = _private.createRateLimitsTable.toString();

  assert.doesNotMatch(leadsSchema, /\bexpires_at\b/);
  assert.doesNotMatch(leadsSchema, /\bTTL\b/);
  assert.match(rateLimitsSchema, /\bexpires_at\b/);
  assert.match(rateLimitsSchema, /\bTTL\b/);
  assert.match(leadsSchema, /idx_telegram_status_created/);
  assert.match(queueHealthIndexMigration, /queueHealthIndex/);
});
