'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { promisify } = require('node:util');
const { execFile, execFileSync, spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { planCleanup, deployment, options, selectCandidates } = require('../cleanup-bucket-assets.cjs');

const release = { sha: 'a'.repeat(40), version: '175' };
const now = Date.parse('2026-11-27T12:00:00Z');
const old = '2026-11-20T10:00:00Z';
const cutoff = '2026-11-25T12:00:00Z';
const html = '<link href="/_astro/live.css?x=1"><script src="/_astro/app.js"></script>';
const object = (Key, LastModified = old, Size = 128) => ({ Key, LastModified, Size });

function fixture(t, extra = []) {
  const runnerTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-fixture-'));
  t.after(() => fs.rmSync(runnerTemp, { recursive: true, force: true }));
  const root = path.join(runnerTemp, 'deployed');
  fs.mkdirSync(root);
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
    readHtml: key => ({ release, html: fs.readFileSync(path.join(dist, key)) }),
    remove: key => removed.push(key),
  };
  const config = options({ CLEANUP_ENVIRONMENT: 'staging' });
  const run = (execute = false) =>
    planCleanup({
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

test('the execute plan contains exactly the old unbuilt assets inside the allowed prefix', t => {
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
  assert.deepEqual(box.removed, []);
  assert.equal(box.reports.length, 1);
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
    html: Buffer.from(key === '404.html' ? '<img srcset="/_astro/app.js, &#47;_astro/old.js">' : html),
  });
  assert.throws(() => box.run(true), /Live HTML differs from dist: 404\.html/);
  assert.deepEqual(box.removed, []);
});

test('live-only relative CSS on the home page stops planning and deletion', t => {
  const box = fixture(t, [object('_astro/hero-old.png')]);
  const read = box.client.readHtml;
  box.client.readHtml = key =>
    key === 'index.html'
      ? { release, html: Buffer.from(html + '<style>.hero{background:url(_astro/hero-old.png)}</style>') }
      : read(key);
  for (const execute of [false, true])
    assert.throws(() => box.run(execute), /Live HTML differs from dist: index\.html/);
  assert.deepEqual(box.reports, []);
  assert.deepEqual(box.removed, []);
});

test('identical pages resolve inline CSS against the document base and protect the whole key', t => {
  const box = fixture(t, [object('_astro/(old),file.png')]);
  const file = path.join(box.root, 'dist/index.html');
  for (const use of [
    '<style>.hero{background:url("(old),file.png")}</style>',
    `<div style='background:url("(old),file.png")'></div>`,
    '<script src="(old),file.png"></script>',
  ]) {
    fs.writeFileSync(file, '<head><base href="/_astro/"></head>' + html + use);
    assert.throws(() => box.run(true), /Incomplete dist: missing referenced asset _astro\/\(old\),file\.png/);
  }
  assert.deepEqual(box.removed, []);
});

test('quoted CSS imports and image-set URLs must exist in the rebuilt site', t => {
  const box = fixture(t, [object('_astro/old.css')]);
  for (const rule of ['@import "_astro/old.css" screen;', '.hero{background-image:image-set("_astro/old.css" 1x)}']) {
    fs.writeFileSync(path.join(box.root, 'dist/index.html'), html + '<style>' + rule + '</style>');
    for (const execute of [false, true]) {
      assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset _astro/old.css' });
    }
  }
  assert.deepEqual(box.reports, []);
});

test('absolute storage URLs protect only the selected site bucket', t => {
  const candidate = object('_astro/old.css');
  const box = fixture(t, [candidate]);
  const file = path.join(box.root, 'dist/index.html');
  const filename = '_astro/old.css';
  for (const base of [
    'https://storage.yandexcloud.net/zvenfit-frontend-staging/',
    'https://zvenfit-frontend-staging.storage.yandexcloud.net/',
    'https://zvenfit-frontend-staging.website.yandexcloud.net/',
  ]) {
    fs.writeFileSync(file, html + `<link href="${base}${filename}">`);
    assert.throws(() => box.run(true), { message: 'Incomplete dist: missing referenced asset ' + filename });
  }
  fs.writeFileSync(file, html + `<img src="https://storage.yandexcloud.net/another-site/${filename}">`);
  assert.deepEqual(box.run(true), [candidate]);
});

test('emitted CSS resolves relative dependencies against the stylesheet directory', t => {
  const image = object('_astro/nested/old.png');
  const css = object('_astro/nested/nested.css');
  const stale = object('_astro/unused.js');
  const box = fixture(t, [image, css, stale]);
  const assets = path.join(box.root, 'dist/_astro');
  fs.mkdirSync(path.join(assets, 'nested'));
  fs.writeFileSync(path.join(assets, 'live.css'), '@import "nested/nested.css";');
  fs.writeFileSync(path.join(assets, 'nested/nested.css'), '.hero{background:url(old.png)}');
  for (const execute of [false, true]) {
    assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + image.Key });
  }
  fs.writeFileSync(path.join(assets, 'nested/old.png'), '');
  assert.deepEqual(box.run(true), [stale]);
});

