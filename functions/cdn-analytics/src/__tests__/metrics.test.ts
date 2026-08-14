import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyEntries } from '../classifier';
import { buildMetricPoints, metricTimestamp } from '../metrics';

import type { CdnLogEntry } from '../types';

const browserEntry: CdnLogEntry = {
  resource_id: 'cdn-1',
  timestamp_ms: '2026-08-14T10:00:00.000Z',
  bytes_sent: 500,
  request_uri: '/',
  status: '200',
  user_agent: 'Mozilla/5.0 Chrome/140 Safari/537.36',
  remote_addr: '192.0.2.1',
  request_time: 0.01,
  upstream_cache_status: 'HIT',
  http_host: 'zvenfit.ru',
};

test('aggregates bounded labels and technical sessions', () => {
  const classified = classifyEntries([
    browserEntry,
    { ...browserEntry, request_uri: '/images/logo.svg', bytes_sent: 100 },
  ]);
  const metrics = buildMetricPoints(classified, 'cdn-1', 1);

  assert.equal(metrics.find(point => point.name === 'zvenfit_cdn_requests')?.value, 2);
  assert.equal(metrics.find(point => point.name === 'zvenfit_cdn_page_views')?.value, 1);
  assert.equal(metrics.find(point => point.name === 'zvenfit_cdn_technical_sessions')?.value, 1);
  assert.ok(metrics.every(point => !('remote_addr' in point.labels)));
});

test('uses deterministic sub-second offsets for idempotent batch points', () => {
  const classified = classifyEntries([browserEntry]);
  assert.equal(metricTimestamp(classified, 'abcdef'), metricTimestamp(classified, 'abcdef'));
  assert.notEqual(metricTimestamp(classified, 'abcdef'), metricTimestamp(classified, '123456'));
});
