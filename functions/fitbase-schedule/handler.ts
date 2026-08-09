/* eslint-disable max-lines */

import { createInvocationLogger, logScheduleFailure } from './logger';

import type {
  FitbaseError,
  FitbaseItem,
  FunctionContext,
  HandlerOverrides,
  Headers,
  HttpEvent,
  HttpResponse,
  JsonObject,
  ScheduleItem,
  Trainer,
} from './types';

const FITBASE_API_BASE = 'https://api.fitbase.io/api/v2/schedule';
const DEFAULT_RANGE_DAYS = 14;
const PAGE_SIZE = 100;
const CACHE_MAX_AGE_SECONDS = 300;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS || 'https://zvenfit.ru,https://www.zvenfit.ru,https://zvenigorod.zvenfit.ru';

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(statusCode: number, payload: JsonObject, headers: Headers, cache = true): HttpResponse {
  const responseHeaders: Headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  };

  if (cache) {
    responseHeaders['Cache-Control'] = `public, max-age=${CACHE_MAX_AGE_SECONDS}`;
  }

  return {
    statusCode,
    headers: responseHeaders,
    body: JSON.stringify(payload),
  };
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
  if (!DATE_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

type DateRange = { from: string; to: string; error?: never } | { error: 'invalid_range'; from?: never; to?: never };

function resolveDateRange(query: Record<string, string | undefined>): DateRange {
  const today = getMoscowDateString();
  const from = parseDateParam(query.from) || today;
  const to = parseDateParam(query.to) || addDaysToDateString(from, DEFAULT_RANGE_DAYS - 1);

  if (from > to) {
    return { error: 'invalid_range' };
  }

  return { from, to };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function trainerName(trainer: Trainer): string {
  if (trainer.full_name) {
    return String(trainer.full_name).trim();
  }

  return [trainer.surname, trainer.name, trainer.patronymic].filter(Boolean).map(String).join(' ').trim();
}

function mapScheduleItem(item: FitbaseItem): ScheduleItem {
  const training = item.training || {};
  const place = item.place || {};
  const transfer = item.transfer_event || null;

  return {
    id: item.id,
    date: item.date || '',
    timeStart: item.time_start || '',
    timeEnd: item.time_end || '',
    duration: item.duration ?? null,
    title: training.name || 'Занятие',
    description: training.description || '',
    color: training.color || '',
    trainers: Array.isArray(item.trainers)
      ? item.trainers
          .map(trainer => ({
            name: trainerName(trainer),
            photo: stringValue(trainer.photo),
          }))
          .filter(trainer => trainer.name)
      : [],
    place: place.name || '',
    club: item.club?.name || '',
    type: item.event_type || '',
    ageType: item.age_type || '',
    cancelled: Boolean(item.cancel),
    registrationClosed: Boolean(item.stop_registration),
    registrationRequired: Boolean(item.need_register),
    maxParticipants: item.max_register ?? null,
    transfer: transfer
      ? {
          date: transfer.date || '',
          timeStart: transfer.time_start || '',
          timeEnd: transfer.time_end || '',
        }
      : null,
  };
}

function shouldIncludeItem(item: unknown): item is FitbaseItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const scheduleItem = item as FitbaseItem;

  return scheduleItem.event_type !== 'rent' && scheduleItem.is_archive !== 1;
}

function sortItems(items: ScheduleItem[]): ScheduleItem[] {
  return items.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    return left.timeStart.localeCompare(right.timeStart);
  });
}

interface FitbasePage {
  items?: unknown[];
  total_count?: unknown;
}

async function fetchSchedulePage(params: URLSearchParams, headers: Headers): Promise<FitbasePage> {
  const url = new URL(FITBASE_API_BASE);

  for (const [key, value] of params.entries()) {
    url.searchParams.append(key, value);
  }

  const response = await fetch(url, { headers });
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error('fitbase_request_failed') as FitbaseError;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return typeof payload === 'object' && payload !== null ? (payload as FitbasePage) : {};
}

async function fetchAllSchedule(
  from: string,
  to: string,
  fitbaseHeaders: Headers,
  clubId: string,
): Promise<ScheduleItem[]> {
  const items: ScheduleItem[] = [];
  let page = 1;
  let totalCount = Infinity;

  while (items.length < totalCount) {
    const params = new URLSearchParams({
      date_from: from,
      date_to: to,
      is_archive: '-1',
      page: String(page),
      page_size: String(PAGE_SIZE),
    });

    if (clubId) {
      params.append('club_ids[]', clubId);
    }

    const payload = await fetchSchedulePage(params, fitbaseHeaders);
    const batch = Array.isArray(payload.items) ? payload.items : [];
    totalCount = Number(payload.total_count ?? batch.length);

    for (const item of batch) {
      if (shouldIncludeItem(item)) {
        items.push(mapScheduleItem(item));
      }
    }

    if (batch.length === 0) {
      break;
    }

    page += 1;
  }

  return sortItems(items);
}

type CloudHandler = (event: HttpEvent, context?: FunctionContext) => Promise<HttpResponse>;

function createHandler(overrides: HandlerOverrides = {}): CloudHandler {
  const loggerFactory = overrides.loggerFactory || createInvocationLogger;

  return async (event, context) => {
    const logger = loggerFactory(context);
    const allowedOrigins = parseAllowedOrigins();
    const origin = event.headers?.Origin || event.headers?.origin || '';
    const headers = corsHeaders(origin, allowedOrigins);
    const method = (event.httpMethod || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      return { statusCode: 204, headers, body: '' };
    }

    if (method !== 'GET') {
      return jsonResponse(405, { ok: false, error: 'method_not_allowed' }, headers, false);
    }

    const token = process.env.FITBASE_API_TOKEN;
    const domain = process.env.FITBASE_DOMAIN || 'zvenfit';
    const clubId = (process.env.FITBASE_CLUB_ID || '').trim();

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
      domain,
      Authorization: `Bearer ${token}`,
    };

    try {
      const items = await fetchAllSchedule(range.from, range.to, fitbaseHeaders, clubId);

      return jsonResponse(
        200,
        {
          ok: true,
          from: range.from,
          to: range.to,
          count: items.length,
          items,
        },
        headers,
      );
    } catch (error) {
      const eventName = 'fitbase_schedule_error';
      logScheduleFailure(logger, eventName, error instanceof Error ? (error as FitbaseError) : undefined);

      return jsonResponse(502, { ok: false, error: 'fitbase_unreachable' }, headers, false);
    }
  };
}

export const handler = createHandler();
export const _private = { createHandler };