test('metadata and inline JSON preserve the origin and bucket of an asset URL', t => {
  const candidate = object('_astro/share.png');
  const box = fixture(t, [candidate]);
  const file = path.join(box.root, 'dist/index.html');
  const documents = url => [
    `<meta property="og:image" content="${url}">`,
    `<script type="application/ld+json">{"image":"${url}"}</script>`,
  ];
  for (const markup of documents('https://storage.yandexcloud.net/zvenfit/v2/_astro/share.png')) {
    fs.writeFileSync(file, html + markup);
    assert.deepEqual(box.run(true), [candidate]);
  }
  for (const markup of documents('https://storage.yandexcloud.net/zvenfit-frontend-staging/_astro/share.png')) {
    fs.writeFileSync(file, html + markup);
    assert.throws(() => box.run(true), { message: 'Incomplete dist: missing referenced asset ' + candidate.Key });
  }
});

test('module imports in emitted JS and inline modules protect old chunks', t => {
  const chunk = object('_astro/old.js');
  const stale = object('_astro/stale.js');
  const box = fixture(t, [chunk, stale]);
  const dist = path.join(box.root, 'dist');
  const app = path.join(dist, '_astro/app.js');
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    '<link href="/_astro/live.css"><script type="module" src="/_astro/app.js"></script>',
  );
  for (const source of ['import "./old.js";', 'export * from "./old.js";', 'import("./old.js")']) {
    fs.writeFileSync(app, source);
    for (const execute of [false, true])
      assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + chunk.Key });
  }
  fs.writeFileSync(app, 'import("./" + location.hash.slice(1))');
  assert.throws(() => box.run(true), /Cannot verify a computed module import/);
  fs.writeFileSync(app, '');
  fs.writeFileSync(path.join(dist, 'index.html'), html + '<script type="module">import "./_astro/old.js";</script>');
  assert.throws(() => box.run(true), { message: 'Incomplete dist: missing referenced asset ' + chunk.Key });
  fs.writeFileSync(path.join(dist, chunk.Key), '');
  assert.deepEqual(box.run(true), [stale]);
});

test('a missing live reference also stops execute', t => {
  const box = fixture(t, [object('_astro/old.js')]);
  box.client.readHtml = () => ({ release, html: Buffer.from('<link href="/_astro/live.css">') });
  assert.throws(() => box.run(true), /Live HTML differs from dist: index\.html/);
  assert.deepEqual(box.removed, []);
});

