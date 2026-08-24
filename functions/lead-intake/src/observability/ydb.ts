import { AsyncLocalStorage } from 'node:async_hooks';
import { channel, tracingChannel } from 'node:diagnostics_channel';

import { safeErrorFields } from './errors';
import { slowOperationMs } from '../ydb/config';
import { initializationAttempts } from '../ydb/initialization-attempts';

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
  retryTransientOnce?: boolean;
}

const RETRYABLE_READ_ERROR_NAMES = new Set(['AbortError', 'TimeoutError']);
const RETRYABLE_GRPC_CODES = new Set([4, 8, 10, 13, 14]);
const RETRYABLE_ERROR_PATTERN =
  /ABORTED|DEADLINE_EXCEEDED|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|INTERNAL|RESOURCE_EXHAUSTED|TIMEOUT|UNAVAILABLE/i;

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

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const visited = new Set<unknown>();
  let current = error;

  while (current && typeof current === 'object' && !visited.has(current) && chain.length < 4) {
    chain.push(current);
    visited.add(current);
    current = (current as Record<string, unknown>).cause;
  }

  return chain;
}

function isTransientReadError(error: unknown): boolean {
  return errorChain(error).some(item => {
    const record = item as Record<string, unknown>;
    const errorName = item instanceof Error ? item.name : record.name;

    if (typeof errorName === 'string' && RETRYABLE_READ_ERROR_NAMES.has(errorName)) {
      return true;
    }

    // The YDB SDK uses a bare ClientError for some session-pool transport
    // failures. Retry an unclassified ClientError once, but let an explicit
    // permanent code such as PERMISSION_DENIED fall through the checks below.
    if (errorName === 'ClientError' && record.code === undefined) {
      return true;
    }

    if (typeof record.code === 'number' && RETRYABLE_GRPC_CODES.has(record.code)) {
      return true;
    }

    const description = [record.code, record.details, record.message]
      .filter(value => typeof value === 'string')
      .join(' ');

    return RETRYABLE_ERROR_PATTERN.test(description);
  });
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
        if (!options.retryTransientOnce || !isTransientReadError(error)) {
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

  return observeYdbOperation(operationName, logger, () => callback(prepared), options);
}
