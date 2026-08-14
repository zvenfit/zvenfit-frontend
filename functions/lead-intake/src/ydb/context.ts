import { createYdbClient } from './client';
import { queryTimeoutMs } from './config';
import { prepareAndObserveYdbOperation } from '../observability/ydb';

import type { ClaimedLead, LoggerLike, SqlRow, TelegramStatus, YdbClient, YdbQuery, YdbValue } from '../types';

let clientPromise: Promise<YdbClient> | null = null;
let ydbValueTypes: YdbClient['types'] | null = null;

async function getClient(): Promise<YdbClient> {
  if (!clientPromise) {
    clientPromise = createYdbClient()
      .then(client => {
        ydbValueTypes = client.types;

        return client;
      })
      .catch((error: unknown) => {
        clientPromise = null;
        ydbValueTypes = null;
        throw error;
      });
  }

  return clientPromise;
}

export async function getSql(): Promise<YdbClient['sql']> {
  return (await getClient()).sql;
}

export function transactionOptions(): { idempotent: boolean; signal: AbortSignal } {
  return { idempotent: true, signal: AbortSignal.timeout(queryTimeoutMs()) };
}

export function timed<T>(query: YdbQuery<T>): YdbQuery<T> {
  return query.timeout(queryTimeoutMs());
}

export async function observed<T>(
  operation: string,
  logger: LoggerLike | undefined,
  callback: (sql: YdbClient['sql']) => Promise<T>,
): Promise<T> {
  // Establishing a YDB driver can take a couple of seconds in a cold
  // serverless container. Keep that startup cost out of the SQL-operation
  // latency signal; otherwise the retry timer reports a slow query whenever
  // Yandex Cloud gives it a fresh container.
  return prepareAndObserveYdbOperation(operation, logger, getSql, callback);
}

export async function observedReadOnly<T>(
  operation: string,
  logger: LoggerLike | undefined,
  callback: (sql: YdbClient['sql']) => Promise<T>,
): Promise<T> {
  // A dead YDB session can abort an otherwise safe read before the SDK's
  // retry policy gets a chance to classify it. Re-running the callback creates
  // a new Query, so the pool acquires a fresh session without tearing down the
  // shared driver used by other warm invocations.
  return prepareAndObserveYdbOperation(operation, logger, getSql, callback, { retryAbortOnce: true });
}

export function firstResultSet(resultSets: unknown): SqlRow[] {
  return Array.isArray(resultSets) && Array.isArray(resultSets[0]) ? (resultSets[0] as SqlRow[]) : [];
}

export async function close(): Promise<void> {
  const client = await clientPromise?.catch(() => null);
  await client?.close();
  clientPromise = null;
  ydbValueTypes = null;
}

function valueTypes(): YdbClient['types'] {
  if (!ydbValueTypes) {
    throw new Error('ydb_client_not_initialized');
  }

  return ydbValueTypes;
}

export function ydbTimestamp(value: Date): YdbValue<Date> {
  return new (valueTypes().Timestamp)(value);
}

export function ydbUint32(value: number): YdbValue<number> {
  return new (valueTypes().Uint32)(value);
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dateValue(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

export function telegramStatus(value: unknown): TelegramStatus {
  return value === 'sending' || value === 'sent' || value === 'failed' ? value : 'pending';
}

export function rowToLead(row: SqlRow): ClaimedLead {
  let utm = {};
  try {
    utm = JSON.parse(stringValue(row.utm_json) || '{}') as Record<string, string>;
  } catch {
    utm = {};
  }

  return {
    leadId: stringValue(row.lead_id),
    createdAt: dateValue(row.created_at),
    name: stringValue(row.name),
    phone: stringValue(row.phone),
    contactMethod: stringValue(row.contact_method),
    telegramUsername: stringValue(row.telegram_username),
    utm,
    telegramAttempts: Number(row.telegram_attempts || 0),
  };
}

export function toEpoch(value: unknown): number {
  return dateValue(value).getTime();
}

export const _private = { firstResultSet };
