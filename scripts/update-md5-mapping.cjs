#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAPPING_PATH = path.join(ROOT, 'meta', 'md5-complete-mapping.json');
const SCAN_DIRS = ['public', 'scripts', 'meta'];
const CDN_PREFIX = 'https://storage.yandexcloud.net/zvenfit/';
const URL_RE = /https:\/\/storage\.yandexcloud\.net\/zvenfit\/[^"')\s]+/g;

function collectRepoUrls() {
  const urls = new Set();

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(html|css|js|json|md)$/i.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const match of text.matchAll(URL_RE)) {
        urls.add(match[0]);
      }
    }
  }

  for (const dir of SCAN_DIRS) {
    walk(path.join(ROOT, dir));
  }

  return [...urls].sort();
}

function mappedUrls(mapping) {
  const urls = new Set();
  for (const entry of Object.values(mapping)) {
    for (const url of entry.cdn_urls || []) {
      urls.add(url);
    }
  }
  return urls;
}

async function fetchAsset(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

async function main() {
  const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
  const repoUrls = collectRepoUrls();
  const known = mappedUrls(mapping);
  const missing = repoUrls.filter((url) => !known.has(url));

  console.log(`Repo CDN URLs: ${repoUrls.length}`);
  console.log(`Already mapped: ${known.size}`);
  console.log(`To add: ${missing.length}`);

  if (!missing.length) {
    console.log('Mapping is up to date.');
    return;
  }

  for (const url of missing) {
    const buffer = await fetchAsset(url);
    const md5 = crypto.createHash('md5').update(buffer).digest('hex');
    const filename = path.basename(new URL(url).pathname);

    if (mapping[md5]) {
      if (!mapping[md5].cdn_urls.includes(url)) {
        mapping[md5].cdn_urls.push(url);
        mapping[md5].cdn_urls.sort();
      }
      if (mapping[md5].size == null) {
        mapping[md5].size = buffer.length;
      }
      console.log(`Merged ${filename} -> existing ${md5.slice(0, 8)}`);
      continue;
    }

    mapping[md5] = {
      cdn_urls: [url],
      local_files: [],
      size: buffer.length,
    };
    console.log(`Added ${filename} -> ${md5.slice(0, 8)} (${buffer.length} bytes)`);
  }

  const sorted = Object.fromEntries(
    Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b))
  );

  fs.writeFileSync(MAPPING_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Updated ${MAPPING_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
