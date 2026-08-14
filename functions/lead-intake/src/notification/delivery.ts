import { sanitize } from '../lead-payload';

import type { HandlerDependencies, JsonObject, LoggerLike } from '../types';

const DELIVERY_LEASE_MS = 2 * 60 * 1000;

export interface RetrySummary extends JsonObject {
  processed: number;
  sent: number;
  pending: number;
  failed: number;
  skipped: number;
}

export function errorCode(error: unknown, fallback = 'internal_error'): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return sanitize(error.code, 64) || fallback;
  }

  return fallback;
}

export function logDeliveryFailure(
  logger: LoggerLike,
  event: string,
  leadId: string,
  code: string,
  attempts: number,
): void {
  logger.error({ event, lead_id: leadId, error_code: code, attempts }, event);
}

function nextRetryAt(now: Date, attempts: number): Date {
  const delayMinutes = [1, 5, 15, 60, 6 * 60][Math.min(Math.max(attempts - 1, 0), 4)] ?? 1;

  return new Date(now.getTime() + delayMinutes * 60 * 1000);
}

export async function deliverLead(
  leadId: string,
  dependencies: HandlerDependencies,
  logger: LoggerLike,
): Promise<'sent' | 'pending' | 'failed' | 'skipped'> {
  const now = dependencies.now();
  const deliveryToken = dependencies.uuid();
  const claimedLead = await dependencies.store.claimForTelegram({
    leadId,
    now,
    leaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
    deliveryToken,
    logger,
  });

  if (!claimedLead) {
    return 'skipped';
  }

  try {
    await dependencies.notificationSender(claimedLead);
    await dependencies.store.markTelegramDelivered({ leadId, deliveryToken, notifiedAt: dependencies.now(), logger });

    return 'sent';
  } catch (error) {
    const code = errorCode(error, 'notification_error');
    const terminal = claimedLead.telegramAttempts >= dependencies.maxAttempts();

    await dependencies.store.markTelegramFailed({
      leadId,
      deliveryToken,
      failedAt: terminal ? dependencies.now() : nextRetryAt(dependencies.now(), claimedLead.telegramAttempts),
      errorCode: code,
      terminal,
      logger,
    });
    logDeliveryFailure(
      logger,
      terminal ? 'telegram_delivery_failed_permanently' : 'telegram_delivery_retry_scheduled',
      leadId,
      code,
      claimedLead.telegramAttempts,
    );

    return terminal ? 'failed' : 'pending';
  }
}

export async function retryPendingLeads(dependencies: HandlerDependencies, logger: LoggerLike): Promise<RetrySummary> {
  const leadIds = await dependencies.store.listTelegramCandidates({
    now: dependencies.now(),
    limit: dependencies.retryBatchSize(),
    logger,
  });
  const summary: RetrySummary = { processed: leadIds.length, sent: 0, pending: 0, failed: 0, skipped: 0 };

  for (const leadId of leadIds) {
    try {
      summary[await deliverLead(leadId, dependencies, logger)] += 1;
    } catch (error) {
      summary.pending += 1;
      logDeliveryFailure(logger, 'telegram_delivery_retry_error', leadId, errorCode(error, 'storage_error'), 0);
    }
  }

  return summary;
}
