'use strict';

// The legacy tree left the branch in stage A2b, so the tests of the converter
// read it from git: from the base of the comparison pinned in
// .github/workflows/quality.yml, the same commit the converter gets as --ref.
// A shallow checkout (the quality job, the deploy) does not carry that commit,
// and there these tests are skipped with a reason. The compare-dist job has the
// whole history and runs them with REQUIRE_LEGACY_BASE=1, which turns a missing
// base into a failure, so they cannot go quiet in CI (legacy-base.test.cjs
// keeps the list of files in that job complete).

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const { pinnedBaseSha } = require('../../lib/parity-harness.cjs');

const ROOT = path.resolve(__dirname, '../../..');
const LEGACY_BASE_SHA = pinnedBaseSha();

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function hasCommit(sha) {
  try {
    git('cat-file', '-e', `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

// Returns the guard a test calls first: `if (!legacyBase(t)) return;`.
function legacyBaseGate({ sha = LEGACY_BASE_SHA, available = hasCommit(sha), required = Boolean(process.env.REQUIRE_LEGACY_BASE) } = {}) {
  return t => {
    if (available) {
      return true;
    }
    const reason = `the pinned legacy base ${sha} is not in this checkout (a shallow clone?)`;
    if (required) {
      throw new Error(`${reason}, and REQUIRE_LEGACY_BASE is set: fetch the full history`);
    }
    t.skip(`${reason}; the compare-dist job runs this test with the full history`);
    return false;
  };
}

// A file of the legacy tree, byte for byte as the converter reads it.
function showLegacy(file) {
  return git('show', `${LEGACY_BASE_SHA}:${file}`);
}

function listLegacy(directory) {
  return git('ls-tree', '-r', '--name-only', LEGACY_BASE_SHA, directory).split('\n').filter(Boolean);
}

module.exports = { LEGACY_BASE_SHA, hasCommit, legacyBase: legacyBaseGate(), legacyBaseGate, listLegacy, showLegacy };
