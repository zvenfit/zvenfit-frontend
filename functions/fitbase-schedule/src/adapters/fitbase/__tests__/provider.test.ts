import assert from 'node:assert/strict';
import test from 'node:test';

import { createFitbaseProvider } from '../provider';

test('Fitbase adapter validates its own credentials', () => {
  assert.throws(() => createFitbaseProvider({}), /fitbase_token_missing/);
  assert.equal(typeof createFitbaseProvider({ FITBASE_API_TOKEN: 'test-token' }).getSchedule, 'function');
});
