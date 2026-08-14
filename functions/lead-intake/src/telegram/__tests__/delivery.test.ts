import assert from 'node:assert/strict';
import { getDefaultResultOrder } from 'node:dns';
import test from 'node:test';

import { buildMessage, retryBatchSize, sendTelegram, telegramTimeoutMs } from '../delivery';

const LEAD_ID = '1cc32f4f-8f06-4dc8-915f-92955c829523';

function testLead() {
  return {
    leadId: LEAD_ID,
    createdAt: new Date('2026-08-08T12:00:00.000Z'),
    name: 'Анна',
    phone: '+7 (999) 111-22-33',
    contactMethod: 'Позвонить',
    telegramUsername: '',
    utm: {},
    telegramAttempts: 1,
  };
}

test('Telegram networking prefers IPv4 for Yandex Cloud Functions', () => {
  assert.equal(getDefaultResultOrder(), 'ipv4first');
});

test('message includes the stable lead id and selected attribution fields', () => {
  const message = buildMessage({
    leadId: LEAD_ID,
    createdAt: new Date('2026-08-08T12:00:00.000Z'),
    name: 'Анна',
    phone: '+7 (999) 111-22-33',
    contactMethod: 'Telegram',
    telegramUsername: '@anna',
    utm: { utm_source: 'direct' },
    telegramAttempts: 1,
  });

  assert.match(message, new RegExp(`ID: ${LEAD_ID}`));
  assert.match(message, /Телеграм: @anna/);
  assert.match(message, /source: direct/);
});

test('Telegram timeout is configurable and capped below the function timeout', () => {
  const previousTimeout = process.env.TELEGRAM_TIMEOUT_MS;

  try {
    delete process.env.TELEGRAM_TIMEOUT_MS;
    assert.equal(telegramTimeoutMs(), 15_000);

    process.env.TELEGRAM_TIMEOUT_MS = '20000';
    assert.equal(telegramTimeoutMs(), 20_000);

    process.env.TELEGRAM_TIMEOUT_MS = '999999';
    assert.equal(telegramTimeoutMs(), 25_000);
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.TELEGRAM_TIMEOUT_MS;
    } else {
      process.env.TELEGRAM_TIMEOUT_MS = previousTimeout;
    }
  }
});

test('Telegram worker uses a small configurable retry batch', () => {
  const previousBatchSize = process.env.TELEGRAM_RETRY_BATCH_SIZE;

  try {
    delete process.env.TELEGRAM_RETRY_BATCH_SIZE;
    assert.equal(retryBatchSize(), 5);

    process.env.TELEGRAM_RETRY_BATCH_SIZE = '10';
    assert.equal(retryBatchSize(), 10);

    process.env.TELEGRAM_RETRY_BATCH_SIZE = '999';
    assert.equal(retryBatchSize(), 25);
  } finally {
    if (previousBatchSize === undefined) {
      delete process.env.TELEGRAM_RETRY_BATCH_SIZE;
    } else {
      process.env.TELEGRAM_RETRY_BATCH_SIZE = previousBatchSize;
    }
  }
});

test('Telegram network failures preserve a safe diagnostic code', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChatId = process.env.TELEGRAM_CHAT_ID;
  const previousFetch = globalThis.fetch;

  process.env.TELEGRAM_BOT_TOKEN = '123456789:test-token-value-with-valid-length';
  process.env.TELEGRAM_CHAT_ID = '-1001234567890';
  globalThis.fetch = (async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
  }) as typeof fetch;

  try {
    await assert.rejects(
      sendTelegram(testLead()),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'telegram_und_err_connect_timeout' &&
        !error.message.includes(process.env.TELEGRAM_BOT_TOKEN ?? ''),
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = previousToken;
    }
    if (previousChatId === undefined) {
      delete process.env.TELEGRAM_CHAT_ID;
    } else {
      process.env.TELEGRAM_CHAT_ID = previousChatId;
    }
  }
});

test('staging fixture delivery never contacts Telegram', async () => {
  const previousMode = process.env.TELEGRAM_DELIVERY_MODE;
  const previousFetch = globalThis.fetch;
  let fetched = false;
  process.env.TELEGRAM_DELIVERY_MODE = 'fixture';
  globalThis.fetch = (async () => {
    fetched = true;
    throw new Error('unexpected_fetch');
  }) as typeof fetch;

  try {
    await sendTelegram(testLead());
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousMode === undefined) {
      delete process.env.TELEGRAM_DELIVERY_MODE;
    } else {
      process.env.TELEGRAM_DELIVERY_MODE = previousMode;
    }
  }
});