test('a missing direct or indirect deployed asset blocks dry-run and execute', t => {
  const box = fixture(t, [object('_astro/stale.js')]);
  for (const key of ['_astro/app.js', '_astro/font.woff2']) {
    box.client.list = () => box.objects.filter(object => object.Key !== key);
    for (const execute of [false, true]) {
      assert.throws(() => box.run(execute), { message: `Incomplete deployment: missing bucket object ${key}` });
    }
  }
  assert.deepEqual(box.reports, []);
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
  const lock = /\nconcurrency:\n  group: deploy\n  cancel-in-progress: false\n  queue: max\n/;
  for (const name of ['main', 'staging', 'cleanup-assets']) assert.match(workflow(name), lock);
  const checklist = fs.readFileSync(path.join(__dirname, '../../docs/launch-checklist.md'), 'utf8');
  for (const name of ['main', 'staging', 'cleanup-assets']) {
    assert.ok(checklist.includes('**' + workflow(name).match(/^name: (.+)$/m)[1] + '**'));
  }
  assert.match(checklist, /очередь `deploy` с `queue: max`/);
  assert.match(checklist, /до 100 ожидающих/);
  assert.match(checklist, /отменяет вновь поступивший запуск/);
  assert.match(checklist, /более поздний успешный релиз этот коммит/);
  assert.match(checklist, /новый\s+ручной запуск \*\*Release\*\* для текущего `main` через staging и E2E/);
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
  assert.match(
    cleanupWorkflow,
    /\n    environment:\n      name: \$\{\{ inputs.environment \}\}\n      deployment: false\n/,
  );
  assert.match(cleanupWorkflow, /CLEANUP_EXECUTE: \$\{\{ inputs.execute \}\}\n        run: \|/);
  assert.ok(
    cleanupWorkflow.includes(
      'CLEANUP_JOB_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}/job/${{ job.check_run_id }}',
    ),
  );
  assert.match(cleanupWorkflow, /id-token: write/);
  assert.match(cleanupWorkflow, /steps.live.outputs.sha/);
  assert.match(cleanupWorkflow, /git worktree add --detach "\$RUNNER_TEMP\/deployed" "\$DEPLOYED_SHA"/);
  assert.match(
    workflow('_deploy-environment'),
    /--metadata "deployed-sha=\$\{GITHUB_SHA\},asset-version=\$\{GITHUB_RUN_NUMBER\}"/,
  );
});

function cleanupStep(name) {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/cleanup-assets.yml'), 'utf8');
  return workflow
    .split(`      - name: ${name}\n`)[1]
    .split('\n      - ')[0]
    .split('        run: |\n')[1]
    .replace(/^          /gm, '');
}

test('re-running an older dispatch can rebuild a newer deployed SHA on main', t => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/cleanup-assets.yml'), 'utf8');
  const checkout = workflow.split('      - uses: actions/checkout@')[1].split('      - uses:')[0];
  assert.match(checkout, /^          ref: \$\{\{ github\.sha \}\}$/m);
  assert.match(checkout, /^          fetch-depth: 0$/m);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-rerun-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '--quiet', '-b', 'main');
  const commit = title => {
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '--quiet',
      '--allow-empty',
      '--no-gpg-sign',
      '-m',
      title,
    );
    return git('rev-parse', 'HEAD');
  };
  const dispatchSha = commit('dispatch');
  const liveSha = commit('deployed later');
  git('update-ref', 'refs/remotes/origin/main', liveSha);
  git('checkout', '--quiet', '--detach', dispatchSha);
  const unrelated = commit('outside main');
  git('checkout', '--quiet', '--detach', dispatchSha);
  assert.match(workflow, /- name: Require current main for execution\n        if: inputs.execute\n/);
  assert.ok(workflow.indexOf('Require current main') < workflow.indexOf('Authenticate with the selected'));
  const preflight = sha =>
    spawnSync('bash', ['-ec', cleanupStep('Require current main for execution')], {
      cwd: dir,
      env: { PATH: process.env.PATH, GITHUB_SHA: sha },
      encoding: 'utf8',
    });
  assert.equal(preflight(dispatchSha).status, 1);
  assert.equal(preflight(liveSha).status, 0);
  const prepare = sha =>
    spawnSync('bash', ['-e', '-o', 'pipefail', '-c', cleanupStep('Prepare the deployed checkout')], {
      cwd: dir,
      env: { PATH: dir + path.delimiter + process.env.PATH, RUNNER_TEMP: dir, DEPLOYED_SHA: sha },
      encoding: 'utf8',
    });
  assert.equal(prepare(unrelated).status, 1);
  const result = prepare(liveSha);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git('rev-parse', 'HEAD'), dispatchSha);
  assert.equal(git('-C', path.join(dir, 'deployed'), 'rev-parse', 'HEAD'), liveSha);
});

