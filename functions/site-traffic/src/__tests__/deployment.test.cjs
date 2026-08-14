'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('deployment artifact exposes only the Cloud Function handler', () => {
  const compiledFunction = require('../../build/index.js');

  assert.equal(typeof compiledFunction.handler, 'function');
  assert.deepEqual(Object.keys(compiledFunction), ['handler']);
});

test('deployment artifact contains no stateful analytics chain', () => {
  const buildDirectory = path.resolve(__dirname, '../../build');
  const source = fs
    .readdirSync(buildDirectory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');

  assert.doesNotMatch(source, /Lockbox|HMAC|Object Storage|state\/sessions|session_timeout/i);
});
