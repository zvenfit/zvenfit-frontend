'use strict';

// Refreshes src/data/map-photos.json: organisation photos from Yandex Maps for
// every location in scripts/maps.config.json, falling back to the configured
// `locationPhotos` when the page cannot be fetched. The regular build never
// touches the network; it reads this snapshot (plan, section 5).
//
//   npm run maps:snapshot            # write the snapshot
//   npm run maps:snapshot -- --check # exit 1 when the snapshot would change

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MAPS_CONFIG_PATH = path.join(__dirname, 'maps.config.json');
const SNAPSHOT_PATH = path.join(ROOT, 'src', 'data', 'map-photos.json');
const ALTAY_URL_RE = /https:\/\/avatars\.mds\.yandex\.net\/get-altay\/[^"'\\)\s]+/g;
const MAX_PHOTOS = 12;

function normalizeAltayPhotoUrl(url) {
  return String(url || '')
    .replace(/\)$/, '')
    .replace(/\{size\}/gi, 'L')
    .replace(/\/%s$/i, '/L')
    .replace(/\/(S|M|L[^/]*|XXL[^/]*|h\d+|orig)\)?$/i, '/L');
}

function fetchOrganizationPhotos(orgId, fetchPage = curlPage) {
  if (!orgId) {
    return [];
  }
  const page = fetchPage(`https://yandex.ru/maps/org/zvenfit/${orgId}/`);
  if (!page) {
    return [];
  }
  const photos = [];
  const seen = new Set();
  for (const match of page.matchAll(ALTAY_URL_RE)) {
    const normalized = normalizeAltayPhotoUrl(match[0]);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      photos.push(normalized);
    }
    if (photos.length >= MAX_PHOTOS) {
      break;
    }
  }
  return photos;
}

function curlPage(url) {
  const result = spawnSync('curl', ['-sSL', url, '-A', 'Mozilla/5.0', '-m', '25'], {
    encoding: 'utf8',
    maxBuffer: 15 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : '';
}

function buildSnapshot(mapsConfig, fetchPage = curlPage, log = console.log) {
  const snapshot = {};
  for (const key of Object.keys(mapsConfig.locationPhotos || {})) {
    const fetched = fetchOrganizationPhotos(mapsConfig.locationOrganizations?.[key], fetchPage);
    snapshot[key] = fetched.length ? fetched : mapsConfig.locationPhotos[key];
    log(`snapshot-map-photos: ${key}: ${fetched.length ? `${fetched.length} photo(s) from Yandex Maps` : 'fallback photos from maps.config.json'}`);
  }
  return snapshot;
}

function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const mapsConfig = JSON.parse(fs.readFileSync(MAPS_CONFIG_PATH, 'utf8'));
  const next = `${JSON.stringify(buildSnapshot(mapsConfig), null, 2)}\n`;
  const current = fs.existsSync(SNAPSHOT_PATH) ? fs.readFileSync(SNAPSHOT_PATH, 'utf8') : '';
  if (next === current) {
    console.log('snapshot-map-photos: src/data/map-photos.json is up to date');
    return;
  }
  if (check) {
    throw new Error('snapshot-map-photos: src/data/map-photos.json is outdated; run npm run maps:snapshot');
  }
  fs.writeFileSync(SNAPSHOT_PATH, next, 'utf8');
  console.log('snapshot-map-photos: wrote src/data/map-photos.json');
}

module.exports = { buildSnapshot, fetchOrganizationPhotos, normalizeAltayPhotoUrl };

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
