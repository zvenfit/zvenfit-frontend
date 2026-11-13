'use strict';

// Build harness of the parity check: disposable git worktrees for the base and
// the candidate commit, `npm ci` in each, deterministic builds with fixed
// non-secret variables and the committed map-photo snapshot. The legacy build
// gets a `curl` stub first in PATH so build-static.cjs takes its fallback photos
// instead of the network; the only fixture override is the `locationPhotos`
// field of scripts/maps.config.json, restored right after the build.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ASSET_VERSION = 'parity';
const FIXED_ENV = Object.freeze({
  production: Object.freeze({
    LEAD_API_URL: 'https://parity.invalid/lead',
    SCHEDULE_API_URL: 'https://parity.invalid/schedule',
    TRAFFIC_API_URL: 'https://parity.invalid/traffic',
  }),
  staging: Object.freeze({
    LEAD_API_URL: 'https://staging.zvenfit.ru/api/lead',
    SCHEDULE_API_URL: 'https://staging.zvenfit.ru/api/schedule',
    TRAFFIC_API_URL: 'https://staging.zvenfit.ru/api/traffic',
  }),
});
// Variables that must not leak from the developer shell into a build.
const SCRUBBED_VARIABLES = ['LEAD_API_URL', 'SCHEDULE_API_URL', 'TRAFFIC_API_URL', 'ASSET_VERSION', 'Y_MAPS_API_KEY', 'NODE_ENV', 'MODE'];

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function resolveSha(value, label) {
  if (value === 'HEAD') {
    return git(['rev-parse', 'HEAD']);
  }
  if (!/^[0-9a-f]{40}$/.test(value || '')) {
    throw new Error(`compare-dist: ${label} must be a full 40-hex commit SHA (the literal HEAD is accepted for local runs)`);
  }
  try {
    git(['cat-file', '-e', `${value}^{commit}`]);
  } catch {
    throw new Error(`compare-dist: ${label} ${value} is not a commit in this repository (fetch it first)`);
  }
  return value;
}

function readSnapshot(snapshotPath) {
  const absolute = path.resolve(ROOT, snapshotPath);
  const raw = fs.readFileSync(absolute);
  const data = JSON.parse(raw.toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`compare-dist: snapshot ${snapshotPath} must be an object of location keys to URL arrays`);
  }
  for (const [key, urls] of Object.entries(data)) {
    if (!Array.isArray(urls) || urls.some(url => typeof url !== 'string' || !/^https:\/\//.test(url))) {
      throw new Error(`compare-dist: snapshot ${snapshotPath} has an invalid photo list for "${key}"`);
    }
  }
  return { path: absolute, data, digest: sha256(raw) };
}

