/* eslint-disable max-lines */

import { randomUUID } from 'node:crypto';

import * as leadStore from './lead-store';
import { createInvocationLogger } from './logger';

import type {
  ClaimedLead,
  FunctionContext,
  HandlerDependencies,
  Headers,
  HttpEvent,
  HttpResponse,
  JsonObject,
  LoggerLike,
  Utm,
  UtmKey,
} from './types';

const MAX_FIELD_LEN = 256;
const UTM_MAX_LEN = 128;
const TELEGRAM_TIMEOUT_MS = 5000;
const TELEGRAM_LEASE_MS = 2 * 60 * 1000;
const RETRY_BATCH_SIZE = 25;
const DEFAULT_MAX_TELEGRAM_ATTEMPTS = 12;
const TIMER_EVENT_TYPE = 'yandex.cloud.events.serverless.triggers.TimerMessage';

const TRACKED_UTM_PARAMS: readonly UtmKey[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'yclid',
  'gclid',
  'fbclid',
];

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

function parseAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS || 'https://zvenfit.ru,https://www.zvenfit.ru';

  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function resolveOrigin(requestOrigin: string, allowedOrigins: string[]): string {
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins[0] || 'https://zvenfit.ru';
}

function corsHeaders(origin: string, allowedOrigins: string[]): Headers {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(origin, allowedOrigins),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(statusCode: number, payload: JsonObject, headers: Headers): HttpResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: JSON.stringify(payload),
  };
}

function readBody(event: HttpEvent): JsonObject {
  if (!event.body) {
    return {};
  }

  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const parsed: unknown = JSON.parse(raw);

  return typeof parsed === 'object' && parsed !== null ? (parsed as JsonObject) : {};
}

function sanitize(value: unknown, maxLen = MAX_FIELD_LEN): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLen);
}

function parseUtm(raw: unknown): Utm {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const input = raw as JsonObject;
  const utm: Utm = {};
  for (const key of TRACKED_UTM_PARAMS) {
    const value = sanitize(input[key], UTM_MAX_LEN);
    if (value) {
      utm[key] = value;
    }
  }

  return utm;
}

function buildMessage(payload: ClaimedLead): string {
  const lines = [
    'Новая заявка',
    `ID: ${payload.leadId}`,
    `Имя: ${payload.name}`,
    `Телефон: ${payload.phone}`,
    `Способ связи: ${payload.service}`,
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

function errorCode(error: unknown, fallback = 'internal_error'): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return sanitize(error.code, 64) || fallback;
  }

  return fallback;
}

function logDeliveryFailure(logger: LoggerLike, event: string, leadId: string, code: string, attempts: number): void {
  logger.error(
    {
      event,
      lead_id: leadId,
      error_code: code,
      attempts,
    },
    event,
  );
}

function maxTelegramAttempts(): number {
  const value = Number.parseInt(process.env.MAX_TELEGRAM_ATTEMPTS ?? '', 10);

  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_TELEGRAM_ATTEMPTS;
}

function nextRetryAt(now: Date, attempts: number): Date {
  const delayMinutes = [1, 5, 15, 60, 6 * 60][Math.min(Math.max(attempts - 1, 0), 4)] ?? 1;

  return new Date(now.getTime() + delayMinutes * 60 * 1000);
}

function isTimerEvent(event: HttpEvent): boolean {
  return Array.isArray(event.messages)
    ? event.messages.some(message => message.event_metadata?.event_type === TIMER_EVENT_TYPE)
    : false;
}

function telegramError(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

async function sendTelegram(payload: ClaimedLead): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw telegramError('Telegram is not configured', 'telegram_misconfigured');
  }

  let telegramResponse: Response;
  try {
    telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      body: JSON.stringify({
        chat_id: chatId,
        text: buildMessage(payload),
      }),
    });
  } catch {
    throw telegramError('Telegram is unreachable', 'telegram_unreachable');
  }

  let telegramPayload: unknown = null;
  try {
    telegramPayload = await telegramResponse.json();
  } catch {
    telegramPayload = null;
  }

  const telegramOk =
    typeof telegramPayload === 'object' &&
    telegramPayload !== null &&
    'ok' in telegramPayload &&
    telegramPayload.ok === true;
  if (!telegramResponse.ok || !telegramOk) {
    throw telegramError('Telegram returned an error', 'telegram_error');
  }
}