test('historical npm and build guards receive only archived source, public settings and a dist mount', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-build-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args]);
  git('init', '--quiet');
  fs.writeFileSync(path.join(dir, 'tracked'), 'committed');
  git('add', 'tracked');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--quiet',
    '--no-gpg-sign',
    '-m',
    'fixture',
  );
  fs.writeFileSync(path.join(dir, 'runner-only'), 'private fixture');
  // Capture exactly what crosses the Docker boundary, including the archive on stdin.
  fs.writeFileSync(
    path.join(dir, 'docker'),
    [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      "fs.writeFileSync('argv', JSON.stringify(process.argv.slice(2)));",
      "fs.writeFileSync('source.tar', fs.readFileSync(0));",
    ].join('\n'),
    { mode: 0o755 },
  );
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/cleanup-assets.yml'), 'utf8');
  const rebuild = cleanupStep('Rebuild and check the deployed site');
  assert.match(rebuild, /bash scripts\/rebuild-cleanup-site\.sh "\$RUNNER_TEMP\/deployed"/);
  assert.doesNotMatch(workflow, /working-directory:.*deployed|cd "\$RUNNER_TEMP\/deployed"/);
  assert.deepEqual(
    workflow.match(/^\s*(?:run: )?npm .+$/gm).map(line => line.trim()),
    ['run: npm ci --ignore-scripts'],
  );
  execFileSync('bash', [path.join(__dirname, '../rebuild-cleanup-site.sh'), dir], {
    cwd: dir,
    env: {
      PATH: dir + path.delimiter + process.env.PATH,
      NODE_ENV: 'staging',
      YC_IAM_TOKEN: 'fixture',
      AWS_SESSION_TOKEN: 'fixture',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture',
    },
  });
  assert.equal(execFileSync('tar', ['-tf', 'source.tar'], { cwd: dir, encoding: 'utf8' }).trim(), 'tracked');
  const argv = JSON.parse(fs.readFileSync(path.join(dir, 'argv')));
  const image = argv.findIndex(arg => /^ubuntu:24\.04@sha256:[0-9a-f]{64}$/.test(arg));
  assert.ok(image > 0);
  const options = argv.slice(0, image);
  assert.deepEqual(options, [
    'run',
    '--rm',
    '-i',
    '--user',
    process.getuid() + ':' + process.getgid(),
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--mount',
    'type=bind,source=' + path.resolve(process.execPath, '../..') + ',target=/opt/node,readonly',
    '--mount',
    'type=bind,source=' + dir + '/dist,target=/output',
    '--env',
    'HOME=/tmp',
    '--env',
    'PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin',
    '--env',
    'BUILD_MODE=staging',
    '--env',
    'ASSET_VERSION',
    '--env',
    'Y_MAPS_API_KEY',
    '--env',
    'LEAD_API_URL',
    '--env',
    'SCHEDULE_API_URL',
    '--env',
    'TRAFFIC_API_URL',
  ]);
  assert.deepEqual(argv.slice(image + 1, -1), ['bash', '-euo', 'pipefail', '-c']);
  assert.match(argv.at(-1), /npm ci [^\n]+\n\s+export NODE_ENV="\$BUILD_MODE"\n\s+npm run build/);
  for (const check of ['routes', 'build', 'staging-build'])
    assert.ok(argv.at(-1).includes('node scripts/check-' + check + '.cjs'));
});

