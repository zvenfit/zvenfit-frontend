'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { LEGACY_DUPLICATES, PROFILES, getProfile, pageToRoute, readProfileArgument } = require('../lib/parity-profile.cjs');

test('a1 is the only partial profile and names the three legal pages', () => {
  const partial = Object.entries(PROFILES).filter(([, profile]) => profile.partial).map(([name]) => name);
  assert.deepEqual(partial, ['a1']);
  assert.deepEqual([...getProfile('a1').pages], ['offer/index.html', 'privacy/index.html', 'payment-policy/index.html']);
  assert.equal(getProfile('a1').requires404, false);
  assert.equal(getProfile('a').requires404, true);
  assert.equal(getProfile('b').base, 'astro');
  assert.throws(() => getProfile('legacy'), /unknown profile/);
});

test('the profile argument overrides the fallback and must carry a value', () => {
  assert.equal(readProfileArgument(['--profile', 'a1'], 'a').name, 'a1');
  assert.equal(readProfileArgument([], 'a').name, 'a');
  assert.throws(() => readProfileArgument(['--profile'], 'a'), /requires a value/);
});

test('legacy duplicates stay allowed until A2b removes public/**/*.html', () => {
  assert.equal(LEGACY_DUPLICATES, 'allowed');
  assert.equal(pageToRoute('index.html'), '/');
  assert.equal(pageToRoute('offer/index.html'), '/offer/');
  assert.equal(pageToRoute('404.html'), '/404.html');
});
