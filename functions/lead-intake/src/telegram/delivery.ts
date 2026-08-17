import { request as httpsRequest } from 'node:https';

import { TRACKED_UTM_PARAMS } from '../lead-payload';
import {
  invalidateTelegramRoute,
  selectTelegramRoute,
  telegramError,
  telegramNetworkErrorCode,
  type RequestFactory,
} from './routes';

import type { ClaimedLead, UtmKey } from '../types';

const DEFAULT_TELEGRAM_TIMEOUT_MS = 15_000;
const MAX_TELEGRAM_TIMEOUT_MS = 25_000;
const MAX_TELEGRAM_RESPONSE_BYTES = 64 * 1024;
const TELEGRAM_API_HOST = 'api.telegram.org';

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

export async function sendTelegram(payload: ClaimedLead, requestFactory: RequestFactory = httpsRequest): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw telegramError('Telegram is not configured', 'telegram_misconfigured');
  }

  const route = await selectTelegramRoute(requestFactory);
  const body = JSON.stringify({ chat_id: chatId, text: buildMessage(payload) });
  let response: { body: string; statusCode: number };
  try {
    response = await new Promise((resolve, reject) => {
      const request = requestFactory(
        new URL(`https://${TELEGRAM_API_HOST}/bot${token}/sendMessage`),
        {
          method: 'POST',
          family: 4,
          ...(route.lookup ? { lookup: route.lookup } : {}),
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          signal: AbortSignal.timeout(telegramTimeoutMs()),
        },
        incoming => {
          let responseBody = '';
          incoming.setEncoding('utf8');
          incoming.on('data', (chunk: string) => {
            if (responseBody.length < MAX_TELEGRAM_RESPONSE_BYTES) {
              responseBody += chunk.slice(0, MAX_TELEGRAM_RESPONSE_BYTES - responseBody.length);
            }
          });
          incoming.on('end', () => {
            resolve({ body: responseBody, statusCode: incoming.statusCode || 0 });
          });
          incoming.on('error', reject);
        },
      );
      request.on('error', reject);
      request.end(body);
    });
  } catch (error) {
    invalidateTelegramRoute(route);
    throw telegramError('Telegram is unreachable', telegramNetworkErrorCode(error));
  }

  let responseBody: unknown = null;
  try {
    responseBody = JSON.parse(response.body);
  } catch {
    responseBody = null;
  }

  const telegramOk =
    typeof responseBody === 'object' && responseBody !== null && 'ok' in responseBody && responseBody.ok === true;
  if (response.statusCode < 200 || response.statusCode >= 300 || !telegramOk) {
    throw telegramError('Telegram returned an error', 'telegram_error', response.statusCode);
  }
}

export { _private } from './routes';