function run(command, args, { cwd, env = {}, log }) {
  const scrubbed = { ...process.env };
  for (const name of SCRUBBED_VARIABLES) {
    delete scrubbed[name];
  }
  log?.(`$ ${command} ${args.join(' ')}  (in ${path.relative(ROOT, cwd) || '.'})`);
  const result = spawnSync(command, args, {
    cwd,
    env: { ...scrubbed, ASTRO_TELEMETRY_DISABLED: '1', ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`compare-dist: ${command} ${args.join(' ')} failed in ${cwd} (exit ${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function prepareWorktree(sha, dir, log) {
  if (fs.existsSync(path.join(dir, '.git'))) {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    if (head === sha) {
      log(`reusing worktree ${dir}`);
      execFileSync('git', ['checkout', '--', '.'], { cwd: dir, stdio: 'ignore' });
      execFileSync('git', ['clean', '-fdx', '-e', 'node_modules', '-e', '.parity'], { cwd: dir, stdio: 'ignore' });
      return;
    }
    git(['worktree', 'remove', '--force', dir]);
  } else if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  git(['worktree', 'prune']);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  log(`creating worktree ${dir} at ${sha}`);
  git(['worktree', 'add', '--detach', dir, sha]);
}

function removeWorktree(dir) {
  if (fs.existsSync(path.join(dir, '.git'))) {
    git(['worktree', 'remove', '--force', dir]);
  }
}

function install(dir, log) {
  const lock = fs.readFileSync(path.join(dir, 'package-lock.json'));
  const marker = path.join(dir, 'node_modules', '.compare-dist-lock');
  const digest = sha256(lock);
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === digest) {
    log(`dependencies already installed in ${path.relative(ROOT, dir)}`);
    return;
  }
  run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, log });
  fs.writeFileSync(marker, digest);
}

function moveDist(dir, name) {
  const target = path.join(dir, '.parity', name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(path.join(dir, 'dist'), target);
  return target;
}

function withoutPhotos(config) {
  const { locationPhotos, ...rest } = config;
  void locationPhotos;
  return rest;
}

function buildLegacy({ dir, snapshot, log }) {
  const mapsConfigPath = path.join(dir, 'scripts', 'maps.config.json');
  const current = JSON.parse(fs.readFileSync(mapsConfigPath, 'utf8'));
  const committed = JSON.parse(execFileSync('git', ['show', 'HEAD:scripts/maps.config.json'], { cwd: dir, encoding: 'utf8' }));
  if (JSON.stringify(withoutPhotos(current)) !== JSON.stringify(withoutPhotos(committed))) {
    throw new Error('compare-dist: the base worktree maps.config.json differs from its commit beyond locationPhotos');
  }
  const stubDir = path.join(dir, '.parity', 'bin');
  fs.mkdirSync(stubDir, { recursive: true });
  fs.writeFileSync(path.join(stubDir, 'curl'), '#!/bin/sh\nexit 22\n', { mode: 0o755 });
  fs.writeFileSync(mapsConfigPath, `${JSON.stringify({ ...current, locationPhotos: snapshot.data }, null, 2)}\n`);
  try {
    run(process.execPath, ['scripts/build-static.cjs'], {
      cwd: dir,
      log,
      env: {
        ...FIXED_ENV.production,
        NODE_ENV: 'production',
        ASSET_VERSION,
        Y_MAPS_API_KEY: '',
        PATH: `${stubDir}${path.delimiter}${process.env.PATH}`,
      },
    });
  } finally {
    execFileSync('git', ['checkout', '--', 'scripts/maps.config.json'], { cwd: dir, stdio: 'ignore' });
  }
  return moveDist(dir, 'dist-production');
}

function assertCandidateSnapshot(dir, snapshot) {
  const candidateSnapshotPath = path.join(dir, 'src', 'data', 'map-photos.json');
  if (!fs.existsSync(candidateSnapshotPath)) {
    throw new Error('compare-dist: the candidate has no src/data/map-photos.json');
  }
  const candidate = JSON.parse(fs.readFileSync(candidateSnapshotPath, 'utf8'));
  if (JSON.stringify(candidate) !== JSON.stringify(snapshot.data)) {
    throw new Error('compare-dist: the candidate src/data/map-photos.json differs from the --snapshot file');
  }
}

function buildAstro({ dir, mode, log }) {
  run('npm', ['run', 'build'], {
    cwd: dir,
    log,
    env: {
      ...FIXED_ENV[mode === 'staging' ? 'staging' : 'production'],
      NODE_ENV: mode,
      ASSET_VERSION,
      Y_MAPS_API_KEY: '',
    },
  });
  return moveDist(dir, `dist-${mode}`);
}

function defaultWorkDir() {
  return path.join(os.tmpdir(), 'zvenfit-compare-dist');
}

module.exports = {
  ASSET_VERSION,
  FIXED_ENV,
  ROOT,
  assertCandidateSnapshot,
  buildAstro,
  buildLegacy,
  defaultWorkDir,
  install,
  prepareWorktree,
  readSnapshot,
  removeWorktree,
  resolveSha,
  sha256,
};
