/* eslint-disable max-lines */

import { createYdbClient } from './ydb-client';
import {
  dueIndexName,
  normalizeConnectionString,
  parsePositiveInt,
  queryTimeoutMs,
  retentionDays,
  tableName,
} from './ydb-config';
import { observeYdbOperation } from './ydb-observability';

import type { ClaimedLead, Lead, LoggerLike, SqlRow, TelegramStatus, YdbClient, YdbQuery, YdbValue } from './types';

let clientPromise: Promise<YdbClient> | null = null;
let ydbValueTypes: YdbClient['types'] | null = null;

function getClient(): Promise<YdbClient> {
  if (!clientPromise) {
    clientPromise = createYdbClient()
      .then(client => {
        ydbValueTypes = client.types;

        return client;
      })
      .catch((error: unknown) => {
        clientPromise = null;
        ydbValueTypes = null;
        throw error;
      });
  }

  return clientPromise;
}

async function getSql(): Promise<YdbClient['sql']> {
  const client = await getClient();

  return client.sql;
}

function transactionOptions(): { idempotent: boolean; signal: AbortSignal } {
  return {
    idempotent: true,
    signal: AbortSignal.timeout(queryTimeoutMs()),
  };
}

function timed<T>(query: YdbQuery<T>): YdbQuery<T> {
  return query.timeout(queryTimeoutMs());
}

function observed<T>(operation: string, logger: LoggerLike | undefined, callback: () => Promise<T>): Promise<T> {
  return observeYdbOperation(operation, logger, callback);
}

function firstResultSet(resultSets: unknown): SqlRow[] {
  if (!Array.isArray(resultSets) || !Array.isArray(resultSets[0])) {
    return [];
  }

  return resultSets[0] as SqlRow[];
}

export async function close(): Promise<void> {
  const client = await clientPromise?.catch(() => null);
  await client?.close();
  clientPromise = null;
  ydbValueTypes = null;
}

function valueTypes(): YdbClient['types'] {
  if (!ydbValueTypes) {
    throw new Error('ydb_client_not_initialized');
  }

  return ydbValueTypes;
}

function ydbTimestamp(value: Date): YdbValue<Date> {
  return new (valueTypes().Timestamp)(value);
}

function ydbUint32(value: number): YdbValue<number> {
  return new (valueTypes().Uint32)(value);
}

function expiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + retentionDays() * 24 * 60 * 60 * 1000);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dateValue(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function telegramStatus(value: unknown): TelegramStatus {
  return value === 'sending' || value === 'sent' || value === 'failed' ? value : 'pending';
}

function rowToLead(row: SqlRow): ClaimedLead {
  let utm = {};
  try {
    utm = JSON.parse(stringValue(row.utm_json) || '{}') as Record<string, string>;
  } catch {
    utm = {};
  }

  return {
    leadId: stringValue(row.lead_id),
    createdAt: dateValue(row.created_at),
    name: stringValue(row.name),
    phone: stringValue(row.phone),
    service: stringValue(row.service),
    telegramUsername: stringValue(row.telegram_username),
    utm,
    telegramAttempts: Number(row.telegram_attempts || 0),
  };
}

function toEpoch(value: unknown): number {
  return dateValue(value).getTime();
}

export async function saveLead(
  lead: Lead,
  { logger }: { logger?: LoggerLike } = {},
): Promise<{ created: boolean; telegramStatus: TelegramStatus }> {
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
          telegramStatus: telegramStatus(existing[0]?.telegram_status),
        };
      }

      const createdAtValue = ydbTimestamp(lead.createdAt);

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
          ${ydbTimestamp(expiresAt(lead.createdAt))},
          ${lead.name},
          ${lead.phone},
          ${lead.service},
          ${lead.telegramUsername},
          ${JSON.stringify(lead.utm)},
          ${'pending'},
          ${ydbUint32(0)},
          ${createdAtValue},
          ${createdAtValue},
          ${createdAtValue},
          ${''},
          ${''}
        );
      `;

      return { created: true, telegramStatus: 'pending' };
    });
  });
}

export async function importDeliveredLead(
  lead: Lead & { notifiedAt?: Date },
  { logger }: { logger?: LoggerLike } = {},
): Promise<{ created: boolean; telegramStatus: TelegramStatus }> {
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
        return { created: false, telegramStatus: telegramStatus(existing[0]?.telegram_status) };
      }

      const notifiedAt = lead.notifiedAt || lead.createdAt;
      const createdAtValue = ydbTimestamp(lead.createdAt);

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
          ${ydbTimestamp(expiresAt(lead.createdAt))},
          ${lead.name},
          ${lead.phone},
          ${lead.service},
          ${lead.telegramUsername},
          ${JSON.stringify(lead.utm)},
          ${'sent'},
          ${ydbUint32(1)},
          ${createdAtValue},
          ${createdAtValue},
          ${''},
          ${''},
          ${ydbTimestamp(notifiedAt)}
        );
      `;

      return { created: true, telegramStatus: 'sent' };
    });
  });
}

export async function claimForTelegram({
  leadId,
  now,
  leaseUntil,
  deliveryToken,
  logger,
}: {
  leadId: string;
  now: Date;
  leaseUntil: Date;
  deliveryToken: string;
  logger?: LoggerLike;
}): Promise<ClaimedLead | null> {
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

      const row = rows[0];
      if (!row) {
        return null;
      }

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

      return { ...rowToLead(row), telegramAttempts: attempts };
    });
  });
}

export async function markTelegramDelivered({
  leadId,
  deliveryToken,
  notifiedAt,
  logger,
}: {
  leadId: string;
  deliveryToken: string;
  notifiedAt: Date;
  logger?: LoggerLike;
}): Promise<void> {
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

export async function markTelegramFailed({
  leadId,
  deliveryToken,
  failedAt,
  errorCode,
  terminal,
  logger,
}: {
  leadId: string;
  deliveryToken: string;
  failedAt: Date;
  errorCode: string;
  terminal: boolean;
  logger?: LoggerLike;
}): Promise<void> {
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

export async function listTelegramCandidates({
  now,
  limit,
  logger,
}: {
  now: Date;
  limit: number;
  logger?: LoggerLike;
}): Promise<string[]> {
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

    return rows.map(row => stringValue(row.lead_id));
  });
}

export const _private = {
  expiresAt,
  firstResultSet,
  normalizeConnectionString,
  parsePositiveInt,
  rowToLead,
  tableName,
  toEpoch,
  ydbTimestamp,
  ydbUint32,
};
