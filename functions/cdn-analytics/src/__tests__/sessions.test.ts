import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { classifyEntries } from '../classifier';
import { countTechnicalSessions } from '../sessions';

import type { CdnLogEntry } from '../types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function browserEntry(timestamp: string): CdnLogEntry {
  return {
    resource_id: 'cdn-1',
    timestamp_ms: timestamp,
    bytes_sent: 500,
    request_uri: '/',
    status: '200',
    user_agent: 'Mozilla/5.0 Chrome/140 Safari/537.36',
    remote_addr: '192.0.2.1',
    request_time: 0.01,
    upstream_cache_status: 'HIT',
    http_host: 'zvenfit.ru',
  };
}

test('persists only HMAC state and returns the same decision on retry', async () => {
  const state = new Map<string, string>();
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === 'PUT') {
      state.set(url, String(init.body));

      return new Response('', { status: 200 });
    }
    const existing = state.get(url);

    return existing ? new Response(existing, { status: 200 }) : new Response('', { status: 404 });
  };

  const entries = classifyEntries([browserEntry('2026-08-14T10:00:00.000Z')]);
  const options = {
    bucket: 'private-logs',
    hashSecret: 'a'.repeat(64),
    iamToken: 'test-token',
    objectHash: 'object-a',
    statePrefix: 'state/sessions/',
    timeoutMinutes: 30,
  };

  assert.equal(await countTechnicalSessions(entries, options), 1);
  assert.equal(await countTechnicalSessions(entries, options), 1);
  const serializedState = [...state.values()].join('');
  assert.doesNotMatch(serializedState, /192\.0\.2\.1|Mozilla/);
});

test('starts a new technical session after the inactivity window', async () => {
  const state = new Map<string, string>();
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === 'PUT') {
      state.set(url, String(init.body));

      return new Response('', { status: 200 });
    }
    const existing = state.get(url);

    return existing ? new Response(existing, { status: 200 }) : new Response('', { status: 404 });
  };

  const base = {
    bucket: 'private-logs',
    hashSecret: 'b'.repeat(64),
    iamToken: 'test-token',
    statePrefix: 'state/sessions/',
    timeoutMinutes: 30,
  };
  assert.equal(
    await countTechnicalSessions(classifyEntries([browserEntry('2026-08-14T10:00:00.000Z')]), {
      ...base,
      objectHash: 'object-a',
    }),
    1,
  );
  assert.equal(
    await countTechnicalSessions(classifyEntries([browserEntry('2026-08-14T10:10:00.000Z')]), {
      ...base,
      objectHash: 'object-b',
    }),
    0,
  );
  assert.equal(
    await countTechnicalSessions(classifyEntries([browserEntry('2026-08-14T11:00:00.000Z')]), {
      ...base,
      objectHash: 'object-c',
    }),
    1,
  );
});
