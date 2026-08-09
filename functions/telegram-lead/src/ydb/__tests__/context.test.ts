import assert from 'node:assert/strict';
import test from 'node:test';

import { _private } from '../context';

test('unwraps the first YDB result set', () => {
  const rows = [{ lead_id: 'lead-1' }];

  assert.equal(_private.firstResultSet([rows]), rows);
  assert.deepEqual(_private.firstResultSet([[]]), []);
  assert.deepEqual(_private.firstResultSet([]), []);
});
