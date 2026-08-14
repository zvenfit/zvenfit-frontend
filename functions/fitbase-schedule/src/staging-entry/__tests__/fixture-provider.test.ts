import assert from 'node:assert/strict';
import test from 'node:test';

import { createFitbaseProvider } from '../../providers/fitbase-provider';
import { generateFixtureSchedule } from '../fixture-provider';

test('Fitbase adapter validates its own credentials', () => {
  assert.throws(() => createFitbaseProvider({}), /fitbase_token_missing/);
  assert.equal(typeof createFitbaseProvider({ FITBASE_API_TOKEN: 'test-token' }).getSchedule, 'function');
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
