'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const test = require('node:test');

test('compiled CommonJS entrypoint exports only the staging authorizer handler', () => {
  const compiledFunction = require('../../build/index.js');

  assert.deepEqual(Object.keys(compiledFunction), ['handler']);
  assert.equal(typeof compiledFunction.handler, 'function');
});
