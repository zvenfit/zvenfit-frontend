import { createYdbClient } from './client';
import { dueIndexName, migrationTableName, queryTimeoutMs, tableName } from './config';

import type { YdbClient, YdbQuery } from '../types';

interface MigrationContext extends YdbClient {
  leadsTable: unknown;
  migrationsTable: unknown;
  dueIndex: unknown;
}

interface Migration {
  version: number;
  name: string;
  apply(context: MigrationContext): Promise<void>;
  verify?(context: MigrationContext): Promise<void>;
}

interface MigrationLogger {
  info?(message: string): void;
}

function timed<T>(query: YdbQuery<T>): YdbQuery<T> {
  return query.timeout(queryTimeoutMs());
}

async function createLeadsTable({ sql, leadsTable }: MigrationContext): Promise<void> {
  await timed(
    sql`
      CREATE TABLE IF NOT EXISTS ${leadsTable} (
        lead_id Utf8 NOT NULL,
        created_at Timestamp NOT NULL,
        expires_at Timestamp NOT NULL,
        name Utf8 NOT NULL,
        phone Utf8 NOT NULL,
        service Utf8 NOT NULL,
        telegram_username Utf8 NOT NULL,
        utm_json Utf8 NOT NULL,
        telegram_status Utf8 NOT NULL,
        telegram_attempts Uint32 NOT NULL,
        telegram_next_attempt_at Timestamp NOT NULL,
        telegram_lease_until Timestamp NOT NULL,
        telegram_delivery_token Utf8 NOT NULL,
        telegram_last_error Utf8 NOT NULL,
        telegram_notified_at Timestamp,
        PRIMARY KEY (lead_id)
      )
      WITH (
        TTL = Interval("PT0S") ON expires_at
      );
    `.idempotent(true),
  );
}

async function verifyBaseLeadSchema({ sql, leadsTable }: MigrationContext): Promise<void> {
  await timed(
    sql`
      SELECT
        lead_id,
        created_at,
        expires_at,
        name,
        phone,
        service,
        telegram_username,
        utm_json,
        telegram_status,
        telegram_attempts,
        telegram_next_attempt_at,
        telegram_lease_until,
        telegram_delivery_token,
        telegram_last_error,
        telegram_notified_at
      FROM ${leadsTable}
      LIMIT ${0};
    `
      .idempotent(true)
      .isolation('snapshotReadOnly'),
  );
}

async function addTelegramDueAt({ sql, leadsTable }: MigrationContext): Promise<void> {
  await timed(sql`
    ALTER TABLE ${leadsTable}
    ADD COLUMN telegram_due_at Timestamp;
  `);
}

async function verifyTelegramDueAt({ sql, leadsTable, types }: MigrationContext): Promise<void> {
  const now = new types.Timestamp(new Date());

  await timed(
    sql`
      SELECT telegram_due_at
      FROM ${leadsTable}
      WHERE telegram_due_at <= ${now}
      LIMIT ${0};
    `
      .idempotent(true)
      .isolation('snapshotReadOnly'),
  );
}

async function backfillTelegramDueAt({ sql, leadsTable }: MigrationContext): Promise<void> {
  await timed(
    sql`
      UPDATE ${leadsTable}
      SET telegram_due_at = CASE
        WHEN telegram_status = ${'pending'} THEN telegram_next_attempt_at
        WHEN telegram_status = ${'sending'} THEN telegram_lease_until
        ELSE NULL
      END;
    `.idempotent(true),
  );
}

async function addTelegramDueIndex({ sql, leadsTable, dueIndex }: MigrationContext): Promise<void> {
  await timed(sql`
    ALTER TABLE ${leadsTable}
    ADD INDEX ${dueIndex} GLOBAL SYNC
    ON (telegram_due_at, created_at)
    COVER (telegram_status, expires_at);
  `);
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'create_leads_table', apply: createLeadsTable, verify: verifyBaseLeadSchema },
  { version: 2, name: 'add_telegram_due_at', apply: addTelegramDueAt, verify: verifyTelegramDueAt },
  { version: 3, name: 'backfill_telegram_due_at', apply: backfillTelegramDueAt },
  { version: 4, name: 'add_telegram_due_index', apply: addTelegramDueIndex, verify: validateLeadSchema },
];

