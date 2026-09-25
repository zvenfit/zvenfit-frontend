import { retryPendingLeads, type RetrySummary } from './delivery';
import { QueueReadUnavailableError } from './queue-read-unavailable';

import type { ApplicationMetrics, HandlerDependencies, LoggerLike } from '../types';

export type RetryWorkerResult = RetrySummary | { deferred: true; stage: 'delivery' | 'queue_health' };

export async function runRetryWorker(
  dependencies: HandlerDependencies,
  logger: LoggerLike,
  metrics: ApplicationMetrics,
): Promise<RetryWorkerResult> {
  let stage: 'delivery' | 'queue_health' = 'delivery';
  try {
    const summary = await retryPendingLeads(dependencies, logger);
    stage = 'queue_health';
    const health = await dependencies.store.getTelegramQueueHealth({ now: dependencies.now(), logger });
    metrics.recordGauge('zvenfit_telegram_pending_leads', health.pendingCount);
    metrics.recordGauge('zvenfit_telegram_oldest_pending_age_seconds', health.oldestPendingAgeSeconds);
    metrics.recordGauge('zvenfit_retry_worker_heartbeat', 1);
    const event = 'retry_worker_completed';
    logger.info?.(
      {
        event,
        ...summary,
        queue_pending: health.pendingCount,
        oldest_pending_age_seconds: health.oldestPendingAgeSeconds,
      },
      event,
    );

    return summary;
  } catch (error) {
    if (!(error instanceof QueueReadUnavailableError)) {
      throw error;
    }
    // The durable outbox is unchanged. The next scheduled invocation resumes it.
    // Do not emit a successful heartbeat or replace unknown queue health with zero.
    const event = 'retry_worker_deferred';
    logger.warn?.({ event, stage, reason: 'queue_read_unavailable' }, event);

    return { deferred: true, stage };
  }
}
