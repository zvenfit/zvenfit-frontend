import { setDefaultResultOrder } from 'node:dns';

import { TRACKED_UTM_PARAMS } from '../lead-payload';

import type { ClaimedLead, UtmKey } from '../types';

const DEFAULT_TELEGRAM_TIMEOUT_MS = 15_000;
const MAX_TELEGRAM_TIMEOUT_MS = 25_000;

// Yandex Cloud Functions has public IPv4 egress only, while Telegram DNS returns IPv6 first.
setDefaultResultOrder('ipv4first');

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

export function telegramTimeoutMs(): number {
  const value = Number.parseInt(process.env.TELEGRAM_TIMEOUT_MS ?? '', 10);

  return Number.isInteger(value) && value > 0 ? Math.min(value, MAX_TELEGRAM_TIMEOUT_MS) : DEFAULT_TELEGRAM_TIMEOUT_MS;
}

function telegramError(message: string, code: string, status?: number): Error & { code: string; status?: number } {
  return Object.assign(new Error(message), { code, name: 'TelegramError', status });
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
    throw telegramError('Telegram returned an error', 'telegram_error', response.status);
  }
}
