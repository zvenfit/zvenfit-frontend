import { retryRead } from './read-retry';
import { prepareAndObserveYdbOperation } from '../observability/ydb';

import type { LoggerLike } from '../types';

// The persistence adapter owns execution/recovery. Observability only receives
// retry events, so adding diagnostics cannot silently retry a write operation.
export function runReadOnlyYdbOperation<TPrepared, TResult>(
  operation: string,
  logger: LoggerLike | undefined,
  prepare: () => Promise<TPrepared>,
  execute: (prepared: TPrepared, signal: AbortSignal) => Promise<TResult>,
  budgetMs: number,
): Promise<TResult> {
  return prepareAndObserveYdbOperation(operation, logger, prepare, (prepared, observer) =>
    retryRead(signal => execute(prepared, signal), { budgetMs, onRetry: observer.onReadRetry }),
  );
}
