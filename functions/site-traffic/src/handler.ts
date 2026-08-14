import { classifyTraffic } from './classify';
import { createInvocationLogger } from './logger';

import type { FunctionContext, HandlerDependencies, Headers, HttpEvent, HttpResponse, PageViewPayload } from './types';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_URL_LENGTH = 4096;
const MAX_ID_LENGTH = 128;
const DEFAULT_ORIGINS = ['https://zvenfit.ru', 'https://www.zvenfit.ru', 'https://zvenigorod.zvenfit.ru'];

type CloudHandler = (event: HttpEvent, context?: FunctionContext) => Promise<HttpResponse>;

function headerValue(headers: HttpEvent['headers'], name: string): string {
  if (!headers) {
    return '';
  }

  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());

  return String(entry?.[1] || '').trim();
}

function allowedOrigins(): Set<string> {
  const configured = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  return new Set(configured.length > 0 ? configured : DEFAULT_ORIGINS);
}

function response(statusCode: number, origin: string, body = ''): HttpResponse {
  const headers: Headers = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  if (body) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
  }

  return { statusCode, headers, body };
}

function errorResponse(statusCode: number, origin: string, error: string): HttpResponse {
  return response(statusCode, origin, JSON.stringify({ ok: false, error }));
}

function decodeBody(event: HttpEvent): string {
  const body = event.body || '';
  const decoded = event.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
  if (Buffer.byteLength(decoded, 'utf8') > MAX_BODY_BYTES) {
    throw new Error('payload_too_large');
  }

  return decoded;
}

function parsePayload(event: HttpEvent, origin: string): { payload: PageViewPayload; url: URL } {
  let value: unknown;
  try {
    value = JSON.parse(decodeBody(event));
  } catch (error) {
    if (error instanceof Error && error.message === 'payload_too_large') {
      throw error;
    }
    throw new Error('invalid_json');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_payload');
  }

  const record = value as Record<string, unknown>;
  const urlValue = typeof record.url === 'string' ? record.url.trim() : '';
  const referrer = typeof record.referrer === 'string' ? record.referrer : '';
  const pageViewId = typeof record.page_view_id === 'string' ? record.page_view_id.trim() : '';
  const webdriver = record.webdriver;

  if (!urlValue || urlValue.length > MAX_URL_LENGTH || referrer.length > MAX_URL_LENGTH) {
    throw new Error('invalid_url');
  }
  if (!pageViewId || pageViewId.length > MAX_ID_LENGTH) {
    throw new Error('invalid_page_view_id');
  }
  if (typeof webdriver !== 'boolean') {
    throw new Error('invalid_webdriver');
  }

  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error('invalid_url');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
    throw new Error('invalid_url');
  }
  if (referrer) {
    try {
      const referrerUrl = new URL(referrer);
      if (!['http:', 'https:'].includes(referrerUrl.protocol)) {
        throw new Error('invalid_referrer');
      }
    } catch {
      throw new Error('invalid_referrer');
    }
  }

  return {
    payload: { page_view_id: pageViewId, referrer, url: url.href, webdriver },
    url,
  };
}

function normalizePage(pathname: string): string {
  const withoutIndex = pathname.replace(/\/index\.html$/i, '/');
  if (withoutIndex === '/') {
    return '/';
  }

  return withoutIndex.replace(/\/+$/, '') || '/';
}

function sourceIp(event: HttpEvent): string {
  const contextIp = String(event.requestContext?.identity?.sourceIp || '').trim();
  if (contextIp) {
    return contextIp.slice(0, 128);
  }

  return (
    headerValue(event.headers, 'x-forwarded-for').split(',')[0]?.trim().slice(0, 128) ||
    headerValue(event.headers, 'x-real-ip').slice(0, 128)
  );
}

export function createHandler(dependencies: HandlerDependencies): CloudHandler {
  return async (event, context) => {
    const origin = headerValue(event.headers, 'origin');
    const originAllowed = allowedOrigins().has(origin);
    const method = String(event.httpMethod || 'POST').toUpperCase();

    if (!originAllowed) {
      return errorResponse(403, '', 'origin_not_allowed');
    }
    if (method === 'OPTIONS') {
      return response(204, origin);
    }
    if (method !== 'POST') {
      return errorResponse(405, origin, 'method_not_allowed');
    }

    let parsed: ReturnType<typeof parsePayload>;
    try {
      parsed = parsePayload(event, origin);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'invalid_payload';
      const statusCode = code === 'payload_too_large' ? 413 : 400;

      return errorResponse(statusCode, origin, code);
    }

    const userAgent = headerValue(event.headers, 'user-agent').slice(0, 4096);
    const logger = dependencies.loggerFactory(context);
    logger.info(
      {
        event: 'site_page_view',
        traffic_class: classifyTraffic(userAgent, parsed.payload.webdriver),
        host: parsed.url.host,
        page: normalizePage(parsed.url.pathname),
        url: parsed.payload.url,
        referrer: parsed.payload.referrer,
        ip: sourceIp(event),
        user_agent: userAgent,
        page_view_id: parsed.payload.page_view_id,
        webdriver: parsed.payload.webdriver,
      },
      'site_page_view',
    );

    return response(204, origin);
  };
}

export const handler = createHandler({ loggerFactory: createInvocationLogger });

export const _private = { normalizePage, parsePayload, sourceIp };
