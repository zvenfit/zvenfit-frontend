'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');

const { runMigrations } = require('../../build/lead-migrations');
const leadStore = require('../../build/lead-store');
const { createYdbClient } = require('../../build/ydb-client');
const { migrationTableName, queryTimeoutMs } = require('../../build/ydb-config');

const TEST_CONNECTION_STRING = process.env.YDB_TEST_CONNECTION_STRING;

function lead(leadId, createdAt) {
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

async function dropTable(sql, name) {
  try {
    await sql`DROP TABLE ${sql.identifier(name)};`.timeout(queryTimeoutMs());
  } catch (error) {
    if (!String(error?.message || '').includes('NOT_FOUND')) {
      throw error;
    }
  }
}

test(
  'YDB migrations, idempotency, indexed queue, claim lease, and delivery token work together',
  {
    skip: !TEST_CONNECTION_STRING,
  },
  async () => {
    const originalConnectionString = process.env.YDB_CONNECTION_STRING;
    const originalTable = process.env.YDB_LEADS_TABLE;
    const table = `leads_it_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

    process.env.YDB_CONNECTION_STRING = TEST_CONNECTION_STRING;
    process.env.YDB_LEADS_TABLE = table;

    try {
      assert.deepEqual(await runMigrations({ log: { info() {} } }), [1, 2, 3, 4]);
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
      const claimed = claims.filter(Boolean);

      assert.equal(claimed.length, 1);
      assert.equal(claimed[0].telegramAttempts, 1);
      assert.deepEqual(await leadStore.listTelegramCandidates({ now, limit: 10 }), []);

      await leadStore.markTelegramDelivered({
        leadId,
        deliveryToken: 'wrong-token',
        notifiedAt: now,
      });

      const afterLease = new Date(leaseUntil.getTime() + 1000);
      assert.deepEqual(await leadStore.listTelegramCandidates({ now: afterLease, limit: 10 }), [leadId]);

      const secondToken = randomUUID();
      const reclaimed = await leadStore.claimForTelegram({
        leadId,
        now: afterLease,
        leaseUntil: new Date(afterLease.getTime() + 60_000),
        deliveryToken: secondToken,
      });
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

      if (TEST_CONNECTION_STRING) {
        const client = await createYdbClient();
        await dropTable(client.sql, table);
        await dropTable(client.sql, migrationTableName());
        await client.close();
      }

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
