'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { parseListing, verifySnapshot } = require('../lib/bucket-snapshot.cjs');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'snapshot-bucket.sh');
const BUCKET_FILES = { 'index.html': '<html>home</html>\n', 'js/lead-config.js': "window.ZVENFIT_LEAD_API = 'x';\n", '_astro/site.abc.css': '.a{color:red}' };

const md5 = text => crypto.createHash('md5').update(text).digest('hex');

function write(directory, files) {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(directory, ...name.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

// The listing of the same objects as each tool prints it.
const awsListing = (files, extra = {}) => JSON.stringify({ Contents: Object.entries(files).map(([Key, body]) => ({ Key, Size: Buffer.byteLength(body), ETag: `"${md5(body)}"`, StorageClass: 'STANDARD' })), ...extra });
const ycListing = (files, extra = {}) => JSON.stringify({ contents: Object.entries(files).map(([key, body]) => ({ key, size: String(Buffer.byteLength(body)), etag: `"${md5(body)}"` })), name: 'zvenfit-frontend', ...extra });

// Stand-ins for the two tools: they record every call and play a bucket from a
// directory. No network, no credentials.
const AWS_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$STUB_LOG"
if [ "$1 $2" = 's3 sync' ]; then
  case " $* " in *' --dryrun '*) echo "(dryrun) download: $3"; exit 0 ;; esac
  mkdir -p "$4" && cp -R "$STUB_BUCKET/." "$4/"
elif [ "$1 $2" = 's3api list-objects-v2' ]; then
  cat "$STUB_LISTINGS/first.json"
else
  exit 64
fi
`;
const YC_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$STUB_LOG"
if [ "$1 $2 $3" = 'storage s3 cp' ]; then
  case " $* " in *' --dryrun '*) echo "(dryrun) download: $5"; exit 0 ;; esac
  mkdir -p "$6" && cp -R "$STUB_BUCKET/." "$6"
elif [ "$1 $2 $3" = 'storage s3api list-objects' ]; then
  page=first
  if [ "$6" = '--continuation-token' ]; then page="$7"; fi
  cat "$STUB_LISTINGS/$page.json"
else
  exit 64
fi
`;

function sandbox(t, { bucket = BUCKET_FILES, listings }) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-bucket-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  write(path.join(directory, 'bucket'), bucket);
  write(path.join(directory, 'listings'), listings);
  write(path.join(directory, 'bin'), { aws: AWS_STUB, yc: YC_STUB });
  fs.chmodSync(path.join(directory, 'bin', 'aws'), 0o755);
  fs.chmodSync(path.join(directory, 'bin', 'yc'), 0o755);
  fs.writeFileSync(path.join(directory, 'calls.log'), '');
  const env = { ...process.env, PATH: `${path.join(directory, 'bin')}${path.delimiter}${process.env.PATH}`, STUB_LOG: path.join(directory, 'calls.log'), STUB_BUCKET: path.join(directory, 'bucket'), STUB_LISTINGS: path.join(directory, 'listings') };
  for (const name of ['SNAPSHOT_BUCKET', 'SNAPSHOT_TOOL', 'SNAPSHOT_ENDPOINT', 'AWS_REGION']) {
    delete env[name];
  }
  return {
    directory,
    target: path.join(directory, 'snapshots'),
    calls: () => fs.readFileSync(path.join(directory, 'calls.log'), 'utf8').split('\n').filter(Boolean),
    run: (args, extraEnv = {}) => spawnSync('bash', [SCRIPT, ...args], { env: { ...env, ...extraEnv }, encoding: 'utf8' }),
  };
}

function snapshotOf(target) {
  const names = fs.readdirSync(target);
  assert.equal(names.length, 1);
  assert.match(names[0], /^zvenfit-frontend-\d{8}T\d{6}Z$/);
  return path.join(target, names[0]);
}

function filesOf(directory, base = directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => (entry.isDirectory() ? filesOf(path.join(directory, entry.name), base) : [path.relative(base, path.join(directory, entry.name)).split(path.sep).join('/')]))
    .sort();
}

test('a listing page is read in the shape of either tool', () => {
  const expected = Object.entries(BUCKET_FILES).map(([key, body]) => ({ key, size: Buffer.byteLength(body), etag: md5(body) }));
  assert.deepEqual(parseListing(awsListing(BUCKET_FILES)), { objects: expected, truncated: false, nextToken: null });
  assert.deepEqual(parseListing(ycListing(BUCKET_FILES, { is_truncated: true, next_continuation_token: 'page-2' })), { objects: expected, truncated: true, nextToken: 'page-2' });
  assert.deepEqual(parseListing(awsListing({}, { IsTruncated: true, NextContinuationToken: 'abc' })), { objects: [], truncated: true, nextToken: 'abc' });
  assert.deepEqual(parseListing(''), { objects: [], truncated: false, nextToken: null });
  assert.deepEqual(parseListing('{"RequestCharged":null}'), { objects: [], truncated: false, nextToken: null });
  assert.throws(() => parseListing('[]'), /must be a JSON object/);
  assert.throws(() => parseListing('{"Contents":[{"Key":"a"}]}'), /needs a key and a size/);
});

