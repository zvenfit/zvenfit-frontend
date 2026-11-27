'use strict';

// Use the deployed checkout's fresh dist/. The control script comes from main.
// See knowledge-base/staging-runbook.md for the rollback window and recovery.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { parse } = require('parse5');

const DAY = 86_400_000;
const MIN_AGE_DAYS = 2; // Derivation in knowledge-base/cdn-runbook.md.
const BUCKETS = new Map([
  ['staging', 'zvenfit-frontend-staging'],
  ['production', 'zvenfit-frontend'],
]);

function options(env) {
  const environment = env.CLEANUP_ENVIRONMENT;
  const bucket = BUCKETS.get(environment);
  if (!bucket) throw new Error('Select staging or production');
  const execute = env.CLEANUP_EXECUTE ?? 'false';
  if (!['true', 'false'].includes(execute)) throw new Error('execute must be true or false');
  const prefix = env.CLEANUP_PREFIXES ?? '_astro/';
  if (prefix !== '_astro/') throw new Error('Only the _astro/ prefix is enabled before release B');
  const days = env.CLEANUP_MIN_AGE_DAYS ?? String(MIN_AGE_DAYS);
  if (!/^\d+$/.test(days) || !Number.isSafeInteger(Number(days) * DAY) || Number(days) < MIN_AGE_DAYS) {
    throw new Error(`min_age_days must be a whole number of at least ${MIN_AGE_DAYS}`);
  }
  return { environment, bucket, prefix, execute: execute === 'true', days: Number(days) };
}

function deployment(metadata) {
  const sha = metadata?.['deployed-sha'];
  const version = metadata?.['asset-version'];
  if (!/^[0-9a-f]{40}$/.test(sha ?? '') || !/^[1-9]\d*$/.test(version ?? '')) {
    throw new Error('Missing or invalid release metadata on live HTML. Check the last site deployment.');
  }
  return { sha, version };
}

