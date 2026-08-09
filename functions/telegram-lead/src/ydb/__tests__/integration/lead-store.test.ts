import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createYdbClient } from '../../client';
import { migrationTableName, queryTimeoutMs } from '../../config';
import * as leadStore from '../../lead-store';
import { runMigrations } from '../../migrations';

import type { ClaimedLead, Lead, YdbSql } from '../../../types';

const TEST_CONNECTION_STRING = process.env.YDB_TEST_CONNECTION_STRING;

function lead(leadId: string, createdAt: Date): Lead {
  return {
    leadId,
    createdAt,
    name: 'Integration test',
    phone: '+7 000 000-00-00',
    service: 'Позвонить',
    telegramUsername: '',
    utm: { utm_source: 'integration' },
  };
}

async function dropTable(sql: YdbSql, name: string): Promise<void> {
  try {
    await sql`DROP TABLE ${sql.identifier(name)};`.timeout(queryTimeoutMs());
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('NOT_FOUND')) {
      throw error;
    }
  }
}

test(
  'YDB migrations, idempotency, indexed queue, claim lease, and delivery token work together',
  { skip: !TEST_CONNECTION_STRING },
  async () => {
    if (!TEST_CONNECTION_STRING) {
      return;
    }

    const originalConnectionString = process.env.YDB_CONNECTION_STRING;
    const originalTable = process.env.YDB_LEADS_TABLE;
    const table = `leads_it_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

    process.env.YDB_CONNECTION_STRING = TEST_CONNECTION_STRING;
    process.env.YDB_LEADS_TABLE = table;

    try {
      assert.deepEqual(await runMigrations({ log: { info() {} } }), [1, 2, 3, 4]);
      assert.deepEqual(await runMigrations({ log: { info() {} } }), []);

      const migrationClient = await createYdbClient();
      try {
        const migrationsTable = migrationClient.sql.identifier(migrationTableName());
        await migrationClient.sql`
          DELETE FROM ${migrationsTable}
          WHERE version = ${new migrationClient.types.Uint32(2)} OR version = ${new migrationClient.types.Uint32(4)};
        `.timeout(queryTimeoutMs());
      } finally {
        await migrationClient.close();
      }

      assert.deepEqual(await runMigrations({ log: { info() {} } }), [2, 4]);
      assert.deepEqual(await runMigrations({ log: { info() {} } }), []);

      const now = new Date();
      const leadId = randomUUID();
      const saved = await Promise.all([leadStore.saveLead(lead(leadId, now)), leadStore.saveLead(lead(leadId, now))]);

      assert.deepEqual(saved.map(result => result.created).sort(), [false, true]);
      assert.deepEqual(await leadStore.listTelegramCandidates({ now, limit: 10 }), [leadId]);

      const leaseUntil = new Date(now.getTime() + 60_000);
      const claims = await Promise.all([
        leadStore.claimForTelegram({ leadId, now, leaseUntil, deliveryToken: randomUUID() }),
        leadStore.claimForTelegram({ leadId, now, leaseUntil, deliveryToken: randomUUID() }),
      ]);
      const claimed = claims.filter((claim): claim is ClaimedLead => claim !== null);

      assert.equal(claimed.length, 1);
      assert.equal(claimed[0]?.telegramAttempts, 1);
      assert.deepEqual(await leadStore.listTelegramCandidates({ now, limit: 10 }), []);

      await leadStore.markTelegramDelivered({ leadId, deliveryToken: 'wrong-token', notifiedAt: now });

      const afterLease = new Date(leaseUntil.getTime() + 1000);
      assert.deepEqual(await leadStore.listTelegramCandidates({ now: afterLease, limit: 10 }), [leadId]);

      const secondToken = randomUUID();
      const reclaimed = await leadStore.claimForTelegram({
        leadId,
        now: afterLease,
        leaseUntil: new Date(afterLease.getTime() + 60_000),
        deliveryToken: secondToken,
      });
      assert.ok(reclaimed);
      assert.equal(reclaimed.telegramAttempts, 2);

      await leadStore.markTelegramFailed({
        leadId,
        deliveryToken: secondToken,
        failedAt: afterLease,
        errorCode: 'integration_terminal',
        terminal: true,
      });
      assert.deepEqual(
        await leadStore.listTelegramCandidates({ now: new Date(afterLease.getTime() + 120_000), limit: 10 }),
        [],
      );
    } finally {
      await leadStore.close();

      const client = await createYdbClient();
      await dropTable(client.sql, table);
      await dropTable(client.sql, migrationTableName());
      await client.close();

      if (originalConnectionString === undefined) {
        delete process.env.YDB_CONNECTION_STRING;
      } else {
        process.env.YDB_CONNECTION_STRING = originalConnectionString;
      }
      if (originalTable === undefined) {
        delete process.env.YDB_LEADS_TABLE;
      } else {
        process.env.YDB_LEADS_TABLE = originalTable;
      }
    }
  },
);
