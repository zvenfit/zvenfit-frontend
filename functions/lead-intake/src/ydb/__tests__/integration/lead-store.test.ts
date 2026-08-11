import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { createYdbClient } from '../../client';
import { migrationTableName, queryTimeoutMs, rateLimitsTableName } from '../../config';
import * as leadStore from '../../lead-store';
import { runMigrations } from '../../migrations';
import { consumeLeadRateLimit } from '../../rate-limit';

import type { ClaimedLead, Lead, YdbSql } from '../../../types';

const TEST_CONNECTION_STRING = process.env.YDB_TEST_CONNECTION_STRING;

function lead(leadId: string, createdAt: Date): Lead {
  return {
    leadId,
    createdAt,
    name: 'Integration test',
    phone: '+7 000 000-00-00',
    contactMethod: 'Позвонить',
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
  'YDB migrations, rate limit, idempotency, indexed queue, claim lease, and delivery token work together',
  { skip: !TEST_CONNECTION_STRING },
  async () => {
    if (!TEST_CONNECTION_STRING) {
      return;
    }

    const originalConnectionString = process.env.YDB_CONNECTION_STRING;
    const originalTable = process.env.YDB_LEADS_TABLE;
    const originalRateLimitsTable = process.env.YDB_RATE_LIMITS_TABLE;
    const originalRateLimitSecret = process.env.LEAD_RATE_LIMIT_SECRET;
    const table = `leads_it_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const rateLimitsTable = `limits_it_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

    process.env.YDB_CONNECTION_STRING = TEST_CONNECTION_STRING;
    process.env.YDB_LEADS_TABLE = table;
    process.env.YDB_RATE_LIMITS_TABLE = rateLimitsTable;
    process.env.LEAD_RATE_LIMIT_SECRET = 'integration-test-secret-not-production-32';

    try {
      assert.deepEqual(await runMigrations({ log: { info() {} } }), [1]);
      assert.deepEqual(await runMigrations({ log: { info() {} } }), []);

      const migrationClient = await createYdbClient();
      try {
        const migrationsTable = migrationClient.sql.identifier(migrationTableName());
        await migrationClient.sql`
          DELETE FROM ${migrationsTable}
          WHERE version = ${new migrationClient.types.Uint32(1)};
        `.timeout(queryTimeoutMs());
      } finally {
        await migrationClient.close();
      }

      assert.deepEqual(await runMigrations({ log: { info() {} } }), [1]);
      assert.deepEqual(await runMigrations({ log: { info() {} } }), []);

      const rateLimitResults = await Promise.all(
        Array.from({ length: 6 }, () =>
          consumeLeadRateLimit({ sourceIp: '203.0.113.10', now: new Date('2026-08-10T10:01:00.000Z') }),
        ),
      );
      assert.equal(rateLimitResults.filter(Boolean).length, 5);
      assert.equal(rateLimitResults.filter(result => !result).length, 1);

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
      await dropTable(client.sql, rateLimitsTableName());
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
      if (originalRateLimitsTable === undefined) {
        delete process.env.YDB_RATE_LIMITS_TABLE;
      } else {
        process.env.YDB_RATE_LIMITS_TABLE = originalRateLimitsTable;
      }
      if (originalRateLimitSecret === undefined) {
        delete process.env.LEAD_RATE_LIMIT_SECRET;
      } else {
        process.env.LEAD_RATE_LIMIT_SECRET = originalRateLimitSecret;
      }
    }
  },
);
