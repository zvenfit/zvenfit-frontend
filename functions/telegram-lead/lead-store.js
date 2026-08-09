'use strict';

/* eslint-disable @typescript-eslint/no-var-requires, max-lines */

const { createYdbClient } = require('./ydb-client');
const {
  dueIndexName,
  normalizeConnectionString,
  parsePositiveInt,
  queryTimeoutMs,
  retentionDays,
  tableName,
} = require('./ydb-config');
const { observeYdbOperation } = require('./ydb-observability');

let clientPromise = null;
let ydbValueTypes = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = createYdbClient()
      .then(client => {
        ydbValueTypes = client.types;

        return client;
      })
      .catch(error => {
        clientPromise = null;
        ydbValueTypes = null;
        throw error;
      });
  }

  return clientPromise;
}

async function getSql() {
  const client = await getClient();

  return client.sql;
}

function transactionOptions() {
  return {
    idempotent: true,
    signal: AbortSignal.timeout(queryTimeoutMs()),
  };
}

function timed(query) {
  return query.timeout(queryTimeoutMs());
}

function observed(operation, logger, callback) {
  return observeYdbOperation(operation, logger, callback);
}

function firstResultSet(resultSets) {
  return Array.isArray(resultSets?.[0]) ? resultSets[0] : [];
}

async function close() {
  const client = await clientPromise?.catch(() => null);
  await client?.close();
  clientPromise = null;
  ydbValueTypes = null;
}

function ydbTimestamp(value) {
  return new ydbValueTypes.Timestamp(value);
}

function ydbUint32(value) {
  return new ydbValueTypes.Uint32(value);
}

function expiresAt(createdAt) {
  return new Date(createdAt.getTime() + retentionDays() * 24 * 60 * 60 * 1000);
}

function rowToLead(row) {
  return {
    leadId: row.lead_id,
    createdAt: row.created_at,
    name: row.name,
    phone: row.phone,
    service: row.service,
    telegramUsername: row.telegram_username,
    utm: JSON.parse(row.utm_json || '{}'),
    telegramAttempts: Number(row.telegram_attempts || 0),
  };
}

function toEpoch(value) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

async function saveLead(lead, { logger } = {}) {
  return observed('save_lead', logger, async () => {
    const sql = await getSql();
    const leadsTable = sql.identifier(tableName());

    return sql.begin(transactionOptions(), async tx => {
      const existing = firstResultSet(
        await tx`
          SELECT telegram_status
          FROM ${leadsTable}
          WHERE lead_id = ${lead.leadId};
        `,
      );

      if (existing.length > 0) {
        return {
          created: false,
          telegramStatus: existing[0].telegram_status,
        };
      }

      const createdAt = lead.createdAt;
      const createdAtValue = ydbTimestamp(createdAt);

      await tx`
        INSERT INTO ${leadsTable} (
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
          telegram_due_at,
          telegram_delivery_token,
          telegram_last_error
        )
        VALUES (
          ${lead.leadId},
          ${createdAtValue},
          ${ydbTimestamp(expiresAt(createdAt))},
          ${lead.name},
          ${lead.phone},
          ${lead.service},
          ${lead.telegramUsername},
          ${JSON.stringify(lead.utm || {})},
          ${'pending'},
          ${ydbUint32(0)},
          ${createdAtValue},
          ${createdAtValue},
          ${createdAtValue},
          ${''},
          ${''}
        );
      `;

      return {
        created: true,
        telegramStatus: 'pending',
      };
    });
  });
}

async function importDeliveredLead(lead, { logger } = {}) {
  return observed('import_delivered_lead', logger, async () => {
    const sql = await getSql();
    const leadsTable = sql.identifier(tableName());

    return sql.begin(transactionOptions(), async tx => {
      const existing = firstResultSet(
        await tx`
          SELECT telegram_status
          FROM ${leadsTable}
          WHERE lead_id = ${lead.leadId};
        `,
      );

      if (existing.length > 0) {
        return {
          created: false,
          telegramStatus: existing[0].telegram_status,
        };
      }

      const createdAt = lead.createdAt;
      const notifiedAt = lead.notifiedAt || createdAt;
      const createdAtValue = ydbTimestamp(createdAt);

      await tx`
      INSERT INTO ${leadsTable} (
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
      )
      VALUES (
        ${lead.leadId},
        ${createdAtValue},
        ${ydbTimestamp(expiresAt(createdAt))},
        ${lead.name},
        ${lead.phone},
        ${lead.service},
        ${lead.telegramUsername},
        ${JSON.stringify(lead.utm || {})},
        ${'sent'},
        ${ydbUint32(1)},
        ${createdAtValue},
        ${createdAtValue},
        ${''},
        ${''},
        ${ydbTimestamp(notifiedAt)}
      );
      `;

      return {
        created: true,
        telegramStatus: 'sent',
      };
    });
  });
}

