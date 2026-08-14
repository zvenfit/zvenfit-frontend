import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyEntries, isPageRequest } from '../classifier';

import type { CdnLogEntry } from '../types';

function entry(overrides: Partial<CdnLogEntry> = {}): CdnLogEntry {
  return {
    resource_id: 'cdn-1',
    timestamp_ms: '2026-08-14T10:00:00.000Z',
    bytes_sent: 123,
    request_uri: '/',
    status: '200',
    user_agent: 'Mozilla/5.0 Chrome/140 Safari/537.36',
    remote_addr: '192.0.2.1',
    request_time: 0.01,
    upstream_cache_status: 'HIT',
    http_host: 'zvenfit.ru',
    ...overrides,
  };
}

test('separates synthetic, known robot, suspicious and browser traffic', () => {
  const result = classifyEntries([
    entry({ user_agent: 'ZvenFit-Synthetic-Monitor/1.0' }),
    entry({ user_agent: 'Googlebot/2.1' }),
    entry({ request_uri: '/.env' }),
    entry(),
  ]);

  assert.deepEqual(
    result.map(item => item.trafficClass),
    ['synthetic', 'known_bot', 'suspicious', 'browser'],
  );
});

test('recognizes HTML routes but excludes assets and errors', () => {
  assert.equal(isPageRequest(entry({ request_uri: '/raspisanie/' })), true);
  assert.equal(isPageRequest(entry({ request_uri: '/js/schedule.js?v=1' })), false);
  assert.equal(isPageRequest(entry({ request_uri: '/missing/', status: '404' })), false);
});

test('does not count API hosts as page views', () => {
  const siteHosts = new Set(['zvenfit.ru', 'www.zvenfit.ru']);
  const result = classifyEntries([entry(), entry({ http_host: 'api.zvenfit.ru' })], 100, siteHosts);

  assert.deepEqual(
    result.map(item => item.isPage),
    [true, false],
  );
});

test('reclassifies bursty browser-like clients as suspicious', () => {
  const result = classifyEntries([entry(), entry({ request_uri: '/raspisanie/' })], 1);
  assert.ok(result.every(item => item.trafficClass === 'suspicious'));
});
