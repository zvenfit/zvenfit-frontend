'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { cleanup, deployment, options, selectCandidates } = require('../cleanup-bucket-assets.cjs');

const release = { sha: 'a'.repeat(40), version: '175' };
const now = Date.parse('2026-11-27T12:00:00Z');
const old = '2026-11-20T10:00:00Z';
const cutoff = '2026-11-25T12:00:00Z';
const html = '<link href="/_astro/live.css?x=1"><script src="/_astro/app.js"></script>';
const object = (Key, LastModified = old, Size = 128) => ({ Key, LastModified, Size });

function fixture(t, extra = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist);
  fs.mkdirSync(path.join(dist, '_astro'));
  for (const key of ['live.css', 'app.js', 'font.woff2']) fs.writeFileSync(path.join(dist, '_astro', key), '');
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  fs.writeFileSync(path.join(dist, '404.html'), '<script src="/_astro/app.js"></script>');
  const objects = ['index.html', '404.html', '_astro/live.css', '_astro/app.js', '_astro/font.woff2'].map(key =>
    object(key),
  );
  objects.push(...extra);
  const removed = [];
  const reports = [];
  const client = {
    deployment: () => release,
    list: () => objects,
    readHtml: key => ({ release, html: fs.readFileSync(path.join(dist, key), 'utf8') }),
    remove: key => removed.push(key),
  };
  const config = options({ CLEANUP_ENVIRONMENT: 'staging' });
  const run = (execute = false) =>
    cleanup({
      client,
      config: { ...config, execute },
      sha: release.sha,
      dist,
      now,
      report: message => reports.push(message),
    });
  return { root, run, client, objects, removed, reports };
}

test('an empty listing yields no candidates', () => {
  assert.deepEqual(selectCandidates([], new Set(), '_astro/', Date.parse(cutoff)), []);
});

test('execute deletes exactly old unbuilt assets inside the allowed prefix', t => {
  const candidate = object('_astro/old.css', old, 6144);
  const box = fixture(t, [
    candidate,
    object('_astro/new.js', '2026-11-26T15:00:00Z'),
    object('_astro/boundary.css', cutoff),
    ...[
      'js/old.js',
      'css/old.css',
      'images/old.jpg',
      'images/coaches/a.jpg',
      'documents/cv.pdf',
      'v2/_astro/old.css',
      '_astro-backup/old.css',
      '_astro/../documents/cv.pdf',
      '_astro/',
    ].map(key => object(key)),
  ]);
  assert.deepEqual(box.run(true), [candidate]); // also protects the old, indirectly used font in dist
  assert.deepEqual(box.removed, [candidate.Key]);
  assert.match(box.reports[1], /Confirmed deletions: 1 of 1/);
});

test('dry-run with candidates issues zero delete calls and reports the evidence', t => {
  const box = fixture(t, [object('_astro/old.css', old, 6144), object('_astro/old.js', old, 2048)]);
  assert.equal(box.run().length, 2);
  assert.deepEqual(box.removed, []);
  const [summary] = box.reports;
  for (const value of [
    'dry-run',
    'staging',
    release.sha,
    'Candidates: **2**',
    'Total bytes: **8192**',
    '2 days',
    '2026-11-25T12:00:00.000Z',
    '_astro/old.css',
    '_astro/old.js',
    '6144',
    '2048',
  ]) {
    assert.ok(summary.includes(value), value);
  }
});

test('a live-only reference on another HTML page stops execute before any delete', t => {
  const box = fixture(t, [object('_astro/old.js')]);
  box.client.readHtml = key => ({
    release,
    html: key === '404.html' ? '<img srcset="/_astro/app.js, &#47;_astro/old.js">' : html,
  });
  assert.throws(() => box.run(true), /Live HTML differs.*old\.js/);
  assert.deepEqual(box.removed, []);
});

test('a URL attribute compares the entire object key, including punctuation', t => {
  const box = fixture(t, [object('_astro/(old),file.js')]);
  for (const reference of [
    '<script src="/_astro/(old),file.js"></script>',
    '<style>body { background: url("/_astro/(old),file.js") }</style>',
  ]) {
    box.client.readHtml = () => ({ release, html: html + reference });
    assert.throws(() => box.run(true), /Live HTML differs.*old.*file\.js/);
  }
  assert.deepEqual(box.removed, []);
});

test('a missing live reference also stops execute', t => {
  const box = fixture(t, [object('_astro/old.js')]);
  box.client.readHtml = () => ({ release, html: '<link href="/_astro/live.css">' });
  assert.throws(() => box.run(true), /Live HTML differs.*app\.js/);
  assert.deepEqual(box.removed, []);
});

test('an empty bucket cannot pass the live HTML guard', t => {
  const box = fixture(t);
  box.client.list = () => [];
  assert.throws(() => box.run(true), /Live HTML differs.*pages/);
  assert.deepEqual(box.removed, []);
});

test('unknown release, different checkout and mixed HTML deployments fail closed', t => {
  assert.throws(() => deployment({}), /release metadata/);
  const box = fixture(t, [object('_astro/old.js')]);
  box.client.deployment = () => ({ ...release, sha: 'b'.repeat(40) });
  assert.throws(() => box.run(true), /checkout SHA/);
  box.client.deployment = () => release;
  box.client.readHtml = () => ({ release: { ...release, version: '176' }, html });
  assert.throws(() => box.run(true), /Mixed deployment/);
  assert.deepEqual(box.removed, []);
});

