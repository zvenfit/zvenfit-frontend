'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const test = require('node:test');

const { _private } = require('../../../build/ydb/context');

test('unwraps the first YDB result set', () => {
  const rows = [{ lead_id: 'lead-1' }];

  assert.equal(_private.firstResultSet([rows]), rows);
  assert.deepEqual(_private.firstResultSet([[]]), []);
  assert.deepEqual(_private.firstResultSet([]), []);
});
