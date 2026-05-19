'use strict';

const MAX_FIELD_LEN = 256;

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || 'https://zvenfit.ru,https://www.zvenfit.ru';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveOrigin(requestOrigin, allowedOrigins) {
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowedOrigins[0] || 'https://zvenfit.ru';
}

function corsHeaders(origin, allowedOrigins) {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(origin, allowedOrigins),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(statusCode, payload, headers) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: JSON.stringify(payload),
  };
}

function readBody(event) {
  if (!event.body) {
    return {};
  }

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  return JSON.parse(raw);
}

function sanitize(value, maxLen = MAX_FIELD_LEN) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, maxLen);
}

function buildMessage(payload) {
  const lines = [
    'Новая заявка',
    `Имя: ${payload.name}`,
    `Телефон: ${payload.phone}`,
    `Способ связи: ${payload.service}`,
  ];

  if (payload.telegram_username) {
    lines.push(`Телеграм: ${payload.telegram_username}`);
  }

  return lines.join('\n');
}

module.exports.handler = async (event) => {
  const allowedOrigins = parseAllowedOrigins();
  const origin = event.headers?.Origin || event.headers?.origin || '';
  const headers = corsHeaders(origin, allowedOrigins);
  const method = (event.httpMethod || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  if (method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'method_not_allowed' }, headers);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return jsonResponse(500, { ok: false, error: 'server_misconfigured' }, headers);
  }

  let body;
  try {
    body = readBody(event);
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_json' }, headers);
  }

  const payload = {
    name: sanitize(body.name),
    phone: sanitize(body.phone, 32),
    service: sanitize(body.service, 64),
    telegram_username: sanitize(body.telegram_username),
  };

  if (!payload.name || !payload.phone || !payload.service) {
    return jsonResponse(400, { ok: false, error: 'validation_failed' }, headers);
  }

  if (payload.service === 'Telegram' && !payload.telegram_username) {
    return jsonResponse(400, { ok: false, error: 'telegram_username_required' }, headers);
  }

  const text = buildMessage(payload);

  let telegramResponse;
  try {
    telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
  } catch {
    return jsonResponse(502, { ok: false, error: 'telegram_unreachable' }, headers);
  }

  let telegramPayload = null;
  try {
    telegramPayload = await telegramResponse.json();
  } catch {
    telegramPayload = null;
  }

  if (!telegramResponse.ok || !telegramPayload?.ok) {
    return jsonResponse(502, { ok: false, error: 'telegram_error' }, headers);
  }

  return jsonResponse(200, { ok: true }, headers);
};
