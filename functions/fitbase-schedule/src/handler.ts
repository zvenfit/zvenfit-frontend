import { allowedOrigins, corsHeaders, jsonResponse, resolveDateRange } from './http';
import { createInvocationLogger, logScheduleFailure } from './observability/logger';
import { createScheduleProvider } from './providers';

import type {
  FitbaseError,
  FunctionContext,
  HandlerOverrides,
  HttpEvent,
  HttpResponse,
  ScheduleProvider,
} from './types';

type CloudHandler = (event: HttpEvent, context?: FunctionContext) => Promise<HttpResponse>;

function createHandler(overrides: HandlerOverrides = {}): CloudHandler {
  const loggerFactory = overrides.loggerFactory || createInvocationLogger;
  const providerFactory = overrides.providerFactory || createScheduleProvider;

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

    const range = resolveDateRange(event.queryStringParameters || {});
    if (range.error) {
      return jsonResponse(400, { ok: false, error: range.error }, headers, false);
    }

    let provider: ScheduleProvider;
    try {
      provider = providerFactory(process.env);
    } catch {
      const requestedProvider = (process.env.SCHEDULE_PROVIDER || 'fitbase').trim();
      const eventName =
        requestedProvider === 'fitbase' ? 'fitbase_schedule_misconfigured' : 'schedule_provider_misconfigured';
      logScheduleFailure(logger, eventName);

      return jsonResponse(500, { ok: false, error: 'server_misconfigured' }, headers, false);
    }

    try {
      const items = await provider.getSchedule(range.from, range.to);

      return jsonResponse(200, { ok: true, from: range.from, to: range.to, count: items.length, items }, headers);
    } catch (error) {
      const eventName = provider.name === 'fitbase' ? 'fitbase_schedule_error' : 'fixture_schedule_error';
      logScheduleFailure(logger, eventName, error instanceof Error ? (error as FitbaseError) : undefined);

      const errorCode = provider.name === 'fitbase' ? 'fitbase_unreachable' : 'schedule_unavailable';

      return jsonResponse(502, { ok: false, error: errorCode }, headers, false);
    }
  };
}

export const handler = createHandler();
export const _private = { createHandler };
