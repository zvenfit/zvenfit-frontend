import { randomUUID } from 'node:crypto';

import { allowedOrigins, corsHeaders, jsonResponse, readBody } from './http';
import { createLead, validateLead } from './lead-payload';
import { createInvocationLogger } from './observability/logger';
import {
  deliverLead,
  errorCode,
  logDeliveryFailure,
  maxTelegramAttempts,
  retryPendingLeads,
  sendTelegram,
  type RetrySummary,
} from './telegram/delivery';
import * as leadStore from './ydb/lead-store';

import type { FunctionContext, HandlerDependencies, HttpEvent, HttpResponse, JsonObject, LoggerLike } from './types';

const TIMER_EVENT_TYPE = 'yandex.cloud.events.serverless.triggers.TimerMessage';

function isTimerEvent(event: HttpEvent): boolean {
  return Array.isArray(event.messages)
    ? event.messages.some(message => message.event_metadata?.event_type === TIMER_EVENT_TYPE)
    : false;
}

type HandlerResult = HttpResponse | RetrySummary;
type CloudHandler = (event: HttpEvent, context?: FunctionContext) => Promise<HandlerResult>;

function createDependencies(overrides: Partial<HandlerDependencies>): HandlerDependencies {
  return {
    loggerFactory: createInvocationLogger,
    maxAttempts: maxTelegramAttempts,
    now: () => new Date(),
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
  headers: Record<string, string>,
): Promise<HttpResponse> {
  const lead = createLead(body, dependencies);
  const validationError = validateLead(lead);

  if (validationError) {
    return jsonResponse(400, { ok: false, error: validationError }, headers);
  }

  let savedStatus = 'pending';
  try {
    const saved = await dependencies.store.saveLead(lead, { logger });
    savedStatus = saved.telegramStatus;
    if (saved.telegramStatus === 'sent') {
      return jsonResponse(200, { ok: true, lead_id: lead.leadId, notification: 'sent' }, headers);
    }
  } catch (error) {
    logDeliveryFailure(logger, 'lead_storage_error', lead.leadId, errorCode(error, 'storage_error'), 0);

    return jsonResponse(503, { ok: false, error: 'storage_unavailable' }, headers);
  }

  let notification: 'sent' | 'pending' | 'failed' | 'skipped' = 'pending';
  try {
    notification = await deliverLead(lead.leadId, dependencies, logger);
    if (notification === 'skipped') {
      notification = savedStatus === 'failed' ? 'failed' : 'pending';
    }
  } catch (error) {
    logDeliveryFailure(logger, 'telegram_delivery_state_error', lead.leadId, errorCode(error, 'storage_error'), 0);
  }

  return jsonResponse(200, { ok: true, lead_id: lead.leadId, notification }, headers);
}

function createHandler(overrides: Partial<HandlerDependencies> = {}): CloudHandler {
  const dependencies = createDependencies(overrides);

  return async (event, context) => {
    const logger = dependencies.loggerFactory(context);
    if (isTimerEvent(event)) {
      return retryPendingLeads(dependencies, logger);
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

    let body: JsonObject;
    try {
      body = readBody(event);
    } catch {
      return jsonResponse(400, { ok: false, error: 'invalid_json' }, headers);
    }

    return persistLead(body, dependencies, logger, headers);
  };
}

export const handler = createHandler();
export const _private = { createHandler, isTimerEvent };
