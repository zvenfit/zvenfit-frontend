import type { Headers, HttpEvent, HttpResponse, JsonObject } from './types';

export function allowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS || 'https://zvenfit.ru,https://www.zvenfit.ru';

  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function resolveOrigin(requestOrigin: string, origins: string[]): string {
  if (requestOrigin && origins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return origins[0] || 'https://zvenfit.ru';
}

export function corsHeaders(origin: string, origins: string[]): Headers {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(origin, origins),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function jsonResponse(statusCode: number, payload: JsonObject, headers: Headers): HttpResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: JSON.stringify(payload),
  };
}

export function readBody(event: HttpEvent): JsonObject {
  if (!event.body) {
    return {};
  }

  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const parsed: unknown = JSON.parse(raw);

  return typeof parsed === 'object' && parsed !== null ? (parsed as JsonObject) : {};
}
