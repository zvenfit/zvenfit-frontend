'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const test = require('node:test');

test('compiled CommonJS entrypoint exports the cloud handler and fixture generator', () => {
  const compiledFunction = require('../../build/index.js');

  assert.equal(typeof compiledFunction.handler, 'function');
  assert.equal(typeof compiledFunction.generateFixtureSchedule, 'function');
});
