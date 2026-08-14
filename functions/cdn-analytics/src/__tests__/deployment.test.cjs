'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('deployment artifact exports the Cloud Function handler without source maps', () => {
  const buildDirectory = path.resolve(__dirname, '../../build');
  const entrypoint = path.join(buildDirectory, 'index.js');

  assert.ok(fs.existsSync(entrypoint), 'build/index.js is missing');
  assert.equal(fs.existsSync(`${entrypoint}.map`), false);
  const deployed = require(entrypoint);
  assert.equal(typeof deployed.handler, 'function');
});
