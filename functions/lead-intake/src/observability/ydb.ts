import { safeErrorFields } from './errors';
import {
  createOperationState,
  operationStorage,
  phaseFields,
  failurePhaseFields,
  retryErrorFields,
  subscribeToDiagnostics,
  type OperationState,
  type YdbPhase,
} from './ydb-diagnostics';
import { slowOperationMs } from '../ydb/config';
import { initializationAttempts } from '../ydb/initialization-attempts';

import type { JsonObject, LoggerLike } from '../types';

export interface YdbOperationObserver {
  onReadRetry(error: unknown): void;
}

function slowSessionPhase(operation: OperationState): { durationMs: number; phase: YdbPhase } | undefined {
  const createDurationMs = operation.phases.session_create.maxDurationMs;
  if (createDurationMs >= slowOperationMs()) {
    return { durationMs: createDurationMs, phase: 'session_create' };
  }

  const acquireDurationMs = operation.phases.session_acquire.maxDurationMs;
  if (acquireDurationMs >= slowOperationMs()) {
    return { durationMs: acquireDurationMs, phase: 'session_acquire' };
  }

  return undefined;
}

function writeLog(logger: LoggerLike | undefined, level: 'info' | 'warn' | 'error', fields: JsonObject): void {
  const write = logger?.[level];

  if (write) {
    write.call(logger, fields, String(fields.event));
  }
}

export async function observeYdbOperation<T>(
  operationName: string,
  logger: LoggerLike | undefined,
  callback: (observer: YdbOperationObserver) => Promise<T>,
): Promise<T> {
  subscribeToDiagnostics();

  const startedAt = Date.now();
  const operation = createOperationState();

  try {
    const result = await operationStorage.run(operation, () =>
      callback({
        onReadRetry(error) {
          operation.retries += 1;
          operation.retryFailure = retryErrorFields(operation, error, 'read_fallback');
        },
      }),
    );
    const durationMs = Date.now() - startedAt;

    writeLog(logger, 'info', {
      event: 'ydb_operation_completed',
      operation: operationName,
      duration_ms: durationMs,
      retry_attempts: operation.retries,
      ...phaseFields(operation),
    });

    if (operation.retries > 0) {
      writeLog(logger, 'warn', {
        event: 'ydb_retry',
        operation: operationName,
        retry_attempts: operation.retries,
        duration_ms: durationMs,
        ...phaseFields(operation),
        ...operation.retryFailure,
      });
    }

    const queryDurationMs = operation.phases.query_execute.maxDurationMs;
    if (queryDurationMs >= slowOperationMs()) {
      writeLog(logger, 'warn', {
        event: 'ydb_slow_operation',
        operation: operationName,
        phase: 'query_execute',
        duration_ms: queryDurationMs,
        total_duration_ms: durationMs,
      });
    }

    const sessionPhase = slowSessionPhase(operation);
    if (sessionPhase) {
      writeLog(logger, 'warn', {
        event: 'ydb_slow_session_phase',
        operation: operationName,
        phase: sessionPhase.phase,
        duration_ms: sessionPhase.durationMs,
        total_duration_ms: durationMs,
        ...phaseFields(operation),
      });
    }

    return result;
  } catch (error) {
    writeLog(logger, 'error', {
      event: 'ydb_operation_failed',
      operation: operationName,
      duration_ms: Date.now() - startedAt,
      retry_attempts: operation.retries,
      ...phaseFields(operation),
      ...safeErrorFields(error, { fallbackCode: 'ydb_error' }),
      ...failurePhaseFields(operation, error),
    });
    throw error;
  }
}

export async function prepareAndObserveYdbOperation<TPrepared, TResult>(
  operationName: string,
  logger: LoggerLike | undefined,
  prepare: () => Promise<TPrepared>,
  callback: (prepared: TPrepared, observer: YdbOperationObserver) => Promise<TResult>,
): Promise<TResult> {
  const startedAt = Date.now();
  let prepared: TPrepared;
  try {
    prepared = await prepare();
  } catch (error) {
    const attempts = initializationAttempts(error);
    writeLog(logger, 'error', {
      event: 'ydb_operation_failed',
      operation: operationName,
      phase: 'client_preparation',
      duration_ms: Date.now() - startedAt,
      retry_attempts: 0,
      ...(attempts === undefined ? {} : { initialization_attempts: attempts }),
      ...safeErrorFields(error, { fallbackCode: 'ydb_initialization_error' }),
    });
    throw error;
  }

  return observeYdbOperation(operationName, logger, observer => callback(prepared, observer));
}
