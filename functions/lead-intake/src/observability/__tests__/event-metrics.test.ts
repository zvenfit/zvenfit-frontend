import assert from 'node:assert/strict';
import test from 'node:test';

import { withEventMetrics } from '../event-metrics';

import type { ApplicationMetrics, JsonObject, LoggerLike } from '../../types';

function capture() {
  const counters: Array<{ name: string; value: number }> = [];
  const logs: Array<{ level: string; fields: JsonObject }> = [];
  const metrics: ApplicationMetrics = {
    addCounter(name, value = 1) {
      counters.push({ name, value });
    },
    recordGauge() {},
    async flush() {},
  };
  const logger: LoggerLike = {
    error(fields) {
      logs.push({ level: 'error', fields });
    },
    info(fields) {
      logs.push({ level: 'info', fields });
    },
    warn(fields) {
      logs.push({ level: 'warn', fields });
    },
  };

  return { counters, logger: withEventMetrics(logger, metrics), logs };
}

test('records direct counters for lead pipeline events without changing logs', () => {
  const captured = capture();

  captured.logger.info?.({ event: 'lead_persisted' });
  captured.logger.warn?.({ event: 'lead_submission_blocked', reason: 'rate_limit' });
  captured.logger.warn?.({ event: 'ydb_retry', retry_attempts: 3 });
  captured.logger.warn?.({ event: 'ydb_slow_operation' });
  captured.logger.error({ event: 'lead_rate_limit_error' });
  captured.logger.error({ event: 'telegram_delivery_failed_permanently' });
  captured.logger.error({ event: 'telegram_delivery_retry_error' });

  assert.deepEqual(captured.counters, [
    { name: 'zvenfit_leads_persisted_5m', value: 1 },
    { name: 'zvenfit_lead_rate_limited_5m', value: 1 },
    { name: 'zvenfit_ydb_retries_5m', value: 3 },
    { name: 'zvenfit_ydb_slow_operations_5m', value: 1 },
    { name: 'zvenfit_rate_limit_errors_5m', value: 1 },
    { name: 'zvenfit_telegram_delivery_failed_1m', value: 1 },
    { name: 'zvenfit_lead_storage_errors', value: 1 },
  ]);
  assert.equal(captured.logs.length, 7);
});

test('ignores non-rate-limit blocks and unrelated events', () => {
  const captured = capture();

  captured.logger.warn?.({ event: 'lead_submission_blocked', reason: 'honeypot' });
  captured.logger.info?.({ event: 'telegram_delivery_retry_scheduled' });

  assert.deepEqual(captured.counters, []);
  assert.equal(captured.logs.length, 2);
});
