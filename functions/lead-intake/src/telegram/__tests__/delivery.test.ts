import assert from 'node:assert/strict';
import { getDefaultResultOrder } from 'node:dns';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';

import { _private, buildMessage, sendTelegram, telegramTimeoutMs } from '../delivery';

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

test('Telegram network failures preserve a safe diagnostic code', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChatId = process.env.TELEGRAM_CHAT_ID;
  let requestOptions: Record<string, unknown> = {};

  process.env.TELEGRAM_BOT_TOKEN = '123456789:test-token-value-with-valid-length';
  process.env.TELEGRAM_CHAT_ID = '-1001234567890';
  const requestFactory = ((_url: URL, options: Record<string, unknown>) => {
    requestOptions = options;
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      process.nextTick(() => {
        request.emit('error', Object.assign(new Error('connect timeout'), { code: 'ETIMEDOUT' }));
      });
    };

    return request;
  }) as never;

  try {
    _private.resetTelegramRouteCache();
    await assert.rejects(
      sendTelegram(testLead(), requestFactory),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'telegram_etimedout' &&
        !error.message.includes(process.env.TELEGRAM_BOT_TOKEN ?? ''),
    );
    assert.equal(requestOptions.family, 4);
  } finally {
    _private.resetTelegramRouteCache();
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

test('Telegram falls back after a safe probe and sends exactly one POST', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChatId = process.env.TELEGRAM_CHAT_ID;
  const previousFallbackIpv4s = process.env.TELEGRAM_API_FALLBACK_IPV4S;
  let postCount = 0;
  let postLookup: unknown;

  process.env.TELEGRAM_BOT_TOKEN = '123456789:test-token-value-with-valid-length';
  process.env.TELEGRAM_CHAT_ID = '-1001234567890';
  process.env.TELEGRAM_API_FALLBACK_IPV4S = '149.154.167.220';
  const requestFactory = ((_url: URL, options: Record<string, unknown>, callback: Function) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      if (options.method === 'HEAD' && !options.lookup) {
        request.emit('error', Object.assign(new Error('connect timeout'), { code: 'ETIMEDOUT' }));

        return;
      }
      const response = new Readable({ read() {} }) as Readable & { statusCode: number };
      response.statusCode = options.method === 'HEAD' ? 302 : 200;
      callback(response);
      if (options.method === 'POST') {
        postCount += 1;
        postLookup = options.lookup;
        response.push('{"ok":true}');
      }
      response.push(null);
    };

    return request;
  }) as never;

  try {
    _private.resetTelegramRouteCache();
    await sendTelegram(testLead(), requestFactory);
    assert.equal(postCount, 1);
    assert.equal(typeof postLookup, 'function');
    assert.deepEqual(
      await new Promise(resolve => {
        (postLookup as Function)(
          'api.telegram.org',
          { all: true, family: 4 },
          (error: Error | null, addresses: unknown) => resolve({ error, addresses }),
        );
      }),
      { error: null, addresses: [{ address: '149.154.167.220', family: 4 }] },
    );
  } finally {
    _private.resetTelegramRouteCache();
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
    if (previousFallbackIpv4s === undefined) {
      delete process.env.TELEGRAM_API_FALLBACK_IPV4S;
    } else {
      process.env.TELEGRAM_API_FALLBACK_IPV4S = previousFallbackIpv4s;
    }
  }
});

