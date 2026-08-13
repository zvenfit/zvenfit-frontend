import { fetchAllSchedule } from '../fitbase/client';

import type { ScheduleProvider } from '../types';

export function createFitbaseProvider(environment: NodeJS.ProcessEnv): ScheduleProvider {
  const token = (environment.FITBASE_API_TOKEN || '').trim();
  if (!token) {
    throw new Error('fitbase_token_missing');
  }

  const fitbaseHeaders = {
    domain: (environment.FITBASE_DOMAIN || 'zvenfit').trim(),
    Authorization: `Bearer ${token}`,
  };
  const clubId = (environment.FITBASE_CLUB_ID || '').trim();

  return {
    name: 'fitbase',
    getSchedule(from, to) {
      return fetchAllSchedule(from, to, fitbaseHeaders, clubId);
    },
  };
}
