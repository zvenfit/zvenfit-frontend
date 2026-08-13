import { createFitbaseProvider } from './fitbase-provider';
import { createFixtureProvider } from './fixture-provider';

import type { ScheduleProvider, ScheduleProviderName } from '../types';

export class ScheduleProviderConfigurationError extends Error {
  public constructor(code: string) {
    super(code);
    this.name = 'ScheduleProviderConfigurationError';
  }
}

function providerName(value: string | undefined): ScheduleProviderName {
  const normalized = (value || 'fitbase').trim();
  if (normalized !== 'fitbase' && normalized !== 'fixture') {
    throw new ScheduleProviderConfigurationError('unsupported_schedule_provider');
  }

  return normalized;
}

function isProduction(environment: NodeJS.ProcessEnv): boolean {
  return environment.NODE_ENV === 'production' || environment.DEPLOYMENT_ENVIRONMENT === 'production';
}

export function createScheduleProvider(environment: NodeJS.ProcessEnv = process.env): ScheduleProvider {
  const name = providerName(environment.SCHEDULE_PROVIDER);
  if (name === 'fixture') {
    if (isProduction(environment)) {
      throw new ScheduleProviderConfigurationError('fixture_provider_forbidden_in_production');
    }

    return createFixtureProvider();
  }

  try {
    return createFitbaseProvider(environment);
  } catch (error) {
    throw new ScheduleProviderConfigurationError(error instanceof Error ? error.message : 'fitbase_provider_invalid');
  }
}
