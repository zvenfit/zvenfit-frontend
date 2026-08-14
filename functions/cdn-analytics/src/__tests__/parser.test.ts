import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';

import { parseCdnLogObject } from '../parser';

const first = {
  resource_id: 'cdn-1',
  timestamp_ms: '2026-08-14T10:00:00.000Z',
  bytes_sent: 123,
  request_uri: '/',
  status: '200',
  user_agent: 'Browser',
  remote_addr: '192.0.2.1',
  request_time: 0.01,
  upstream_cache_status: 'HIT',
  http_host: 'zvenfit.ru',
};

test('parses JSON arrays and JSONL without exposing raw fields to callers', () => {
  const arrayResult = parseCdnLogObject(Buffer.from(JSON.stringify([first])), 'logs.json');
  assert.equal(arrayResult.entries.length, 1);
  assert.equal(arrayResult.entries[0]?.request_uri, '/');

  const jsonl = `${JSON.stringify(first)}\nnot-json\n${JSON.stringify({ ...first, request_uri: '/raspisanie/' })}`;
  const lineResult = parseCdnLogObject(Buffer.from(jsonl), 'logs.jsonl');
  assert.equal(lineResult.entries.length, 2);
  assert.equal(lineResult.invalidRecords, 1);
});

test('detects and decompresses gzip payloads', () => {
  const result = parseCdnLogObject(gzipSync(JSON.stringify(first)), 'logs.json.gz');
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.bytes_sent, 123);
});