test('Telegram prefers DNS and reuses the route cache', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChatId = process.env.TELEGRAM_CHAT_ID;
  const previousFallbackIpv4s = process.env.TELEGRAM_API_FALLBACK_IPV4S;
  let headCount = 0;
  const postLookups: unknown[] = [];

  process.env.TELEGRAM_BOT_TOKEN = '123456789:test-token-value-with-valid-length';
  process.env.TELEGRAM_CHAT_ID = '-1001234567890';
  process.env.TELEGRAM_API_FALLBACK_IPV4S = '149.154.167.220';
  const requestFactory = ((_url: URL, options: Record<string, unknown>, callback: Function) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      const response = new Readable({ read() {} }) as Readable & { statusCode: number };
      response.statusCode = options.method === 'HEAD' ? 302 : 200;
      callback(response);
      if (options.method === 'HEAD') {
        headCount += 1;
      } else {
        postLookups.push(options.lookup);
        response.push('{"ok":true}');
      }
      response.push(null);
    };

    return request;
  }) as never;

  try {
    _private.resetTelegramRouteCache();
    await sendTelegram(testLead(), requestFactory);
    await sendTelegram(testLead(), requestFactory);
    assert.equal(headCount, 2);
    assert.deepEqual(postLookups, [undefined, undefined]);
  } finally {
    _private.resetTelegramRouteCache();
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
    if (previousFallbackIpv4s === undefined) {
      delete process.env.TELEGRAM_API_FALLBACK_IPV4S;
    } else {
      process.env.TELEGRAM_API_FALLBACK_IPV4S = previousFallbackIpv4s;
    }
  }
});

test('Telegram never retries an ambiguous POST over another route', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChatId = process.env.TELEGRAM_CHAT_ID;
  const previousFallbackIpv4s = process.env.TELEGRAM_API_FALLBACK_IPV4S;
  let postCount = 0;

  process.env.TELEGRAM_BOT_TOKEN = '123456789:test-token-value-with-valid-length';
  process.env.TELEGRAM_CHAT_ID = '-1001234567890';
  process.env.TELEGRAM_API_FALLBACK_IPV4S = '149.154.167.220';
  const requestFactory = ((_url: URL, options: Record<string, unknown>, callback: Function) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      if (options.method === 'HEAD' && !options.lookup) {
        request.emit('error', Object.assign(new Error('connect timeout'), { code: 'ETIMEDOUT' }));

        return;
      }
      if (options.method === 'POST') {
        postCount += 1;
        request.emit('error', Object.assign(new Error('ambiguous timeout'), { code: 'ETIMEDOUT' }));

        return;
      }
      const response = new Readable({ read() {} }) as Readable & { statusCode: number };
      response.statusCode = 302;
      callback(response);
      response.push(null);
    };

    return request;
  }) as never;

  try {
    _private.resetTelegramRouteCache();
    await assert.rejects(sendTelegram(testLead(), requestFactory));
    assert.equal(postCount, 1);
  } finally {
    _private.resetTelegramRouteCache();
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
    if (previousFallbackIpv4s === undefined) {
      delete process.env.TELEGRAM_API_FALLBACK_IPV4S;
    } else {
      process.env.TELEGRAM_API_FALLBACK_IPV4S = previousFallbackIpv4s;
    }
  }
});

test('Telegram rejects an invalid fallback list before opening a request', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChatId = process.env.TELEGRAM_CHAT_ID;
  const previousFallbackIpv4s = process.env.TELEGRAM_API_FALLBACK_IPV4S;

  process.env.TELEGRAM_BOT_TOKEN = '123456789:test-token-value-with-valid-length';
  process.env.TELEGRAM_CHAT_ID = '-1001234567890';
  process.env.TELEGRAM_API_FALLBACK_IPV4S = '149.154.167.220,not-an-ip';

  try {
    _private.resetTelegramRouteCache();
    await assert.rejects(
      sendTelegram(testLead()),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'telegram_misconfigured',
    );
    assert.throws(() => _private.telegramFallbackIpv4s(), /fallback IPv4 list is invalid/);
  } finally {
    _private.resetTelegramRouteCache();
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
    if (previousFallbackIpv4s === undefined) {
      delete process.env.TELEGRAM_API_FALLBACK_IPV4S;
    } else {
      process.env.TELEGRAM_API_FALLBACK_IPV4S = previousFallbackIpv4s;
    }
  }
});
