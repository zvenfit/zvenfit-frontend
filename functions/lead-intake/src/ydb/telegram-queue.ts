import { dueIndexName, tableName } from './config';
import {
  firstResultSet,
  observed,
  rowToLead,
  stringValue,
  timed,
  toEpoch,
  transactionOptions,
  ydbTimestamp,
  ydbUint32,
} from './context';

import type { ClaimedLead, LoggerLike } from '../types';

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
  return observed('claim_for_telegram', logger, async sql => {
    const leadsTable = sql.identifier(tableName());

    return sql.begin(transactionOptions(), async tx => {
      const rows = firstResultSet(
        await tx`
          SELECT
            lead_id,
            created_at,
            name,
            phone,
            contact_method,
            telegram_username,
            utm_json,
            telegram_status,
            telegram_attempts,
            telegram_due_at
          FROM ${leadsTable}
          WHERE lead_id = ${leadId};
        `,
      );

      const row = rows[0];
      if (!row) {
        return null;
      }

      const due = toEpoch(row.telegram_due_at) <= now.getTime();
      const readyStatus = row.telegram_status === 'pending' || row.telegram_status === 'sending';

      if (!readyStatus || !due) {
        return null;
      }

      const attempts = Number(row.telegram_attempts || 0) + 1;

      await tx`
        UPDATE ${leadsTable}
        SET
          telegram_status = ${'sending'},
          telegram_attempts = ${ydbUint32(attempts)},
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
  return observed('mark_telegram_delivered', logger, async sql => {
    const leadsTable = sql.identifier(tableName());
    await timed(
      sql`
        UPDATE ${leadsTable}
        SET
          telegram_status = ${'sent'},
          telegram_due_at = NULL,
          telegram_delivery_token = NULL,
          telegram_last_error = NULL,
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
  return observed('mark_telegram_failed', logger, async sql => {
    const leadsTable = sql.identifier(tableName());
    const status = terminal ? 'failed' : 'pending';
    const dueAt = terminal ? sql.fragment`NULL` : sql.fragment`${ydbTimestamp(failedAt)}`;

    await timed(
      sql`
        UPDATE ${leadsTable}
        SET
          telegram_status = ${status},
          telegram_due_at = ${dueAt},
          telegram_delivery_token = NULL,
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
  return observed('list_telegram_candidates', logger, async sql => {
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
