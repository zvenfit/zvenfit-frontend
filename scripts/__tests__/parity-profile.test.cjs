'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { pinnedBaseSha } = require('../lib/parity-harness.cjs');
const { PROFILES, getProfile, pageToRoute } = require('../lib/parity-profile.cjs');

test('both profiles cover the whole site and differ only in the base of the comparison', () => {
  assert.deepEqual(Object.keys(PROFILES), ['a', 'b']);
  assert.deepEqual(getProfile('a'), { name: 'a', base: 'legacy' });
  assert.deepEqual(getProfile('b'), { name: 'b', base: 'astro' });
});

test('the partial profile of stage A1 and any other name are refused', () => {
  for (const name of ['a1', 'legacy', 'constructor', '', undefined]) {
    assert.throws(() => getProfile(name), /unknown profile ".*" \(expected a or b\)/, String(name));
  }
});

test('a page of the build maps to its route', () => {
  assert.equal(pageToRoute('index.html'), '/');
  assert.equal(pageToRoute('offer/index.html'), '/offer/');
  assert.equal(pageToRoute('404.html'), '/404.html');
});

test('the checks of this branch run the full profile against the pinned base', () => {
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
  for (const check of parity) {
    assert.equal(check.command[check.command.indexOf('--profile') + 1], 'a');
    assert.equal(check.command[check.command.indexOf('--base-sha') + 1], pinnedBaseSha(), 'project-checks.json must pin the base of quality.yml');
  }
});
