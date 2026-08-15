import { createHash } from 'node:crypto';

import type { JsonObject } from '../types';

interface SafeErrorFieldOptions {
  fallbackCode: string;
  retriable: boolean;
}

function errorRecord(error: unknown): Record<string, unknown> | undefined {
  return error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
}

function normalizeIdentifier(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64);

  return normalized || fallback;
}

function stackFingerprint(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) {
    return null;
  }

  const stackFrames = error.stack.split('\n').slice(1).join('\n') || error.name;

  return createHash('sha256').update(stackFrames).digest('hex').slice(0, 16);
}

export function safeErrorFields(error: unknown, options: SafeErrorFieldOptions): JsonObject {
  const record = errorRecord(error);
  const status =
    Number.isInteger(record?.status) && Number(record?.status) >= 100 && Number(record?.status) <= 599
      ? Number(record?.status)
      : null;

  return {
    error_type: error instanceof Error ? normalizeIdentifier(error.name, 'Error') : 'UnknownError',
    error_code: normalizeIdentifier(record?.code, options.fallbackCode),
    retriable: options.retriable,
    upstream_status: status,
    stack_fingerprint: stackFingerprint(error),
  };
}

export const _private = { normalizeIdentifier, stackFingerprint };
