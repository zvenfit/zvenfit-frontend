import { AsyncLocalStorage } from 'node:async_hooks';
import { channel, tracingChannel } from 'node:diagnostics_channel';

import { safeErrorFields } from './errors';
import { slowOperationMs } from '../ydb/config';

import type { JsonObject, LoggerLike } from '../types';

interface OperationState {
  retries: number;
  phases: Record<YdbPhase, PhaseAggregate>;
}

type YdbPhase = 'query_execute' | 'session_acquire' | 'session_create';

interface PhaseAggregate {
  attempts: number;
  maxDurationMs: number;
  totalDurationMs: number;
}

interface PhaseTrace {
  operation: OperationState;
  phase: YdbPhase;
  startedAt: number;
}

interface ObserveYdbOperationOptions {
  retryAbortOnce?: boolean;
}

const operationStorage = new AsyncLocalStorage<OperationState>();
const phaseTraces = new WeakMap<object, PhaseTrace>();
let subscribed = false;

function emptyPhaseAggregate(): PhaseAggregate {
  return { attempts: 0, maxDurationMs: 0, totalDurationMs: 0 };
}

function createOperationState(): OperationState {
  return {
    retries: 0,
    phases: {
      query_execute: emptyPhaseAggregate(),
      session_acquire: emptyPhaseAggregate(),
      session_create: emptyPhaseAggregate(),
    },
  };
}

function isTraceContext(message: unknown): message is object {
  return typeof message === 'object' && message !== null;
}

function subscribeToPhase(channelName: string, phase: YdbPhase): void {
  tracingChannel(channelName).subscribe({
    start(message) {
      const operation = operationStorage.getStore();
      if (operation && isTraceContext(message)) {
        phaseTraces.set(message, { operation, phase, startedAt: Date.now() });
      }
    },
    asyncStart(message) {
      if (!isTraceContext(message)) {
        return;
      }

      const trace = phaseTraces.get(message);
      if (!trace) {
        return;
      }

      const durationMs = Math.max(0, Date.now() - trace.startedAt);
      const aggregate = trace.operation.phases[trace.phase];
      aggregate.attempts += 1;
      aggregate.totalDurationMs += durationMs;
      aggregate.maxDurationMs = Math.max(aggregate.maxDurationMs, durationMs);
      phaseTraces.delete(message);
    },
    end() {},
    asyncEnd() {},
    error() {},
  });
}

function subscribeToDiagnostics(): void {
  if (subscribed) {
    return;
  }

  channel('ydb:retry.attempt.completed').subscribe(message => {
    const operation = operationStorage.getStore();
    const outcome =
      typeof message === 'object' && message !== null && 'outcome' in message ? message.outcome : undefined;

    if (operation && outcome === 'retried') {
      operation.retries += 1;
    }
  });
  subscribeToPhase('tracing:ydb:query.execute', 'query_execute');
  subscribeToPhase('tracing:ydb:query.session.acquire', 'session_acquire');
  subscribeToPhase('tracing:ydb:query.session.create', 'session_create');
  subscribed = true;
}

function phaseFields(operation: OperationState): JsonObject {
  return {
    query_execute_attempts: operation.phases.query_execute.attempts,
    query_execute_duration_ms: operation.phases.query_execute.totalDurationMs,
    query_execute_max_duration_ms: operation.phases.query_execute.maxDurationMs,
    session_acquire_attempts: operation.phases.session_acquire.attempts,
    session_acquire_duration_ms: operation.phases.session_acquire.totalDurationMs,
    session_acquire_max_duration_ms: operation.phases.session_acquire.maxDurationMs,
    session_create_attempts: operation.phases.session_create.attempts,
    session_create_duration_ms: operation.phases.session_create.totalDurationMs,
    session_create_max_duration_ms: operation.phases.session_create.maxDurationMs,
  };
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
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
  callback: () => Promise<T>,
  options: ObserveYdbOperationOptions = {},
): Promise<T> {
  subscribeToDiagnostics();

  const startedAt = Date.now();
  const operation = createOperationState();

  try {
    const result = await operationStorage.run(operation, async () => {
      try {
        return await callback();
      } catch (error) {
        if (!options.retryAbortOnce || !isAbortError(error)) {
          throw error;
        }

        operation.retries += 1;

        return callback();
      }
    });
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
    });
    throw error;
  }
}

export async function prepareAndObserveYdbOperation<TPrepared, TResult>(
  operationName: string,
  logger: LoggerLike | undefined,
  prepare: () => Promise<TPrepared>,
  callback: (prepared: TPrepared) => Promise<TResult>,
  options: ObserveYdbOperationOptions = {},
): Promise<TResult> {
  const prepared = await prepare();

  return observeYdbOperation(operationName, logger, () => callback(prepared), options);
}

export const _private = {
  createOperationState,
  isAbortError,
  phaseFields,
  slowSessionPhase,
  subscribeToDiagnostics,
  writeLog,
};