test('the snapshot is held to the listing: every object, its size and its bytes, and nothing else', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-verify-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  write(directory, BUCKET_FILES);
  const page = files => parseListing(awsListing(files));

  assert.deepEqual(verifySnapshot(directory, [page(BUCKET_FILES)]), { objects: 3, bytes: Object.values(BUCKET_FILES).join('').length, problems: [] });
  // Two pages, a folder placeholder of the web console and a multipart ETag, which is not an MD5.
  const [first, ...rest] = Object.entries(BUCKET_FILES);
  const pages = [parseListing(ycListing(Object.fromEntries([first]), { next_continuation_token: 't' })), parseListing(JSON.stringify({ contents: [{ key: 'js/', size: 0 }, ...rest.map(([key, body]) => ({ key, size: body.length, etag: '"0123456789abcdef0123456789abcdef-2"' }))] }))];
  assert.deepEqual(verifySnapshot(directory, pages).problems, []);

  assert.deepEqual(verifySnapshot(directory, [page({ ...BUCKET_FILES, 'offer/index.html': 'x' })]).problems, ['offer/index.html: listed in the bucket, missing in the snapshot']);
  assert.deepEqual(verifySnapshot(directory, [page({ 'index.html': BUCKET_FILES['index.html'] })]).problems, ['_astro/site.abc.css: in the snapshot, not listed in the bucket', 'js/lead-config.js: in the snapshot, not listed in the bucket']);
  assert.deepEqual(verifySnapshot(directory, [page({ ...BUCKET_FILES, 'index.html': '<html>longer page</html>\n' })]).problems, ['index.html: 18 byte(s) in the snapshot, 25 in the bucket']);
  assert.deepEqual(verifySnapshot(directory, [page({ ...BUCKET_FILES, 'index.html': '<html>HOME</html>\n' })]).problems, ['index.html: the bytes differ from the object in the bucket (MD5 is not its ETag)']);
  assert.deepEqual(verifySnapshot(directory, [page(BUCKET_FILES), page(BUCKET_FILES)]).problems.length, 3);
  assert.deepEqual(verifySnapshot(directory, [parseListing(awsListing(BUCKET_FILES, { IsTruncated: true }))]).problems, ['the listing is incomplete: its last page says more objects follow']);
  assert.ok(verifySnapshot(directory, [parseListing('{"Contents":[{"Key":"js/","Size":5}]}')]).problems.includes('js/: a key that ends with a slash carries 5 byte(s) and cannot be stored as a file'));
});

test('with aws the bucket is synced into a new directory, listed and verified, and only read', t => {
  const box = sandbox(t, { listings: { 'first.json': awsListing(BUCKET_FILES) } });
  const result = box.run([box.target]);
  assert.equal(result.status, 0, result.stderr);
  const snapshot = snapshotOf(box.target);
  assert.deepEqual(filesOf(snapshot), ['listing-0001.json', 'objects/_astro/site.abc.css', 'objects/index.html', 'objects/js/lead-config.js']);
  assert.equal(fs.readFileSync(path.join(snapshot, 'objects', 'js', 'lead-config.js'), 'utf8'), BUCKET_FILES['js/lead-config.js']);
  assert.equal(fs.readFileSync(path.join(snapshot, 'listing-0001.json'), 'utf8'), awsListing(BUCKET_FILES));
  assert.deepEqual(box.calls(), [`s3 sync s3://zvenfit-frontend ${snapshot}/objects --endpoint-url https://storage.yandexcloud.net --region ru-central1 --no-progress`, 's3api list-objects-v2 --bucket zvenfit-frontend --endpoint-url https://storage.yandexcloud.net --region ru-central1 --output json']);
  assert.match(result.stdout, /verified 3 object\(s\), \d+ byte\(s\) against the listing/);
  assert.ok(result.stdout.trimEnd().endsWith(`snapshot-bucket: done, ${snapshot}`));
});

