import type { ApplicationMetrics, JsonObject, LoggerLike } from '../types';

const EVENT_COUNTERS: Record<string, string> = {
  lead_persisted: 'zvenfit_leads_persisted_5m',
  telegram_delivery_failed_permanently: 'zvenfit_telegram_delivery_failed_1m',
  telegram_delivery_retry_error: 'zvenfit_lead_storage_errors',
  ydb_retry: 'zvenfit_ydb_retries_5m',
  ydb_slow_operation: 'zvenfit_ydb_slow_operations_5m',
};

function counterValue(event: string, fields: JsonObject): number {
  if (event !== 'ydb_retry') {
    return 1;
  }

  const attempts = fields.retry_attempts;

  return typeof attempts === 'number' && Number.isFinite(attempts) && attempts > 0 ? attempts : 1;
}

function recordEventMetric(metrics: ApplicationMetrics, fields: JsonObject): void {
  const event = typeof fields.event === 'string' ? fields.event : '';
  if (event === 'lead_submission_blocked' && fields.reason === 'rate_limit') {
    metrics.addCounter('zvenfit_lead_rate_limited_5m');

    return;
  }

  const counter = EVENT_COUNTERS[event];
  if (counter) {
    metrics.addCounter(counter, counterValue(event, fields));
  }
}

export function withEventMetrics(logger: LoggerLike, metrics: ApplicationMetrics): LoggerLike {
  return {
    error(fields, message) {
      recordEventMetric(metrics, fields);
      logger.error(fields, message);
    },
    info: logger.info
      ? (fields, message) => {
          recordEventMetric(metrics, fields);
          logger.info?.(fields, message);
        }
      : undefined,
    warn: logger.warn
      ? (fields, message) => {
          recordEventMetric(metrics, fields);
          logger.warn?.(fields, message);
        }
      : undefined,
  };
}

export const _private = { counterValue, recordEventMetric };
