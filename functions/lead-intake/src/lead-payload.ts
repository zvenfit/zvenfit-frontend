import type { HandlerDependencies, JsonObject, Lead, Utm, UtmKey } from './types';

const MAX_FIELD_LEN = 256;
const UTM_MAX_LEN = 128;
const LEAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const TRACKED_UTM_PARAMS: readonly UtmKey[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'yclid',
  'gclid',
  'fbclid',
];

export function sanitize(value: unknown, maxLen = MAX_FIELD_LEN): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}

export function parseUtm(raw: unknown): Utm {
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

export function createLead(body: JsonObject, dependencies: Pick<HandlerDependencies, 'now' | 'uuid'>): Lead {
  return {
    leadId: sanitize(body.submission_id, 64) || dependencies.uuid(),
    createdAt: dependencies.now(),
    name: sanitize(body.name),
    phone: sanitize(body.phone, 32),
    service: sanitize(body.service, 64),
    telegramUsername: sanitize(body.telegram_username),
    utm: parseUtm(body.utm),
  };
}

export function validateLead(lead: Lead): string | null {
  if (!lead.name || !lead.phone || !lead.service) {
    return 'validation_failed';
  }

  if (lead.service === 'Telegram' && !lead.telegramUsername) {
    return 'telegram_username_required';
  }

  return LEAD_ID_PATTERN.test(lead.leadId) ? null : 'invalid_submission_id';
}
