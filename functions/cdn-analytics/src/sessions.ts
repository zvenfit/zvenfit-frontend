import { createHmac } from 'node:crypto';

import { readJsonObject, writeJsonObject } from './storage';
import { parseUtcTimestamp } from './time';

import type { ClassifiedEntry } from './types';

interface SessionDecision {
  objectHash: string;
  startedSession: boolean;
}

interface SessionState {
  decisions: SessionDecision[];
  lastSeen: string;
}

interface ClientBatch {
  earliestSeen: Date;
  latestSeen: Date;
}

export interface SessionOptions {
  bucket: string;
  hashSecret: string;
  iamToken: string;
  objectHash: string;
  statePrefix: string;
  timeoutMinutes: number;
}

function clientHash(entry: ClassifiedEntry, hashSecret: string): string {
  return createHmac('sha256', hashSecret)
    .update(entry.entry.remote_addr)
    .update('\u0000')
    .update(entry.entry.user_agent)
    .digest('hex');
}

function stateKey(prefix: string, hash: string): string {
  const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;

  return `${normalized}${hash.slice(0, 2)}/${hash}.json`;
}

export async function countTechnicalSessions(entries: ClassifiedEntry[], options: SessionOptions): Promise<number> {
  const clients = new Map<string, ClientBatch>();
  for (const classified of entries) {
    if (
      classified.trafficClass !== 'browser' ||
      !classified.isPage ||
      !classified.entry.remote_addr ||
      !classified.entry.user_agent
    ) {
      continue;
    }
    const seenAt = parseUtcTimestamp(classified.entry.timestamp_ms);
    if (!seenAt) {
      continue;
    }
    const hash = clientHash(classified, options.hashSecret);
    const current = clients.get(hash);
    if (!current) {
      clients.set(hash, { earliestSeen: seenAt, latestSeen: seenAt });
    } else {
      if (seenAt < current.earliestSeen) {
        current.earliestSeen = seenAt;
      }
      if (seenAt > current.latestSeen) {
        current.latestSeen = seenAt;
      }
    }
  }

  let sessions = 0;
  for (const [hash, batch] of clients) {
    const key = stateKey(options.statePrefix, hash);
    const previous = await readJsonObject<SessionState>(options.bucket, key, options.iamToken);
    const existingDecision = previous?.decisions?.find(decision => decision.objectHash === options.objectHash);
    if (existingDecision) {
      if (existingDecision.startedSession) {
        sessions += 1;
      }
      continue;
    }

    const previousSeen = previous ? parseUtcTimestamp(previous.lastSeen) : null;
    const startedSession =
      !previousSeen || batch.earliestSeen.getTime() - previousSeen.getTime() > options.timeoutMinutes * 60_000;
    if (startedSession) {
      sessions += 1;
    }

    const lastSeen = previousSeen && previousSeen > batch.latestSeen ? previousSeen : batch.latestSeen;
    const decisions = [...(previous?.decisions ?? []), { objectHash: options.objectHash, startedSession }].slice(-8);
    await writeJsonObject(options.bucket, key, options.iamToken, {
      decisions,
      lastSeen: lastSeen.toISOString(),
    } satisfies SessionState);
  }

  return sessions;
}

export const _private = { clientHash, stateKey };
