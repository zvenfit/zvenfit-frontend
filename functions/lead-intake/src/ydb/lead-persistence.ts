import { retentionDays, tableName } from './config';
import {
  getSql,
  firstResultSet,
  observed,
  telegramStatus,
  transactionOptions,
  ydbTimestamp,
  ydbUint32,
} from './context';

import type { Lead, LoggerLike, TelegramStatus } from '../types';

function expiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + retentionDays() * 24 * 60 * 60 * 1000);
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
        return { created: false, telegramStatus: telegramStatus(existing[0]?.telegram_status) };
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

export const _private = { expiresAt };