test('recovery routes staging incidents to the staging-only workflow and production through E2E', () => {
  const root = path.join(__dirname, '../..');
  const runbook = fs.readFileSync(path.join(root, 'knowledge-base/staging-runbook.md'), 'utf8');
  const recovery = runbook.split('**Recovery.**')[1].split('\n## ')[0];
  const [staging, production] = recovery.split('- **Staging only.**')[1].split('- **Production.**');
  const workflowName = file =>
    fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8').match(/^name: (.+)$/m)[1];
  assert.ok(staging.includes(`**${workflowName('staging.yml')}**`));
  assert.doesNotMatch(staging, /\*\*Release\*\*/);
  assert.match(staging, /older SHA[\s\S]*exact SHA/);
  assert.ok(production.includes(`**${workflowName('main.yml')}**`));
  assert.match(production, /skip_staging` unchecked/);
});

function dispatchFixture(t, extra = [object('_astro/stale.js')]) {
  const { root, objects } = fixture(t, extra);
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
  fs.writeFileSync(
    path.join(root, 'listing'),
    JSON.stringify({ Contents: objects.map(o => ({ ...o, LastModified: '2000-01-01T00:00:00Z' })) }),
  );
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
  list-objects-v2)
    node -e 'const fs = require("node:fs"); const data = JSON.parse(fs.readFileSync("listing"));
      const removed = fs.existsSync("removed") ? fs.readFileSync("removed", "utf8").split("\\n") : [];
      console.log(JSON.stringify({Contents: data.Contents.filter(o => !removed.includes(o.Key))}));' ;;
  get-object)
    while [[ "$1" != --key ]]; do shift; done
    cp "dist/$2" "$3"
    cat metadata ;;
  delete-object)
    while [[ "$1" != --key ]]; do shift; done
    if [[ "$2" == "\${STUB_CANCEL_ON:-}" ]]; then kill -TERM "$PPID"; exit 1; fi
    echo "$2" >> removed ;;
  *) exit 64 ;;
esac
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(root, 'gh'),
    `#!/usr/bin/env bash
set -eu
echo main >> gh-calls
[[ "$*" == 'api repos/zvenfit/zvenfit-frontend/git/ref/heads/main --jq .object.sha' ]]
[[ "$STUB_MAIN_SHA" != unavailable ]]
echo "$STUB_MAIN_SHA"
`,
    { mode: 0o755 },
  );
  const summary = path.join(root, 'summary');
  const script = path.join(__dirname, '../cleanup-bucket-assets.cjs');
  const local = {
    PATH: root + path.delimiter + process.env.PATH,
    CLEANUP_ENVIRONMENT: 'staging',
    CLEANUP_JOB_URL: 'https://github.com/zvenfit/zvenfit-frontend/actions/runs/123/job/789',
    GITHUB_STEP_SUMMARY: summary,
  };
  const dispatch = {
    ...local,
    CLEANUP_EXECUTE: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'zvenfit/zvenfit-frontend',
    GITHUB_SHA: sha,
    STUB_MAIN_SHA: sha,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_WORKFLOW_REF: 'zvenfit/zvenfit-frontend/.github/workflows/cleanup-assets.yml@refs/heads/main',
    GITHUB_JOB: 'cleanup',
    RUNNER_TEMP: path.dirname(root),
  };
  fs.symlinkSync(path.resolve(__dirname, '..'), path.join(root, 'scripts'), 'dir');
  const shell = ['-e', '-o', 'pipefail', '-c', cleanupStep('Verify live HTML and process candidates')];
  return { root, sha, summary, script, local, dispatch, shell };
}

test('the CLI only reads and the dispatch step deletes exactly the verified candidates on execute', t => {
  const { root, sha, summary, script, local, dispatch, shell } = dispatchFixture(t);
  function refused(target, env, error) {
    const result = spawnSync(process.execPath, [script, target], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
  }
  // Even a shell with a copy of the job environment cannot pass a local dist for execute.
  refused(root, { ...local, CLEANUP_EXECUTE: 'true' }, /Local cleanup is dry-run only/);
  refused(root, dispatch, /Local cleanup is dry-run only/);
  refused('--workflow', { ...local, CLEANUP_EXECUTE: 'true' }, /requires the manual cleanup job/);
  refused('--workflow', dispatch, /requires the manual cleanup job/);
  assert.equal(fs.existsSync(path.join(root, 'calls')), false);

  const cli = (...args) =>
    execFileSync(process.execPath, [script, ...args], { cwd: root, env: local, encoding: 'utf8' });
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

  // Importing the planner with the dispatch environment still only computes keys.
  const readOnly = execFileSync(
    process.execPath,
    ['-e', 'const plan = require(process.argv[1]).planForWorkflow(); console.log(JSON.stringify(plan));', script],
    { cwd: root, env: dispatch, encoding: 'utf8' },
  );
  assert.deepEqual(JSON.parse(readOnly.trim().split('\n').at(-1)), {
    bucket: 'zvenfit-frontend-staging',
    execute: true,
    keys: ['_astro/stale.js'],
  });
  assert.equal(fs.existsSync(path.join(root, 'removed')), false);

  for (const change of [
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_JOB: 'quality' },
    { GITHUB_WORKFLOW_REF: dispatch.GITHUB_WORKFLOW_REF.replace('main', 'other') },
    { RUNNER_TEMP: '' },
  ]) {
    const rejected = spawnSync('bash', shell, { cwd: root, env: { ...dispatch, ...change }, encoding: 'utf8' });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /requires the manual cleanup job/);
  }
  execFileSync('bash', shell, { cwd: root, env: { ...dispatch, CLEANUP_EXECUTE: 'false' } });
  assert.equal(fs.existsSync(path.join(root, 'removed')), false);
  execFileSync('bash', shell, { cwd: root, env: dispatch });
  assert.deepEqual(fs.readFileSync(path.join(root, 'removed'), 'utf8').trim().split('\n'), ['_astro/stale.js']);
  assert.match(fs.readFileSync(summary, 'utf8'), /Confirmed deletions: 1 of 1/);
});

test('a stale dispatch can repeat a dry-run but only the current main policy can delete', t => {
  const { root, dispatch, shell, summary } = dispatchFixture(t);
  const futureMain = 'b'.repeat(40);
  const run = overrides =>
    spawnSync('bash', shell, { cwd: root, env: { ...dispatch, ...overrides }, encoding: 'utf8' });
  const dry = run({ STUB_MAIN_SHA: 'unavailable', CLEANUP_EXECUTE: 'false' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(fs.readFileSync(summary, 'utf8'), /_astro\/stale\.js/);
  assert.ok(!fs.existsSync(path.join(root, 'gh-calls')));
  for (const head of [futureMain, 'unavailable', 'invalid']) {
    const result = run({ STUB_MAIN_SHA: head });
    assert.notEqual(result.status, 0);
    assert.ok(!fs.existsSync(path.join(root, 'removed')));
  }
  assert.equal(fs.readFileSync(path.join(root, 'gh-calls'), 'utf8'), 'main\nmain\nmain\n');
  // The current policy may clean a site which is still serving the previous release.
  const current = run({ GITHUB_SHA: futureMain, STUB_MAIN_SHA: futureMain });
  assert.equal(current.status, 0, current.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'removed'), 'utf8'), '_astro/stale.js\n');
});

test('an interrupted execute preserves the last confirmed count and key before starting the next delete', t => {
  const keys = ['_astro/first.js', '_astro/second.js', '_astro/third.js'];
  const { root, dispatch, shell, summary } = dispatchFixture(
    t,
    keys.map(key => object(key)),
  );
  const interrupted = spawnSync('bash', shell, {
    cwd: root,
    env: { ...dispatch, STUB_CANCEL_ON: keys[1] },
    encoding: 'utf8',
  });
  assert.ok(interrupted.signal === 'SIGTERM' || interrupted.status === 143, interrupted.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'removed'), 'utf8'), keys[0] + '\n');
  assert.match(interrupted.stdout, /Confirmed deletion 1\/3: "_astro\/first.js"/);
  assert.doesNotMatch(interrupted.stdout, /Confirmed deletion 2\/3/);
  assert.deepEqual(fs.readFileSync(summary, 'utf8').match(/Confirmed deletions: .*/g), [
    'Confirmed deletions: 1 of 3.',
  ]);
  const remaining = execFileSync('bash', shell, {
    cwd: root,
    env: { ...dispatch, CLEANUP_EXECUTE: 'false' },
    encoding: 'utf8',
  });
  assert.match(remaining, /Candidates: \*\*2\*\*/);
  assert.ok(!remaining.includes(keys[0]));
  assert.ok(remaining.includes(keys[1]) && remaining.includes(keys[2]));
});

test('a candidate table over the UTF-8 summary limit remains complete in the linked attempt log', t => {
  const objects = Array.from({ length: 9000 }, (_, i) =>
    object('_astro/' + 'я'.repeat(30) + String(i).padStart(5, '0') + '.css', old, 2),
  );
  const { root, dispatch, shell, summary } = dispatchFixture(t, objects);
  const output = execFileSync('bash', shell, {
    cwd: root,
    env: { ...dispatch, CLEANUP_EXECUTE: 'false' },
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.ok(output.length < 1024 * 1024 && Buffer.byteLength(output) > 1024 * 1024);
  const listed = [...output.matchAll(/<code>([^<]+)<\/code>/g)].map(m => m[1]);
  assert.deepEqual(
    listed,
    objects.map(o => o.Key),
  );
  const compact = fs.readFileSync(summary, 'utf8');
  assert.ok(Buffer.byteLength(compact) < 1024 * 1024 - 128);
  assert.match(compact, /Candidates: \*\*9000\*\* · Total bytes: \*\*18000\*\*/);
  assert.match(compact, /LastModified strictly before/);
  assert.ok(compact.includes('[job log](' + dispatch.CLEANUP_JOB_URL + ')'));
  assert.equal(fs.existsSync(path.join(root, 'removed')), false);
});

test('concurrent ephemeral sessions use a bucket prefix for reads and grant delete only for execute', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-session-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, 'curl'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const argument = name => process.argv[process.argv.indexOf(name) + 1];
const request = JSON.parse(fs.readFileSync(argument('--data-binary').slice(1), 'utf8'));
fs.writeFileSync(process.env.POLICY_CAPTURE, request.policy);
fs.writeFileSync(argument('--output'), JSON.stringify({accessKeyId:'fixture',secret:'fixture',sessionToken:'fixture'}));
process.stdout.write('200');`,
    { mode: 0o755 },
  );
  const sessions = [
    ['cleanup-plan', 'zvenfit-frontend'],
    ['cleanup-execute', 'zvenfit-frontend-staging'],
  ];
  await Promise.all(
    sessions.map(async ([mode, bucket]) => {
      const capture = path.join(dir, mode + '.json');
      await promisify(execFile)('bash', [path.join(__dirname, '../issue-ephemeral-storage-key.sh')], {
        cwd: dir,
        env: {
          PATH: dir + path.delimiter + process.env.PATH,
          YC_IAM_TOKEN: 'fixture',
          YC_DEPLOY_SERVICE_ACCOUNT_ID: 'fixture',
          STORAGE_SESSION_MODE: mode,
          OBJECT_STORAGE_BUCKET: bucket,
          TMPDIR: dir,
          GITHUB_ENV: path.join(dir, mode + '.env'),
          POLICY_CAPTURE: capture,
        },
      });
      const { Statement } = JSON.parse(fs.readFileSync(capture, 'utf8'));
      const arn = 'arn:aws:s3:::' + bucket;
      const grant = (action, resource) => ({ Effect: 'Allow', Principal: '*', Action: [action], Resource: [resource] });
      const expected = [grant('s3:ListBucket', arn), grant('s3:GetObject', arn + '/*')];
      if (mode === 'cleanup-execute') expected.push(grant('s3:DeleteObject', arn + '/_astro/*'));
      assert.deepEqual(Statement, expected);
    }),
  );
});
