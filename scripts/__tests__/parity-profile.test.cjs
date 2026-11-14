'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('since A2a the checks of this branch run the full profile', () => {
  const root = path.resolve(__dirname, '../..');
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  for (const [name, command] of Object.entries(scripts)) {
    assert.doesNotMatch(command, /--profile/, `npm script ${name} must rely on the profile of scripts/deploy.config.json`);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'scripts/deploy.config.json'), 'utf8')).profile, 'a');
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/quality.yml'), 'utf8');
  assert.match(workflow, /^ {6}PARITY_PROFILE: a$/m);
  const checks = JSON.parse(fs.readFileSync(path.join(root, 'project-checks.json'), 'utf8')).checks;
  const parity = checks.filter(check => check.command.includes('scripts/compare-dist.cjs'));
  assert.equal(parity.length, 2);
  const pinned = workflow.match(/^ {6}PARITY_BASE_SHA: ([0-9a-f]{40})$/m)?.[1];
  for (const check of parity) {
    assert.equal(check.command[check.command.indexOf('--profile') + 1], 'a');
    assert.equal(check.command[check.command.indexOf('--base-sha') + 1], pinned, 'project-checks.json must pin the base of quality.yml');
  }
});