test('with yc the bucket is copied and the listing is followed page by page', t => {
  const [first, ...rest] = Object.entries(BUCKET_FILES);
  const box = sandbox(t, { listings: { 'first.json': ycListing(Object.fromEntries([first]), { is_truncated: true, next_continuation_token: 'second' }), 'second.json': ycListing(Object.fromEntries(rest)) } });
  const result = box.run([`${box.target}/`], { SNAPSHOT_TOOL: 'yc', SNAPSHOT_BUCKET: 'zvenfit-frontend-staging' });
  assert.equal(result.status, 0, result.stderr);
  const [name] = fs.readdirSync(box.target);
  assert.match(name, /^zvenfit-frontend-staging-\d{8}T\d{6}Z$/);
  const snapshot = path.join(box.target, name);
  assert.deepEqual(filesOf(snapshot), ['listing-0001.json', 'listing-0002.json', 'objects/_astro/site.abc.css', 'objects/index.html', 'objects/js/lead-config.js']);
  assert.deepEqual(box.calls(), [`storage s3 cp --recursive s3://zvenfit-frontend-staging/ ${snapshot}/objects/`, 'storage s3api list-objects --bucket zvenfit-frontend-staging --format json', 'storage s3api list-objects --bucket zvenfit-frontend-staging --continuation-token second --format json']);
  assert.match(result.stdout, /verified 3 object\(s\)/);
});

test('a copy that does not match the listing fails and names the objects', t => {
  const box = sandbox(t, { listings: { 'first.json': awsListing({ ...BUCKET_FILES, 'sitemap.xml': '<urlset/>' }) } });
  const result = box.run([box.target]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /snapshot-bucket: sitemap\.xml: listed in the bucket, missing in the snapshot\n/);
  assert.match(result.stderr, /the snapshot does not match the bucket \(1 problem\(s\)\)/);
  assert.doesNotMatch(result.stdout, /done/);
});

test('a dry run downloads nothing and creates nothing', t => {
  const box = sandbox(t, { listings: { 'first.json': awsListing(BUCKET_FILES) } });
  const result = box.run(['--dry-run', box.target]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(box.target), false);
  assert.equal(box.calls().length, 1);
  assert.match(box.calls()[0], /^s3 sync s3:\/\/zvenfit-frontend \S+\/objects .* --dryrun$/);
});

test('the target must lie outside the repository, and nothing is called before that is known', t => {
  const box = sandbox(t, { listings: { 'first.json': awsListing(BUCKET_FILES) } });
  const inside = path.join(ROOT, 'snapshot-bucket-test-target');
  const link = path.join(box.directory, 'link-into-the-repository');
  fs.symlinkSync(path.join(ROOT, 'scripts'), link);
  for (const target of [inside, ROOT, path.join(link, 'snapshots'), path.relative(process.cwd(), inside) || '.']) {
    const result = box.run([target]);
    assert.equal(result.status, 1, target);
    assert.match(result.stderr, /snapshot-bucket: the target is inside the repository \(.+\); choose a directory outside it/);
  }
  // path.join would fold the ".." away; the script must see it as typed.
  const dotted = box.run([`${box.directory}/new/../other`]);
  assert.equal(dotted.status, 1);
  assert.match(dotted.stderr, /must not contain "\.\."/);
  assert.equal(fs.existsSync(inside), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'snapshots')), false);
  assert.equal(fs.existsSync(path.join(box.directory, 'other')), false);
  assert.deepEqual(box.calls(), []);
});

test('wrong arguments, an unknown tool and a wrong bucket name are refused before any call', t => {
  const box = sandbox(t, { listings: { 'first.json': awsListing(BUCKET_FILES) } });
  assert.equal(box.run([]).status, 2);
  assert.equal(box.run([box.target, 'second']).status, 2);
  assert.equal(box.run([box.target, '--delete']).status, 2);
  assert.match(box.run([box.target], { SNAPSHOT_TOOL: 'rclone' }).stderr, /SNAPSHOT_TOOL must be aws or yc/);
  assert.match(box.run([box.target], { SNAPSHOT_BUCKET: 's3://zvenfit-frontend' }).stderr, /SNAPSHOT_BUCKET is not a bucket name/);
  assert.equal(fs.existsSync(box.target), false);
  assert.deepEqual(box.calls(), []);
});

// The script may read the bucket and nothing else: no upload, no removal, no --delete.
test('the script contains no command that writes to a bucket or deletes from it', () => {
  const source = fs
    .readFileSync(SCRIPT, 'utf8')
    .split('\n')
    .filter(line => !line.trimStart().startsWith('#'))
    .join('\n');
  const commands = [...source.matchAll(/\b(?:aws|yc storage) (s3api|s3) ([a-z0-9-]+)/g)].map(match => `${match[1]} ${match[2]}`).sort();
  assert.deepEqual(commands, ['s3 cp', 's3 sync', 's3api list-objects', 's3api list-objects', 's3api list-objects-v2']);
  assert.doesNotMatch(source, /--delete|\bs3 (?:rm|mv)\b|put-object|delete-object/);
  // Both copies go from the bucket to the local directory, never the other way.
  assert.match(source, /aws s3 sync "s3:\/\/\$\{BUCKET\}" "\$\{DESTINATION\}\/objects"/);
  assert.match(source, /yc storage s3 cp --recursive "s3:\/\/\$\{BUCKET\}\/" "\$\{DESTINATION\}\/objects\/"/);
});
