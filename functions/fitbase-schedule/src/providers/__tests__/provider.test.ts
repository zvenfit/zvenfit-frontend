import assert from 'node:assert/strict';
import test from 'node:test';

import { createScheduleProvider, ScheduleProviderConfigurationError } from '..';
import { generateFixtureSchedule } from '../fixture-provider';

test('uses Fitbase by default and requires its token', () => {
  assert.throws(
    () => createScheduleProvider({ NODE_ENV: 'staging' }),
    (error: unknown) =>
      error instanceof ScheduleProviderConfigurationError && error.message === 'fitbase_token_missing',
  );

  assert.equal(createScheduleProvider({ NODE_ENV: 'production', FITBASE_API_TOKEN: 'test-token' }).name, 'fitbase');
});

test('allows the fixture provider only outside production', () => {
  assert.equal(createScheduleProvider({ NODE_ENV: 'staging', SCHEDULE_PROVIDER: 'fixture' }).name, 'fixture');
  assert.equal(createScheduleProvider({ NODE_ENV: 'development', SCHEDULE_PROVIDER: 'fixture' }).name, 'fixture');

  for (const environment of [
    { NODE_ENV: 'production', SCHEDULE_PROVIDER: 'fixture' },
    { NODE_ENV: 'staging', DEPLOYMENT_ENVIRONMENT: 'production', SCHEDULE_PROVIDER: 'fixture' },
  ]) {
    assert.throws(
      () => createScheduleProvider(environment),
      (error: unknown) =>
        error instanceof ScheduleProviderConfigurationError &&
        error.message === 'fixture_provider_forbidden_in_production',
    );
  }
});

test('rejects an unknown provider instead of falling back to Fitbase or fixture', () => {
  assert.throws(
    () => createScheduleProvider({ NODE_ENV: 'staging', SCHEDULE_PROVIDER: 'automatic' }),
    (error: unknown) =>
      error instanceof ScheduleProviderConfigurationError && error.message === 'unsupported_schedule_provider',
  );
});

test('generates deterministic scenarios relative to the requested range', () => {
  const first = generateFixtureSchedule('2030-01-10', '2030-01-15');
  const second = generateFixtureSchedule('2030-01-10', '2030-01-15');

  assert.deepEqual(first, second);
  assert.equal(first.length, 7);
  assert.equal(
    first.every(item => item.date >= '2030-01-10' && item.date <= '2030-01-15'),
    true,
  );
  assert.equal(
    first.every(item => String(item.id).startsWith('fixture-2030-01-10-')),
    true,
  );
  assert.equal(
    first.some(item => item.cancelled),
    true,
  );
  assert.equal(
    first.some(item => item.registrationClosed),
    true,
  );
  assert.equal(
    first.some(item => item.ageType === 'kids'),
    true,
  );
  assert.equal(
    first.some(item => item.transfer !== null),
    true,
  );
  assert.equal(
    first.some(item => item.trainers.length === 0 && item.description === ''),
    true,
  );
});

test('returns only scenarios that fit into a short requested range', () => {
  const items = generateFixtureSchedule('2030-12-31', '2031-01-01');

  assert.equal(items.length, 3);
  assert.deepEqual([...new Set(items.map(item => item.date))], ['2030-12-31', '2031-01-01']);
});
