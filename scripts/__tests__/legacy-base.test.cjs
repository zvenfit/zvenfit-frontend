'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { LEGACY_BASE_SHA, hasCommit, legacyBaseGate } = require('./helpers/legacy-base.cjs');
const { pinnedBaseSha } = require('../lib/parity-harness.cjs');

const ROOT = path.resolve(__dirname, '../..');
const WORKFLOW = fs.readFileSync(path.join(ROOT, '.github/workflows/quality.yml'), 'utf8');

function recorder() {
  const reasons = [];
  return { reasons, skip: reason => reasons.push(reason) };
}

test('the legacy base is the commit pinned in the quality workflow', () => {
  assert.match(LEGACY_BASE_SHA, /^[0-9a-f]{40}$/);
  assert.ok(WORKFLOW.includes(`      PARITY_BASE_SHA: ${LEGACY_BASE_SHA}\n`));
  const unpinned = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-base-')), 'quality.yml');
  fs.writeFileSync(unpinned, 'jobs:\n  compare-dist:\n    env:\n      PARITY_BASE_SHA: main\n');
  assert.throws(() => pinnedBaseSha(unpinned), /pins no PARITY_BASE_SHA/);
  assert.equal(hasCommit('f'.repeat(40)), false);
});

test('a test that reads the legacy tree runs when the base is present', () => {
  const t = recorder();
  assert.equal(legacyBaseGate({ available: true, required: true })(t), true);
  assert.deepEqual(t.reasons, []);
});

test('without the base the test is skipped with a reason, and fails where the base is required', () => {
  const t = recorder();
  assert.equal(legacyBaseGate({ sha: 'a'.repeat(40), available: false, required: false })(t), false);
  assert.equal(t.reasons.length, 1);
  assert.match(t.reasons[0], /^the pinned legacy base a{40} is not in this checkout \(a shallow clone\?\); the compare-dist job runs this test with the full history$/);
  const required = recorder();
  assert.throws(() => legacyBaseGate({ sha: 'a'.repeat(40), available: false, required: true })(required), /is not in this checkout \(a shallow clone\?\), and REQUIRE_LEGACY_BASE is set: fetch the full history/);
  assert.deepEqual(required.reasons, []);
});

// A shallow checkout skips the tests that read the legacy tree, so one job of
// the pull-request checks must run every one of them with the base required.
test('the compare-dist job runs every test that reads the legacy base and requires the base there', () => {
  const start = WORKFLOW.indexOf('\n  compare-dist:\n');
  assert.ok(start > 0, 'quality.yml has a compare-dist job');
  const job = WORKFLOW.slice(start);
  assert.match(job, /\n {10}fetch-depth: 0\n/, 'the job checks out the whole history');
  const step = job.match(/\n {8}env:\n {10}REQUIRE_LEGACY_BASE: '1'\n {8}run: node --test ([^\n]+)\n/);
  assert.ok(step, 'the job has a step that runs tests with REQUIRE_LEGACY_BASE');
  const listed = step[1].split(' ').sort();
  const readers = fs
    .readdirSync(__dirname)
    .filter(name => name.endsWith('.test.cjs') && name !== path.basename(__filename))
    .filter(name => fs.readFileSync(path.join(__dirname, name), 'utf8').includes("require('./helpers/legacy-base.cjs')"))
    .map(name => `scripts/__tests__/${name}`)
    .sort();
  assert.ok(readers.length >= 3);
  assert.deepEqual(listed, readers);
  // The quality job is shallow: requiring the base there would fail every pull request.
  assert.equal(WORKFLOW.slice(0, start).includes('REQUIRE_LEGACY_BASE'), false);
});
