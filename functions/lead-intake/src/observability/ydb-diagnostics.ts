import { AsyncLocalStorage } from 'node:async_hooks';
import { channel, tracingChannel } from 'node:diagnostics_channel';

import { errorChain, safeErrorFields } from './errors';

import type { JsonObject } from '../types';

export interface OperationState {
  retries: number;
  phases: Record<YdbPhase, PhaseAggregate>;
  phaseFailures: WeakMap<object, { phase: YdbPhase; durationMs: number }>;
  pendingSdkFailure?: JsonObject;
  retryFailure?: JsonObject;
}

export type YdbPhase = 'query_execute' | 'session_acquire' | 'session_create';

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

export const operationStorage = new AsyncLocalStorage<OperationState>();
const phaseTraces = new WeakMap<object, PhaseTrace>();
let subscribed = false;

function emptyPhaseAggregate(): PhaseAggregate {
  return { attempts: 0, maxDurationMs: 0, totalDurationMs: 0 };
}

export function createOperationState(): OperationState {
  return {
    retries: 0,
    phaseFailures: new WeakMap(),
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
    },
    end() {},
    asyncEnd(message) {
      if (isTraceContext(message)) {
        phaseTraces.delete(message);
      }
    },
    error(message) {
      if (!isTraceContext(message) || !('error' in message) || !isTraceContext(message.error)) {
        return;
      }

      const trace = phaseTraces.get(message);
      // Nested acquisition/creation traces can report the same error. Keep
      // the innermost failing phase, without retaining SQL or SDK context.
      if (trace && !trace.operation.phaseFailures.has(message.error)) {
        trace.operation.phaseFailures.set(message.error, {
          phase: trace.phase,
          durationMs: Math.max(0, Date.now() - trace.startedAt),
        });
      }
    },
  });
}

export function subscribeToDiagnostics(): void {
  if (subscribed) {
    return;
  }

  channel('ydb:retry.attempt.completed').subscribe(message => {
    const operation = operationStorage.getStore();
    const outcome =
      typeof message === 'object' && message !== null && 'outcome' in message ? message.outcome : undefined;

    if (operation && outcome === 'retried') {
      operation.retries += 1;
      operation.retryFailure = operation.pendingSdkFailure ?? retryErrorFields(operation, undefined, 'sdk');
    }
    if (operation) {
      operation.pendingSdkFailure = undefined;
    }
  });
  // The completed channel has only an outcome/count. Its matching tracing
  // error channel carries the cause, including retries with no backoff.
  tracingChannel('tracing:ydb:retry.attempt').subscribe({
    start() {},
    end() {},
    asyncStart() {},
    asyncEnd() {},
    error(message) {
      const operation = operationStorage.getStore();
      if (operation && isTraceContext(message) && 'error' in message) {
        operation.pendingSdkFailure = retryErrorFields(operation, message.error, 'sdk');
      }
    },
  });
  subscribeToPhase('tracing:ydb:query.execute', 'query_execute');
  subscribeToPhase('tracing:ydb:query.session.acquire', 'session_acquire');
  subscribeToPhase('tracing:ydb:query.session.create', 'session_create');
  subscribed = true;
}

export function phaseFields(operation: OperationState): JsonObject {
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

export function retryErrorFields(
  operation: OperationState,
  error: unknown,
  source: 'sdk' | 'read_fallback',
): JsonObject {
  const failure = errorChain(error)
    .map(item => operation.phaseFailures.get(item as object))
    .find(item => item !== undefined);

  return {
    ...safeErrorFields(error, { fallbackCode: 'ydb_retry_cause_unavailable', retriable: true }),
    retry_source: source,
    phase: failure?.phase ?? 'unknown',
    ...(failure ? { failed_phase_duration_ms: failure.durationMs } : {}),
  };
}
