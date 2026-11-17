'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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

// Between release A and branch B no check runs the comparison by itself.
// Profile `a` holds the site to the legacy base, so it fails on the first change
// of a page, and profile `b` gets its base, an accepted Astro commit of main,
// when branch B opens. Until then the tool is run by hand with explicit
// arguments; the job and the two checks come back together with that base.
test('no check pins a base of the comparison, and no npm script names a profile', () => {
  const root = path.resolve(__dirname, '../..');
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  for (const [name, command] of Object.entries(scripts)) {
    assert.doesNotMatch(command, /--profile/, `npm script ${name} must rely on the profile of scripts/deploy.config.json`);
  }
  assert.equal(scripts['compare:dist'], 'node scripts/compare-dist.cjs');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'scripts/deploy.config.json'), 'utf8')).profile, 'a');
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/quality.yml'), 'utf8');
  assert.doesNotMatch(workflow, /compare-dist|PARITY_/, 'quality.yml compares nothing until branch B pins an Astro base');
  const checks = JSON.parse(fs.readFileSync(path.join(root, 'project-checks.json'), 'utf8')).checks;
  const comparing = checks.filter(check => check.command.some(part => part.includes('compare-dist') || part === 'compare:dist'));
  assert.deepEqual(comparing, [], 'project-checks.json must not pin a base that quality.yml does not');
});
