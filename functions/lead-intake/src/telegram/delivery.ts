import { TRACKED_UTM_PARAMS, sanitize } from '../lead-payload';

import type { ClaimedLead, HandlerDependencies, JsonObject, LoggerLike, UtmKey } from '../types';

const DEFAULT_TELEGRAM_TIMEOUT_MS = 15_000;
const MAX_TELEGRAM_TIMEOUT_MS = 25_000;
const TELEGRAM_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_RETRY_BATCH_SIZE = 5;
const MAX_RETRY_BATCH_SIZE = 25;
const DEFAULT_MAX_TELEGRAM_ATTEMPTS = 12;

const UTM_LABELS: Record<UtmKey, string> = {
  utm_source: 'source',
  utm_medium: 'medium',
  utm_campaign: 'campaign',
  utm_term: 'term',
  utm_content: 'content',
  yclid: 'yclid',
  gclid: 'gclid',
  fbclid: 'fbclid',
};

export interface RetrySummary extends JsonObject {
  processed: number;
  sent: number;
  pending: number;
  failed: number;
  skipped: number;
}

export function buildMessage(payload: ClaimedLead): string {
  const lines = [
    'Новая заявка',
    `ID: ${payload.leadId}`,
    `Имя: ${payload.name}`,
    `Телефон: ${payload.phone}`,
    `Способ связи: ${payload.contactMethod}`,
  ];

  if (payload.telegramUsername) {
    lines.push(`Телеграм: ${payload.telegramUsername}`);
  }

  if (Object.keys(payload.utm).length > 0) {
    lines.push('---', 'Маркировка:');
    for (const key of TRACKED_UTM_PARAMS) {
      const value = payload.utm[key];
      if (value) {
        lines.push(`${UTM_LABELS[key]}: ${value}`);
      }
    }
  }

  return lines.join('\n');
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

export function maxTelegramAttempts(): number {
  const value = Number.parseInt(process.env.MAX_TELEGRAM_ATTEMPTS ?? '', 10);

  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_TELEGRAM_ATTEMPTS;
}

export function telegramTimeoutMs(): number {
  const value = Number.parseInt(process.env.TELEGRAM_TIMEOUT_MS ?? '', 10);

  return Number.isInteger(value) && value > 0 ? Math.min(value, MAX_TELEGRAM_TIMEOUT_MS) : DEFAULT_TELEGRAM_TIMEOUT_MS;
}

export function retryBatchSize(): number {
  const value = Number.parseInt(process.env.TELEGRAM_RETRY_BATCH_SIZE ?? '', 10);

  return Number.isInteger(value) && value > 0 ? Math.min(value, MAX_RETRY_BATCH_SIZE) : DEFAULT_RETRY_BATCH_SIZE;
}

function nextRetryAt(now: Date, attempts: number): Date {
  const delayMinutes = [1, 5, 15, 60, 6 * 60][Math.min(Math.max(attempts - 1, 0), 4)] ?? 1;

  return new Date(now.getTime() + delayMinutes * 60 * 1000);
}

function telegramError(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function telegramNetworkErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError') {
    return 'telegram_timeout';
  }

  const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null;
  const causeCode = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
  if (typeof causeCode !== 'string') {
    return 'telegram_unreachable';
  }

  const normalizedCode = causeCode
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 40);

  return normalizedCode ? `telegram_${normalizedCode}` : 'telegram_unreachable';
}

export async function sendTelegram(payload: ClaimedLead): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw telegramError('Telegram is not configured', 'telegram_misconfigured');
  }

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(telegramTimeoutMs()),
      body: JSON.stringify({ chat_id: chatId, text: buildMessage(payload) }),
    });
  } catch (error) {
    throw telegramError('Telegram is unreachable', telegramNetworkErrorCode(error));
  }

  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  const telegramOk =
    typeof responseBody === 'object' && responseBody !== null && 'ok' in responseBody && responseBody.ok === true;
  if (!response.ok || !telegramOk) {
    throw telegramError('Telegram returned an error', 'telegram_error');
  }
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
    leaseUntil: new Date(now.getTime() + TELEGRAM_LEASE_MS),
    deliveryToken,
    logger,
  });

  if (!claimedLead) {
    return 'skipped';
  }

  try {
    await dependencies.telegramSender(claimedLead);
    await dependencies.store.markTelegramDelivered({ leadId, deliveryToken, notifiedAt: dependencies.now(), logger });

    return 'sent';
  } catch (error) {
    const code = errorCode(error, 'telegram_error');
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
    limit: retryBatchSize(),
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
