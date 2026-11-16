'use strict';

// Listing and verification for scripts/snapshot-bucket.sh.
//
// The snapshot is taken with `aws` or with `yc`, and the two print the object
// listing in different shapes: `aws s3api list-objects-v2` writes one document
// with CamelCase fields (the CLI follows the pages itself), `yc storage s3api
// list-objects` writes one page per call. Field names are therefore matched
// without case and underscores: `Contents`/`contents`, `ETag`/`etag`,
// `NextContinuationToken`/`next_continuation_token`.
//
//   node scripts/lib/bucket-snapshot.cjs next-token <listing page>
//   node scripts/lib/bucket-snapshot.cjs verify <objects directory> <listing page>...

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function field(record, name) {
  if (!record || typeof record !== 'object') {
    return undefined;
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (key.replace(/_/g, '').toLowerCase() === wanted) {
      return value;
    }
  }
  return undefined;
}

// One page of a listing. An empty document is an empty bucket: `aws` prints
// nothing at all when a bucket has no objects.
function parseListing(text) {
  if (!text.trim()) {
    return { objects: [], truncated: false, nextToken: null };
  }
  const document = JSON.parse(text);
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('a listing page must be a JSON object');
  }
  const contents = field(document, 'contents') ?? [];
  if (!Array.isArray(contents)) {
    throw new Error('the object list of a listing page must be an array');
  }
  const objects = contents.map(entry => {
    const key = field(entry, 'key');
    const size = Number(field(entry, 'size'));
    if (typeof key !== 'string' || !key || !Number.isSafeInteger(size) || size < 0) {
      throw new Error('a listed object needs a key and a size');
    }
    return { key, size, etag: String(field(entry, 'etag') ?? '').replace(/"/g, '') };
  });
  const token = field(document, 'nextcontinuationtoken');
  const truncated = String(field(document, 'istruncated') ?? 'false') === 'true';
  return { objects, truncated, nextToken: typeof token === 'string' && token ? token : null };
}

function walk(directory, base = directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, base, files);
    } else {
      files.push(path.relative(base, fullPath).split(path.sep).join('/'));
    }
  }
  return files;
}

// Compares the downloaded tree with the listing: every listed object is on
// disk with its size and, where the ETag is a plain MD5 (not a multipart
// upload), with its bytes; nothing else is on disk. A key that ends with a
// slash is a folder placeholder of the web console and has no file. A listing
// without objects fails: an empty or mistyped bucket is not a snapshot.
function verifySnapshot(objectsDir, pages) {
  const problems = [];
  const listed = new Map();
  pages.forEach((page, index) => {
    if (index === pages.length - 1 && (page.truncated || page.nextToken)) {
      problems.push('the listing is incomplete: its last page says more objects follow');
    }
    for (const object of page.objects) {
      if (object.key.endsWith('/')) {
        if (object.size !== 0) {
          problems.push(
            `${object.key}: a key that ends with a slash carries ${object.size} byte(s) and cannot be stored as a file`,
          );
        }
        continue;
      }
      if (listed.has(object.key)) {
        problems.push(`${object.key}: listed twice`);
      }
      listed.set(object.key, object);
    }
  });

  if (!listed.size) {
    problems.push('the bucket lists no objects: there is nothing to keep');
  }

  const onDisk = new Set(fs.existsSync(objectsDir) ? walk(objectsDir) : []);
  let bytes = 0;
  for (const [key, object] of listed) {
    if (!onDisk.has(key)) {
      problems.push(`${key}: listed in the bucket, missing in the snapshot`);
      continue;
    }
    const content = fs.readFileSync(path.join(objectsDir, ...key.split('/')));
    bytes += content.length;
    if (content.length !== object.size) {
      problems.push(`${key}: ${content.length} byte(s) in the snapshot, ${object.size} in the bucket`);
    } else if (
      /^[0-9a-f]{32}$/.test(object.etag) &&
      crypto.createHash('md5').update(content).digest('hex') !== object.etag
    ) {
      problems.push(`${key}: the bytes differ from the object in the bucket (MD5 is not its ETag)`);
    }
  }
  for (const file of onDisk) {
    if (!listed.has(file)) {
      problems.push(`${file}: in the snapshot, not listed in the bucket`);
    }
  }
  return { objects: listed.size, bytes, problems: problems.sort() };
}

function main([command, ...args]) {
  if (command === 'next-token' && args.length === 1) {
    process.stdout.write(parseListing(fs.readFileSync(args[0], 'utf8')).nextToken || '');
    return 0;
  }
  if (command === 'verify' && args.length >= 2) {
    const [objectsDir, ...listings] = args;
    const result = verifySnapshot(
      objectsDir,
      listings.map(file => parseListing(fs.readFileSync(file, 'utf8'))),
    );
    if (result.problems.length) {
      for (const problem of result.problems) {
        console.error(`snapshot-bucket: ${problem}`);
      }
      console.error(`snapshot-bucket: the snapshot does not match the bucket (${result.problems.length} problem(s))`);
      return 1;
    }
    console.log(`snapshot-bucket: verified ${result.objects} object(s), ${result.bytes} byte(s) against the listing`);
    return 0;
  }
  console.error('usage: bucket-snapshot.cjs next-token <listing page> | verify <objects directory> <listing page>...');
  return 2;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseListing, verifySnapshot };