test('a recent HTML upload blocks execution even when the unused asset itself is old', t => {
  const box = fixture(t, [object('_astro/old.css')]);
  box.objects.find(o => o.Key === '404.html').LastModified = '2026-11-26T12:00:00Z';
  assert.equal(box.run().length, 1);
  assert.throws(() => box.run(true), /Rollback window is still open/);
  assert.deepEqual(box.removed, []);
});

test('the CLI accepts only the site buckets, current prefix, boolean mode and justified retention', () => {
  const env = { CLEANUP_ENVIRONMENT: 'production' };
  assert.deepEqual(options(env), {
    environment: 'production',
    bucket: 'zvenfit-frontend',
    prefix: '_astro/',
    execute: false,
    days: 2,
  });
  for (const prefix of ['', '_astro', '_astro/,js/', '/', '*', 'v2/', 'css/', 'images/', 'documents/']) {
    assert.throws(() => options({ ...env, CLEANUP_PREFIXES: prefix }), /prefix/);
  }
  for (const days of ['-1', '0', '1', '1.5', 'NaN', '']) {
    assert.throws(() => options({ ...env, CLEANUP_MIN_AGE_DAYS: days }), /min_age_days/);
  }
  assert.throws(() => options({ ...env, CLEANUP_EXECUTE: 'yes' }), /execute/);
  assert.throws(() => options({ CLEANUP_ENVIRONMENT: 'zvenfit/v2' }), /staging or production/);
});

test('cleanup is manual, uses the release lock and rebuilds the revision stamped on deployed HTML', () => {
  const workflow = name => fs.readFileSync(path.join(__dirname, '../../.github/workflows', name + '.yml'), 'utf8');
  const lock = /\nconcurrency:\n  group: deploy\n  cancel-in-progress: false\n/;
  for (const name of ['main', 'staging', 'cleanup-assets']) assert.match(workflow(name), lock);
  const cleanupWorkflow = workflow('cleanup-assets');
  assert.deepEqual(
    [
      ...cleanupWorkflow
        .split('\non:\n')[1]
        .split('\nconcurrency:')[0]
        .matchAll(/^  (\w+):$/gm),
    ].map(m => m[1]),
    ['workflow_dispatch'],
  );
  assert.match(cleanupWorkflow, /execute:\n(?: {8}.*\n)*? {8}default: false/);
  assert.match(cleanupWorkflow, /prefixes:\n(?: {8}.*\n)*? {8}default: '_astro\/'/);
  assert.match(cleanupWorkflow, /min_age_days:\n(?: {8}.*\n)*? {8}default: 2\n/);
  assert.match(cleanupWorkflow, /timeout-minutes: (?:[1-9]|1\d|20)\n/);
  assert.match(cleanupWorkflow, /environment: \$\{\{ inputs.environment \}\}/);
  assert.match(cleanupWorkflow, /id-token: write/);
  assert.match(cleanupWorkflow, /steps.live.outputs.sha/);
  assert.match(cleanupWorkflow, /git worktree add --detach "\$RUNNER_TEMP\/deployed" "\$DEPLOYED_SHA"/);
  assert.match(
    workflow('_deploy-environment'),
    /--metadata "deployed-sha=\$\{GITHUB_SHA\},asset-version=\$\{GITHUB_RUN_NUMBER\}"/,
  );
});

test('the default CLI path calls only AWS read operations and writes the plan to the job summary', t => {
  const { root, objects } = fixture(t, [object('_astro/stale.js', '2000-01-01T00:00:00Z')]);
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--allow-empty',
    '--no-gpg-sign',
    '--quiet',
    '-m',
    'fixture',
  );
  const sha = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(root, 'listing'), JSON.stringify({ Contents: objects }));
  fs.writeFileSync(
    path.join(root, 'metadata'),
    JSON.stringify({ Metadata: { 'deployed-sha': sha, 'asset-version': '175' } }),
  );
  fs.writeFileSync(
    path.join(root, 'aws'),
    `#!/usr/bin/env bash
set -eu
echo "$2" >> calls
[[ "$1" == s3api && "$3" == --bucket && "$4" == zvenfit-frontend-staging ]]
case "$2" in
  head-object) cat metadata ;;
  list-objects-v2) cat listing ;;
  get-object)
    while [[ "$1" != --key ]]; do shift; done
    cp "dist/$2" "$3"
    cat metadata ;;
  *) exit 64 ;;
esac
`,
    { mode: 0o755 },
  );
  const summary = path.join(root, 'summary');
  const cli = (...args) =>
    execFileSync(process.execPath, [path.join(__dirname, '../cleanup-bucket-assets.cjs'), ...args], {
      cwd: root,
      env: {
        PATH: root + path.delimiter + process.env.PATH,
        CLEANUP_ENVIRONMENT: 'staging',
        GITHUB_STEP_SUMMARY: summary,
      },
      encoding: 'utf8',
    });
  assert.equal(cli('--deployment'), `sha=${sha}\nversion=175\n`);
  cli(root);
  assert.deepEqual(fs.readFileSync(path.join(root, 'calls'), 'utf8').trim().split('\n'), [
    'head-object',
    'head-object',
    'list-objects-v2',
    'get-object',
    'get-object',
  ]);
  assert.match(fs.readFileSync(summary, 'utf8'), /<code>_astro\/stale\.js<\/code>/);
});
