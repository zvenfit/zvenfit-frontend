import { allowedOrigins, corsHeaders, jsonResponse, resolveDateRange } from './http';
import { logScheduleFailure } from './observability/logger';

import type { FunctionContext, HandlerDependencies, HttpEvent, HttpResponse, ScheduleProvider } from './types';

type CloudHandler = (event: HttpEvent, context?: FunctionContext) => Promise<HttpResponse>;

export function createHandler(dependencies: HandlerDependencies): CloudHandler {
  return async (event, context) => {
    const logger = dependencies.loggerFactory(context);
    const origins = allowedOrigins();
    const headers = corsHeaders(event.headers?.Origin || event.headers?.origin || '', origins);
    const method = (event.httpMethod || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      return { statusCode: 204, headers, body: '' };
    }
    if (method !== 'GET') {
      return jsonResponse(405, { ok: false, error: 'method_not_allowed' }, headers, false);
    }

    const range = resolveDateRange(event.queryStringParameters || {});
    if (range.error) {
      return jsonResponse(400, { ok: false, error: range.error }, headers, false);
    }

    let provider: ScheduleProvider;
    try {
      provider = dependencies.providerFactory();
    } catch (error) {
      logScheduleFailure(logger, dependencies.failurePolicy.misconfiguredEvent, error, false);

      return jsonResponse(500, { ok: false, error: 'server_misconfigured' }, headers, false);
    }

    try {
      const items = await provider.getSchedule(range.from, range.to);

      return jsonResponse(200, { ok: true, from: range.from, to: range.to, count: items.length, items }, headers);
    } catch (error) {
      logScheduleFailure(logger, dependencies.failurePolicy.unavailableEvent, error, true);

      return jsonResponse(502, { ok: false, error: dependencies.failurePolicy.unavailableError }, headers, false);
    }
  };
}

export const _private = { createHandler };
