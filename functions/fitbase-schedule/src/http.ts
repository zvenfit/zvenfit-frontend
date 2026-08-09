import type { Headers, HttpResponse, JsonObject } from './types';

const DEFAULT_RANGE_DAYS = 14;
const CACHE_MAX_AGE_SECONDS = 300;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function allowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS || 'https://zvenfit.ru,https://www.zvenfit.ru,https://zvenigorod.zvenfit.ru';

  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function resolveOrigin(requestOrigin: string, origins: string[]): string {
  return requestOrigin && origins.includes(requestOrigin) ? requestOrigin : origins[0] || 'https://zvenfit.ru';
}

export function corsHeaders(origin: string, origins: string[]): Headers {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(origin, origins),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function jsonResponse(statusCode: number, payload: JsonObject, headers: Headers, cache = true): HttpResponse {
  const responseHeaders: Headers = { 'Content-Type': 'application/json; charset=utf-8', ...headers };
  if (cache) {
    responseHeaders['Cache-Control'] = `public, max-age=${CACHE_MAX_AGE_SECONDS}`;
  }

  return { statusCode, headers: responseHeaders, body: JSON.stringify(payload) };
}

function getMoscowDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(date);
}

function addDaysToDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));

  return utcDate.toISOString().slice(0, 10);
}

function parseDateParam(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return DATE_PATTERN.test(trimmed) ? trimmed : null;
}

export type DateRange =
  | { from: string; to: string; error?: never }
  | { error: 'invalid_range'; from?: never; to?: never };

export function resolveDateRange(query: Record<string, string | undefined>): DateRange {
  const today = getMoscowDateString();
  const from = parseDateParam(query.from) || today;
  const to = parseDateParam(query.to) || addDaysToDateString(from, DEFAULT_RANGE_DAYS - 1);

  return from > to ? { error: 'invalid_range' } : { from, to };
}