async function ensureMigrationTable(sql: YdbClient['sql'], migrationsTable: unknown): Promise<void> {
  await timed(
    sql`
      CREATE TABLE IF NOT EXISTS ${migrationsTable} (
        version Uint32 NOT NULL,
        name Utf8 NOT NULL,
        applied_at Timestamp NOT NULL,
        PRIMARY KEY (version)
      );
    `.idempotent(true),
  );
}

async function appliedVersions(sql: YdbClient['sql'], migrationsTable: unknown): Promise<Set<number>> {
  const resultSets = await timed(
    sql`
      SELECT version
      FROM ${migrationsTable}
      ORDER BY version;
    `
      .idempotent(true)
      .isolation('snapshotReadOnly'),
  );

  return new Set((resultSets[0] || []).map(row => Number(row.version)));
}

async function recordMigration({
  sql,
  migrationsTable,
  migration,
  types,
}: MigrationContext & { migration: Migration }): Promise<void> {
  await timed(
    sql`
      UPSERT INTO ${migrationsTable} (version, name, applied_at)
      VALUES (
        ${new types.Uint32(migration.version)},
        ${migration.name},
        ${new types.Timestamp(new Date())}
      );
    `.idempotent(true),
  );
}

async function validateLeadSchema({ sql, leadsTable, dueIndex, types }: MigrationContext): Promise<void> {
  const now = new types.Timestamp(new Date());

  await timed(
    sql`
      SELECT lead_id
      FROM ${leadsTable} VIEW ${dueIndex}
      WHERE
        telegram_due_at <= ${now}
        AND (telegram_status = ${'pending'} OR telegram_status = ${'sending'})
        AND expires_at > ${now}
      ORDER BY telegram_due_at, created_at, lead_id
      LIMIT ${1};
    `
      .idempotent(true)
      .isolation('snapshotReadOnly'),
  );
}

async function applyMigration(context: MigrationContext, migration: Migration): Promise<void> {
  try {
    await migration.apply(context);
  } catch (applyError) {
    if (!migration.verify) {
      throw applyError;
    }

    try {
      await migration.verify(context);
    } catch {
      throw applyError;
    }

    return;
  }

  await migration.verify?.(context);
}

function migrationContext(client: YdbClient): MigrationContext {
  return {
    ...client,
    leadsTable: client.sql.identifier(tableName()),
    migrationsTable: client.sql.identifier(migrationTableName()),
    dueIndex: client.sql.identifier(dueIndexName()),
  };
}

export async function runMigrations({ log = console }: { log?: MigrationLogger } = {}): Promise<number[]> {
  const client = await createYdbClient();

  try {
    const context = migrationContext(client);
    await ensureMigrationTable(context.sql, context.migrationsTable);
    const applied = await appliedVersions(context.sql, context.migrationsTable);
    const completed: number[] = [];

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) {
        continue;
      }

      log.info?.(`YDB migration ${migration.version}: ${migration.name}`);
      await applyMigration(context, migration);
      await recordMigration({ ...context, migration });
      completed.push(migration.version);
    }

    await validateLeadSchema(context);

    return completed;
  } finally {
    await client.close();
  }
}

export const _private = {
  addTelegramDueAt,
  addTelegramDueIndex,
  applyMigration,
  appliedVersions,
  backfillTelegramDueAt,
  createLeadsTable,
  ensureMigrationTable,
  migrationContext,
  recordMigration,
  timed,
  validateLeadSchema,
  verifyBaseLeadSchema,
  verifyTelegramDueAt,
};
