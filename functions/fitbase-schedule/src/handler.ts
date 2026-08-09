import { fetchAllSchedule } from './fitbase/client';
import { allowedOrigins, corsHeaders, jsonResponse, resolveDateRange } from './http';
import { createInvocationLogger, logScheduleFailure } from './observability/logger';

import type { FitbaseError, FunctionContext, HandlerOverrides, HttpEvent, HttpResponse } from './types';

type CloudHandler = (event: HttpEvent, context?: FunctionContext) => Promise<HttpResponse>;

function createHandler(overrides: HandlerOverrides = {}): CloudHandler {
  const loggerFactory = overrides.loggerFactory || createInvocationLogger;

  return async (event, context) => {
    const logger = loggerFactory(context);
    const origins = allowedOrigins();
    const headers = corsHeaders(event.headers?.Origin || event.headers?.origin || '', origins);
    const method = (event.httpMethod || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      return { statusCode: 204, headers, body: '' };
    }
    if (method !== 'GET') {
      return jsonResponse(405, { ok: false, error: 'method_not_allowed' }, headers, false);
    }

    const token = process.env.FITBASE_API_TOKEN;
    if (!token) {
      const eventName = 'fitbase_schedule_misconfigured';
      logScheduleFailure(logger, eventName);

      return jsonResponse(500, { ok: false, error: 'server_misconfigured' }, headers, false);
    }

    const range = resolveDateRange(event.queryStringParameters || {});
    if (range.error) {
      return jsonResponse(400, { ok: false, error: range.error }, headers, false);
    }

    const fitbaseHeaders = {
      domain: process.env.FITBASE_DOMAIN || 'zvenfit',
      Authorization: `Bearer ${token}`,
    };
    const clubId = (process.env.FITBASE_CLUB_ID || '').trim();

    try {
      const items = await fetchAllSchedule(range.from, range.to, fitbaseHeaders, clubId);

      return jsonResponse(200, { ok: true, from: range.from, to: range.to, count: items.length, items }, headers);
    } catch (error) {
      const eventName = 'fitbase_schedule_error';
      logScheduleFailure(logger, eventName, error instanceof Error ? (error as FitbaseError) : undefined);

      return jsonResponse(502, { ok: false, error: 'fitbase_unreachable' }, headers, false);
    }
  };
}

export const handler = createHandler();
export const _private = { createHandler };
