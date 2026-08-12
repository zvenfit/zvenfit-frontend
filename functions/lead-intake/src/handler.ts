import { randomUUID } from 'node:crypto';

import { allowedOrigins, corsHeaders, jsonResponse, readBody } from './http';
import { createLead, hasHoneypotValue, validateLead } from './lead-payload';
import { withEventMetrics } from './observability/event-metrics';
import { createInvocationLogger } from './observability/logger';
import { createInvocationMetrics } from './observability/metrics';
import {
  errorCode,
  logDeliveryFailure,
  maxTelegramAttempts,
  retryPendingLeads,
  sendTelegram,
  type RetrySummary,
} from './telegram/delivery';
import * as leadStore from './ydb/lead-store';
import { consumeLeadRateLimit } from './ydb/rate-limit';

import type {
  ApplicationMetrics,
  FunctionContext,
  HandlerDependencies,
  HttpEvent,
  HttpResponse,
  JsonObject,
  LoggerLike,
} from './types';

const TIMER_EVENT_TYPE = 'yandex.cloud.events.serverless.triggers.TimerMessage';
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

function isTimerEvent(event: HttpEvent): boolean {
  return Array.isArray(event.messages)
    ? event.messages.some(message => message.event_metadata?.event_type === TIMER_EVENT_TYPE)
    : false;
}

type HandlerResult = HttpResponse | RetrySummary;
type CloudHandler = (event: HttpEvent, context?: FunctionContext) => Promise<HandlerResult>;

function requestBodyBytes(event: HttpEvent): number {
  if (!event.body) {
    return 0;
  }

  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').byteLength : Buffer.byteLength(event.body, 'utf8');
}

function logBlockedSubmission(logger: LoggerLike, reason: string): void {
  const event = 'lead_submission_blocked';
  logger.warn?.({ event, reason }, event);
}

function createDependencies(overrides: Partial<HandlerDependencies>): HandlerDependencies {
  return {
    loggerFactory: createInvocationLogger,
    maxAttempts: maxTelegramAttempts,
    metricsFactory: createInvocationMetrics,
    now: () => new Date(),
    rateLimiter: consumeLeadRateLimit,
    store: leadStore,
    telegramSender: sendTelegram,
    uuid: randomUUID,
    ...overrides,
  };
}

async function persistLead(
  body: JsonObject,
  dependencies: HandlerDependencies,
  logger: LoggerLike,
  metrics: ApplicationMetrics,
  headers: Record<string, string>,
  sourceIp: string,
): Promise<HttpResponse> {
  const lead = createLead(body, dependencies);
  const validationError = validateLead(lead);

  if (validationError) {
    return jsonResponse(400, { ok: false, error: validationError }, headers);
  }

  if (sourceIp) {
    try {
      const allowed = await dependencies.rateLimiter({ sourceIp, now: dependencies.now(), logger });
      if (!allowed) {
        logBlockedSubmission(logger, 'rate_limit');

        return jsonResponse(429, { ok: false, error: 'rate_limit_exceeded' }, headers);
      }
    } catch {
      const event = 'lead_rate_limit_error';
      logger.error({ event, error_code: 'rate_limit_unavailable' }, event);
    }
  }

  try {
    const saved = await dependencies.store.saveLead(lead, { logger });
    if (saved.created) {
      const event = 'lead_persisted';
      logger.info?.({ event }, event);
    }
    if (saved.telegramStatus === 'sent') {
      return jsonResponse(200, { ok: true, lead_id: lead.leadId, notification: 'sent' }, headers);
    }

    return jsonResponse(202, { ok: true, lead_id: lead.leadId, notification: saved.telegramStatus }, headers);
  } catch (error) {
    logDeliveryFailure(logger, 'lead_storage_error', lead.leadId, errorCode(error, 'storage_error'), 0);
    metrics.addCounter('zvenfit_lead_storage_errors');

    return jsonResponse(503, { ok: false, error: 'storage_unavailable' }, headers);
  }
}

function createHandler(overrides: Partial<HandlerDependencies> = {}): CloudHandler {
  const dependencies = createDependencies(overrides);

  return async (event, context) => {
    const baseLogger = dependencies.loggerFactory(context);
    const metrics = dependencies.metricsFactory(context, baseLogger);
    const logger = withEventMetrics(baseLogger, metrics);

    try {
      if (isTimerEvent(event)) {
        const retrySummary = await retryPendingLeads(dependencies, logger);

        return retrySummary;
      }

      const origins = allowedOrigins();
      const headers = corsHeaders(event.headers?.Origin || event.headers?.origin || '', origins);
      const method = (event.httpMethod || 'GET').toUpperCase();

      if (method === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
      }
      if (method !== 'POST') {
        return jsonResponse(405, { ok: false, error: 'method_not_allowed' }, headers);
      }
      if (requestBodyBytes(event) > MAX_REQUEST_BODY_BYTES) {
        logBlockedSubmission(logger, 'payload_too_large');

        return jsonResponse(413, { ok: false, error: 'payload_too_large' }, headers);
      }

      let body: JsonObject;
      try {
        body = readBody(event);
      } catch {
        return jsonResponse(400, { ok: false, error: 'invalid_json' }, headers);
      }
      if (hasHoneypotValue(body)) {
        logBlockedSubmission(logger, 'honeypot');

        return jsonResponse(200, { ok: true }, headers);
      }

      const sourceIp = event.requestContext?.identity?.sourceIp?.trim() || '';

      const response = await persistLead(body, dependencies, logger, metrics, headers, sourceIp);

      return response;
    } finally {
      await metrics.flush();
    }
  };
}

export const handler = createHandler();
export const _private = { createHandler, isTimerEvent, requestBodyBytes };
