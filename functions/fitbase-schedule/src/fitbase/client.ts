import { mapScheduleItem, shouldIncludeItem, sortScheduleItems } from './mapper';

import type { Headers, ScheduleItem } from '../types';
import type { FitbaseError } from './types';

const FITBASE_API_BASE = 'https://api.fitbase.io/api/v2/schedule';
const PAGE_SIZE = 100;

interface FitbasePage {
  items?: unknown[];
  total_count?: unknown;
}

async function fetchSchedulePage(params: URLSearchParams, headers: Headers): Promise<FitbasePage> {
  const url = new URL(FITBASE_API_BASE);

  for (const [key, value] of params.entries()) {
    url.searchParams.append(key, value);
  }

  const response = await fetch(url, { headers });
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error('fitbase_request_failed') as FitbaseError;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return typeof payload === 'object' && payload !== null ? (payload as FitbasePage) : {};
}

export async function fetchAllSchedule(
  from: string,
  to: string,
  fitbaseHeaders: Headers,
  clubId: string,
): Promise<ScheduleItem[]> {
  const items: ScheduleItem[] = [];
  let page = 1;
  let totalCount = Infinity;

  while (items.length < totalCount) {
    const params = new URLSearchParams({
      date_from: from,
      date_to: to,
      is_archive: '-1',
      page: String(page),
      page_size: String(PAGE_SIZE),
    });

    if (clubId) {
      params.append('club_ids[]', clubId);
    }

    const payload = await fetchSchedulePage(params, fitbaseHeaders);
    const batch = Array.isArray(payload.items) ? payload.items : [];
    totalCount = Number(payload.total_count ?? batch.length);

    for (const item of batch) {
      if (shouldIncludeItem(item)) {
        items.push(mapScheduleItem(item));
      }
    }

    if (batch.length === 0) {
      break;
    }

    page += 1;
  }

  return sortScheduleItems(items);
}
