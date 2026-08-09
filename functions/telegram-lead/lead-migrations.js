'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const { createYdbClient } = require('./ydb-client');
const { dueIndexName, migrationTableName, queryTimeoutMs, tableName } = require('./ydb-config');

const MIGRATIONS = [
  { version: 1, name: 'create_leads_table', apply: createLeadsTable },
  { version: 2, name: 'add_telegram_due_at', apply: addTelegramDueAt },
  { version: 3, name: 'backfill_telegram_due_at', apply: backfillTelegramDueAt },
  { version: 4, name: 'add_telegram_due_index', apply: addTelegramDueIndex },
];

function timed(query) {
  return query.timeout(queryTimeoutMs());
}

async function createLeadsTable({ sql, leadsTable }) {
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

async function addTelegramDueAt({ sql, leadsTable }) {
  await timed(sql`
    ALTER TABLE ${leadsTable}
    ADD COLUMN telegram_due_at Timestamp;
  `);
}

async function backfillTelegramDueAt({ sql, leadsTable }) {
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

async function addTelegramDueIndex({ sql, leadsTable, dueIndex }) {
  await timed(sql`
    ALTER TABLE ${leadsTable}
    ADD INDEX ${dueIndex} GLOBAL SYNC
    ON (telegram_due_at, created_at)
    COVER (telegram_status, expires_at);
  `);
}

async function ensureMigrationTable(sql, migrationsTable) {
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

async function appliedVersions(sql, migrationsTable) {
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

async function recordMigration({ sql, migrationsTable, migration, types }) {
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

async function validateLeadSchema({ sql, leadsTable, dueIndex, types }) {
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

function migrationContext(client) {
  return {
    ...client,
    leadsTable: client.sql.identifier(tableName()),
    migrationsTable: client.sql.identifier(migrationTableName()),
    dueIndex: client.sql.identifier(dueIndexName()),
  };
}

async function runMigrations({ log = console } = {}) {
  const client = await createYdbClient();

  try {
    const context = migrationContext(client);
    await ensureMigrationTable(context.sql, context.migrationsTable);
    const applied = await appliedVersions(context.sql, context.migrationsTable);
    const completed = [];

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) {
        continue;
      }

      log.info?.(`YDB migration ${migration.version}: ${migration.name}`);
      await migration.apply(context);
      await recordMigration({ ...context, migration });
      completed.push(migration.version);
    }

    await validateLeadSchema(context);

    return completed;
  } finally {
    await client.close();
  }
}

module.exports = {
  MIGRATIONS,
  runMigrations,
  _private: {
    addTelegramDueAt,
    addTelegramDueIndex,
    appliedVersions,
    backfillTelegramDueAt,
    createLeadsTable,
    ensureMigrationTable,
    migrationContext,
    recordMigration,
    timed,
    validateLeadSchema,
  },
};