function bucketClient(bucket, tempDir) {
  function aws(operation, ...args) {
    return execFileSync(
      'aws',
      [
        's3api',
        operation,
        '--bucket',
        bucket,
        '--endpoint-url',
        'https://storage.yandexcloud.net',
        '--region',
        'ru-central1',
        '--output',
        'json',
        '--no-cli-pager',
        ...args,
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
  }
  return {
    deployment() {
      return deployment(JSON.parse(aws('head-object', '--key', 'index.html')).Metadata);
    },
    list() {
      // aws paginates list-objects-v2 by default and combines Contents across pages.
      const result = JSON.parse(aws('list-objects-v2'));
      if (result.IsTruncated || result.NextContinuationToken || result.NextToken) {
        throw new Error('Incomplete bucket listing');
      }
      return result.Contents ?? [];
    },
    readHtml(key) {
      // The file name never comes from an object key.
      const file = path.join(tempDir, 'page');
      const result = JSON.parse(aws('get-object', '--key', key, file));
      return { release: deployment(result.Metadata), html: fs.readFileSync(file, 'utf8') };
    },
    remove(key) {
      aws('delete-object', '--key', key);
    },
  };
}

function addReferences(refs, html, route) {
  const base = new URL(route, 'https://site.invalid/');
  // URL attributes can contain spaces, parentheses, commas and HTML entities.
  function addUrl(value) {
    if (!URL.canParse(value, base)) return;
    const url = new URL(value, base);
    if (url.pathname.startsWith('/_astro/')) refs.add(decodeURIComponent(url.pathname.slice(1)));
  }
  function scan(value) {
    for (const match of value.matchAll(/\/_astro\//g)) {
      const tail = value.slice(match.index);
      const quote = value[match.index - 1];
      if (['"', "'", '`'].includes(quote)) {
        addUrl(tail.split(quote, 1)[0]);
      } else if (/url\(\s*$/i.test(value.slice(0, match.index))) {
        addUrl(tail.split(')', 1)[0]);
      } else {
        addUrl(tail.split(/[\s"'<>`]/, 1)[0]);
      }
    }
  }
  function visit(node) {
    for (const { name, value } of node.attrs ?? []) {
      if (['href', 'src', 'poster', 'data', 'action'].includes(name)) {
        addUrl(value);
      } else if (name === 'srcset' || name === 'imagesrcset') {
        // A candidate starts at the beginning or after a separator. Commas
        // inside its URL are legal; trailing commas delimit descriptorless URLs.
        for (const match of value.matchAll(/(?:^|(?<=,))\s*([^,\s]\S*)/g)) addUrl(match[1].replace(/,+$/, ''));
      } else {
        scan(value);
      }
    }
    if (node.nodeName === '#text') scan(node.value);
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(parse(html, { scriptingEnabled: false }));
}

function sameSet(expected, actual, label) {
  const missing = [...expected].filter(key => !actual.has(key));
  const extra = [...actual].filter(key => !expected.has(key));
  if (missing.length || extra.length) {
    throw new Error(
      `Live HTML differs from dist (${label}). Missing in bucket: ${JSON.stringify(missing)}. Extra in bucket: ${JSON.stringify(extra)}`,
    );
  }
}

function modified(object) {
  const timestamp = Date.parse(object.LastModified);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid LastModified for ${object.Key}`);
  return timestamp;
}

function selectCandidates(objects, files, prefix, cutoff) {
  return objects
    .filter(object => {
      const { Key: key, Size: size } = object;
      if (!key.startsWith(prefix) || files.has(key)) return false;
      // Skip directory markers and ambiguous path segments even inside the prefix.
      if (key.split('/').some(part => !part || part === '.' || part === '..')) return false;
      if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid Size for ${key}`);
      return modified(object) < cutoff;
    })
    .sort((a, b) => a.Key.localeCompare(b.Key, 'en'));
}

// Encode object keys for a Markdown table, including unusual S3 key characters.
function displayKey(key) {
  return '<code>' + key.replace(/[&<>|\x00-\x1f]/g, char => `&#${char.charCodeAt(0)};`) + '</code>';
}

function cleanup({ config, client, dist, sha, now = Date.now(), report }) {
  const release = client.deployment();
  if (sha !== release.sha) throw new Error('The checkout SHA differs from the deployed SHA');
  const files = new Set(
    fs
      .readdirSync(dist, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => path.relative(dist, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')),
  );
  const pages = new Set([...files].filter(key => key.endsWith('.html')));
  if (!pages.has('index.html')) throw new Error('Incomplete dist: missing index.html');

  const objects = client.list();
  const htmlObjects = objects.filter(object => object.Key.endsWith('.html'));
  sameSet(pages, new Set(htmlObjects.map(object => object.Key)), 'pages');
  const builtRefs = new Set();
  const liveRefs = new Set();
  let lastHtml = 0;
  for (const object of htmlObjects) {
    const page = client.readHtml(object.Key);
    if (page.release.sha !== sha || page.release.version !== release.version) {
      throw new Error(`Mixed deployment on ${object.Key}. Check the last site deployment.`);
    }
    lastHtml = Math.max(lastHtml, modified(object));
    addReferences(liveRefs, page.html, object.Key);
    addReferences(builtRefs, fs.readFileSync(path.join(dist, object.Key), 'utf8'), object.Key);
  }
  if (!builtRefs.size) throw new Error('No /_astro/ references in dist');
  sameSet(builtRefs, liveRefs, '/_astro/ references');
  for (const key of builtRefs) {
    if (!files.has(key)) throw new Error(`Incomplete dist: missing referenced asset ${key}`);
  }

  const cutoff = now - config.days * DAY;
  const candidates = selectCandidates(objects, files, config.prefix, cutoff);
  const bytes = candidates.reduce((sum, object) => sum + object.Size, 0);
  const windowEnds = lastHtml + MIN_AGE_DAYS * DAY;
  const summary = [
    '### Bucket asset cleanup',
    '',
    `Mode: **${config.execute ? 'execute' : 'dry-run'}** · ${config.environment} · \`${config.bucket}\``,
    `Deployed SHA: \`${sha}\` · asset version ${release.version}`,
    `Verified HTML pages: ${pages.size}. Distinct /_astro/ references: ${builtRefs.size}.`,
    `Candidates: **${candidates.length}** · Total bytes: **${bytes}**. Under \`${config.prefix}\`, absent from dist, LastModified strictly before ${new Date(cutoff).toISOString()} (${config.days} days).`,
    `Rollback window from latest HTML upload ends at ${new Date(windowEnds).toISOString()}.`,
    '',
    '| Key | LastModified (UTC) | Bytes |',
    '| --- | --- | ---: |',
    ...candidates.map(o => `| ${displayKey(o.Key)} | ${new Date(modified(o)).toISOString()} | ${o.Size} |`),
    '',
  ].join('\n');
  report(summary);
  if (config.execute) {
    if (now < windowEnds) throw new Error('Rollback window is still open');
    let deleted = 0;
    try {
      for (const object of candidates) {
        client.remove(object.Key);
        deleted++;
      }
    } finally {
      report(`Confirmed deletions: ${deleted} of ${candidates.length}.\n`);
    }
  }
  return candidates;
}

function run(argv, env) {
  const config = options(env);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-cleanup-'));
  try {
    const client = bucketClient(config.bucket, temp);
    if (argv.length === 1 && argv[0] === '--deployment') {
      const { sha, version } = client.deployment();
      console.log(`sha=${sha}\nversion=${version}`);
      return;
    }
    if (argv.length !== 1) throw new Error('Usage: cleanup-bucket-assets.cjs --deployment | <freshly built checkout>');
    const root = path.resolve(argv[0]);
    const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    cleanup({
      config,
      client,
      dist: path.join(root, 'dist'),
      sha,
      report: message => {
        console.log(message);
        if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, message + '\n');
      },
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

module.exports = { cleanup, options, selectCandidates, deployment };

if (require.main === module) {
  try {
    run(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