async function deliverLead(
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
    await dependencies.store.markTelegramDelivered({
      leadId,
      deliveryToken,
      notifiedAt: dependencies.now(),
      logger,
    });

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

interface RetrySummary extends JsonObject {
  processed: number;
  sent: number;
  pending: number;
  failed: number;
  skipped: number;
}

async function retryPendingLeads(dependencies: HandlerDependencies, logger: LoggerLike): Promise<RetrySummary> {
  const leadIds = await dependencies.store.listTelegramCandidates({
    now: dependencies.now(),
    limit: RETRY_BATCH_SIZE,
    logger,
  });
  const summary: RetrySummary = { processed: leadIds.length, sent: 0, pending: 0, failed: 0, skipped: 0 };

  for (const leadId of leadIds) {
    try {
      const result = await deliverLead(leadId, dependencies, logger);
      summary[result] += 1;
    } catch (error) {
      summary.pending += 1;
      logDeliveryFailure(logger, 'telegram_delivery_retry_error', leadId, errorCode(error, 'storage_error'), 0);
    }
  }

  return summary;
}

type HandlerResult = HttpResponse | RetrySummary;
type CloudHandler = (event: HttpEvent, context?: FunctionContext) => Promise<HandlerResult>;

function createHandler(overrides: Partial<HandlerDependencies> = {}): CloudHandler {
  const dependencies: HandlerDependencies = {
    loggerFactory: createInvocationLogger,
    maxAttempts: maxTelegramAttempts,
    now: () => new Date(),
    store: leadStore,
    telegramSender: sendTelegram,
    uuid: randomUUID,
    ...overrides,
  };

  return async (event, context) => {
    const logger = dependencies.loggerFactory(context);

    if (isTimerEvent(event)) {
      return retryPendingLeads(dependencies, logger);
    }

    const allowedOrigins = parseAllowedOrigins();
    const origin = event.headers?.Origin || event.headers?.origin || '';
    const headers = corsHeaders(origin, allowedOrigins);
    const method = (event.httpMethod || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      return { statusCode: 204, headers, body: '' };
    }

    if (method !== 'POST') {
      return jsonResponse(405, { ok: false, error: 'method_not_allowed' }, headers);
    }

    let body: JsonObject;
    try {
      body = readBody(event);
    } catch {
      return jsonResponse(400, { ok: false, error: 'invalid_json' }, headers);
    }

    const payload = {
      leadId: sanitize(body.submission_id, 64) || dependencies.uuid(),
      createdAt: dependencies.now(),
      name: sanitize(body.name),
      phone: sanitize(body.phone, 32),
      service: sanitize(body.service, 64),
      telegramUsername: sanitize(body.telegram_username),
      utm: parseUtm(body.utm),
    };

    if (!payload.name || !payload.phone || !payload.service) {
      return jsonResponse(400, { ok: false, error: 'validation_failed' }, headers);
    }

    if (payload.service === 'Telegram' && !payload.telegramUsername) {
      return jsonResponse(400, { ok: false, error: 'telegram_username_required' }, headers);
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.leadId)) {
      return jsonResponse(400, { ok: false, error: 'invalid_submission_id' }, headers);
    }

    let savedStatus = 'pending';
    try {
      const saved = await dependencies.store.saveLead(payload, { logger });
      savedStatus = saved.telegramStatus;

      if (saved.telegramStatus === 'sent') {
        return jsonResponse(200, { ok: true, lead_id: payload.leadId, notification: 'sent' }, headers);
      }
    } catch (error) {
      logDeliveryFailure(logger, 'lead_storage_error', payload.leadId, errorCode(error, 'storage_error'), 0);

      return jsonResponse(503, { ok: false, error: 'storage_unavailable' }, headers);
    }

    let notification: 'sent' | 'pending' | 'failed' | 'skipped' = 'pending';
    try {
      notification = await deliverLead(payload.leadId, dependencies, logger);
      if (notification === 'skipped') {
        notification = savedStatus === 'failed' ? 'failed' : 'pending';
      }
    } catch (error) {
      logDeliveryFailure(logger, 'telegram_delivery_state_error', payload.leadId, errorCode(error, 'storage_error'), 0);
    }

    return jsonResponse(200, { ok: true, lead_id: payload.leadId, notification }, headers);
  };
}

export const handler = createHandler();
export const _private = {
  buildMessage,
  createHandler,
  deliverLead,
  isTimerEvent,
  nextRetryAt,
  parseUtm,
  retryPendingLeads,
  sanitize,
};