async function claimForTelegram({ leadId, now, leaseUntil, deliveryToken, logger }) {
  return observed('claim_for_telegram', logger, async () => {
    const sql = await getSql();
    const leadsTable = sql.identifier(tableName());

    return sql.begin(transactionOptions(), async tx => {
      const rows = firstResultSet(
        await tx`
          SELECT
            lead_id,
            created_at,
            name,
            phone,
            service,
            telegram_username,
            utm_json,
            telegram_status,
            telegram_attempts,
            telegram_next_attempt_at,
            telegram_lease_until
          FROM ${leadsTable}
          WHERE lead_id = ${leadId};
        `,
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      const pendingAndDue = row.telegram_status === 'pending' && toEpoch(row.telegram_next_attempt_at) <= now.getTime();
      const abandonedLease = row.telegram_status === 'sending' && toEpoch(row.telegram_lease_until) <= now.getTime();

      if (!pendingAndDue && !abandonedLease) {
        return null;
      }

      const attempts = Number(row.telegram_attempts || 0) + 1;

      await tx`
        UPDATE ${leadsTable}
        SET
          telegram_status = ${'sending'},
          telegram_attempts = ${ydbUint32(attempts)},
          telegram_lease_until = ${ydbTimestamp(leaseUntil)},
          telegram_due_at = ${ydbTimestamp(leaseUntil)},
          telegram_delivery_token = ${deliveryToken}
        WHERE lead_id = ${leadId};
      `;

      return {
        ...rowToLead(row),
        telegramAttempts: attempts,
      };
    });
  });
}

async function markTelegramDelivered({ leadId, deliveryToken, notifiedAt, logger }) {
  return observed('mark_telegram_delivered', logger, async () => {
    const sql = await getSql();
    const leadsTable = sql.identifier(tableName());

    await timed(
      sql`
      UPDATE ${leadsTable}
      SET
        telegram_status = ${'sent'},
        telegram_due_at = NULL,
        telegram_delivery_token = ${''},
        telegram_last_error = ${''},
        telegram_notified_at = ${ydbTimestamp(notifiedAt)}
      WHERE
        lead_id = ${leadId}
        AND telegram_status = ${'sending'}
        AND telegram_delivery_token = ${deliveryToken};
    `.idempotent(true),
    );
  });
}

async function markTelegramFailed({ leadId, deliveryToken, failedAt, errorCode, terminal, logger }) {
  return observed('mark_telegram_failed', logger, async () => {
    const sql = await getSql();
    const leadsTable = sql.identifier(tableName());
    const status = terminal ? 'failed' : 'pending';
    const dueAt = terminal ? sql.fragment`NULL` : sql.fragment`${ydbTimestamp(failedAt)}`;

    await timed(
      sql`
      UPDATE ${leadsTable}
      SET
        telegram_status = ${status},
        telegram_next_attempt_at = ${ydbTimestamp(failedAt)},
        telegram_due_at = ${dueAt},
        telegram_delivery_token = ${''},
        telegram_last_error = ${errorCode}
      WHERE
        lead_id = ${leadId}
        AND telegram_status = ${'sending'}
        AND telegram_delivery_token = ${deliveryToken};
    `.idempotent(true),
    );
  });
}

async function listTelegramCandidates({ now, limit, logger }) {
  return observed('list_telegram_candidates', logger, async () => {
    const sql = await getSql();
    const leadsTable = sql.identifier(tableName());
    const dueIndex = sql.identifier(dueIndexName());
    const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 100);
    const nowValue = ydbTimestamp(now);

    const rows = firstResultSet(
      await timed(
        sql`
        SELECT lead_id
        FROM ${leadsTable} VIEW ${dueIndex}
        WHERE
          telegram_due_at <= ${nowValue}
          AND (telegram_status = ${'pending'} OR telegram_status = ${'sending'})
          AND expires_at > ${nowValue}
        ORDER BY telegram_due_at, created_at, lead_id
        LIMIT ${safeLimit};
      `
          .idempotent(true)
          .isolation('snapshotReadOnly'),
      ),
    );

    return rows.map(row => row.lead_id);
  });
}

module.exports = {
  claimForTelegram,
  close,
  importDeliveredLead,
  listTelegramCandidates,
  markTelegramDelivered,
  markTelegramFailed,
  saveLead,
  _private: {
    expiresAt,
    firstResultSet,
    normalizeConnectionString,
    parsePositiveInt,
    rowToLead,
    tableName,
    toEpoch,
    ydbTimestamp,
    ydbUint32,
  },
};
