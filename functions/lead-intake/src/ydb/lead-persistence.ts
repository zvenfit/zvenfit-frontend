import { tableName } from './config';
import { firstResultSet, observedSql, telegramStatus, transactionOptions, ydbTimestamp, ydbUint32 } from './context';

import type { Lead, LoggerLike, TelegramStatus } from '../types';

export async function saveLead(
  lead: Lead,
  { logger }: { logger?: LoggerLike } = {},
): Promise<{ created: boolean; telegramStatus: TelegramStatus }> {
  return observedSql('save_lead', logger, async sql => {
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
          name,
          phone,
          contact_method,
          telegram_username,
          utm_json,
          telegram_status,
          telegram_attempts,
          telegram_due_at
        )
        VALUES (
          ${lead.leadId},
          ${createdAtValue},
          ${lead.name},
          ${lead.phone},
          ${lead.contactMethod},
          ${lead.telegramUsername},
          ${JSON.stringify(lead.utm)},
          ${'pending'},
          ${ydbUint32(0)},
          ${createdAtValue}
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
  return observedSql('import_delivered_lead', logger, async sql => {
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
          name,
          phone,
          contact_method,
          telegram_username,
          utm_json,
          telegram_status,
          telegram_attempts,
          telegram_notified_at
        )
        VALUES (
          ${lead.leadId},
          ${createdAtValue},
          ${lead.name},
          ${lead.phone},
          ${lead.contactMethod},
          ${lead.telegramUsername},
          ${JSON.stringify(lead.utm)},
          ${'sent'},
          ${ydbUint32(1)},
          ${ydbTimestamp(notifiedAt)}
        );
      `;

      return { created: true, telegramStatus: 'sent' };
    });
  });
}
