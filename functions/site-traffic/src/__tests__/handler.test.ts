import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyTraffic } from '../classify';
import { createHandler } from '../handler';

import type { JsonObject, LoggerLike } from '../types';

class CaptureLogger implements LoggerLike {
  public records: JsonObject[] = [];

  public info(fields: JsonObject): void {
    this.records.push(fields);
  }
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    httpMethod: 'POST',
    headers: {
      origin: 'https://zvenfit.ru',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    },
    body: JSON.stringify({
      page_view_id: '9a1a608f-110d-47ac-a260-32029540dbe9',
      url: 'https://zvenfit.ru/raspisanie/?utm_source=test',
      referrer: 'https://yandex.ru/search/?text=zvenfit',
      webdriver: false,
    }),
    requestContext: { identity: { sourceIp: '203.0.113.7' } },
    ...overrides,
  };
}

test('writes one access-like browser page-view record with raw diagnostics', async () => {
  process.env.ALLOWED_ORIGINS = 'https://zvenfit.ru';
  const logger = new CaptureLogger();
  const handler = createHandler({ loggerFactory: () => logger });

  const result = await handler(event(), { requestId: 'request-1' });

  assert.equal(result.statusCode, 204);
  assert.equal(result.headers['Access-Control-Allow-Origin'], 'https://zvenfit.ru');
  assert.equal(logger.records.length, 1);
  assert.deepEqual(logger.records[0], {
    event: 'site_page_view',
    traffic_class: 'browser_like',
    host: 'zvenfit.ru',
    page: '/raspisanie',
    url: 'https://zvenfit.ru/raspisanie/?utm_source=test',
    referrer: 'https://yandex.ru/search/?text=zvenfit',
    ip: '203.0.113.7',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    page_view_id: '9a1a608f-110d-47ac-a260-32029540dbe9',
    webdriver: false,
  });
});

test('classifies synthetic checks, known bots and unknown clients separately', () => {
  assert.equal(classifyTraffic('ZvenFit-Synthetic-Monitor/1.0', false), 'synthetic');
  assert.equal(classifyTraffic('Mozilla/5.0 Googlebot/2.1', false), 'known_bot');
  assert.equal(classifyTraffic('Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0', true), 'synthetic');
  assert.equal(classifyTraffic('curl/8.7.1', false), 'unknown');
});

test('rejects untrusted origins before parsing or logging', async () => {
  process.env.ALLOWED_ORIGINS = 'https://zvenfit.ru';
  const logger = new CaptureLogger();
  const handler = createHandler({ loggerFactory: () => logger });

  const result = await handler(event({ headers: { origin: 'https://evil.example' } }));

  assert.equal(result.statusCode, 403);
  assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(logger.records.length, 0);
});

test('rejects forged page origins and malformed payloads without logging', async () => {
  process.env.ALLOWED_ORIGINS = 'https://zvenfit.ru';
  const logger = new CaptureLogger();
  const handler = createHandler({ loggerFactory: () => logger });
  const forged = event({
    body: JSON.stringify({
      page_view_id: 'view-1',
      url: 'https://other.example/',
      referrer: '',
      webdriver: false,
    }),
  });

  assert.equal((await handler(forged)).statusCode, 400);
  assert.equal((await handler(event({ body: '{' }))).statusCode, 400);
  assert.equal(logger.records.length, 0);
});

test('keeps the page view and clears unsupported diagnostic referrers', async () => {
  process.env.ALLOWED_ORIGINS = 'https://zvenfit.ru';
  const logger = new CaptureLogger();
  const handler = createHandler({ loggerFactory: () => logger });
  const payload = {
    page_view_id: 'view-from-app',
    url: 'https://zvenfit.ru/',
    referrer: 'android-app://com.example.app',
    webdriver: false,
  };

  const result = await handler(event({ body: JSON.stringify(payload) }));

  assert.equal(result.statusCode, 204);
  assert.equal(logger.records.length, 1);
  assert.equal(logger.records[0]?.referrer, '');
});

test('supports preflight and rejects unsupported methods', async () => {
  process.env.ALLOWED_ORIGINS = 'https://zvenfit.ru';
  const handler = createHandler({ loggerFactory: () => new CaptureLogger() });

  assert.equal((await handler(event({ httpMethod: 'OPTIONS', body: null }))).statusCode, 204);
  assert.equal((await handler(event({ httpMethod: 'GET', body: null }))).statusCode, 405);
});
