'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { MAPS_CONFIG_PATH, SNAPSHOT_PATH, buildSnapshot, fetchOrganizationPhotos, normalizeAltayPhotoUrl } = require('../snapshot-map-photos.cjs');

const config = {
  locationOrganizations: { chekhova: '1', 'nahabinskoe-shosse': '2' },
  locationPhotos: { chekhova: ['https://storage.test/a.jpg'], 'nahabinskoe-shosse': ['https://storage.test/b.jpg'] },
};

test('photos found on the organisation page replace the fallback, unavailable pages keep it', () => {
  const pages = { 'https://yandex.ru/maps/org/zvenfit/1/': '"https://avatars.mds.yandex.net/get-altay/1/2/XXL" "https://avatars.mds.yandex.net/get-altay/1/2/XXL" "https://avatars.mds.yandex.net/get-altay/3/4/{size}"' };
  const snapshot = buildSnapshot(config, url => pages[url] || '', () => {});
  assert.deepEqual(snapshot, {
    chekhova: ['https://avatars.mds.yandex.net/get-altay/1/2/L', 'https://avatars.mds.yandex.net/get-altay/3/4/L'],
    'nahabinskoe-shosse': ['https://storage.test/b.jpg'],
  });
});

test('photo URLs are normalised to the large size and capped', () => {
  assert.equal(normalizeAltayPhotoUrl('https://avatars.mds.yandex.net/get-altay/1/2/orig)'), 'https://avatars.mds.yandex.net/get-altay/1/2/L');
  const many = Array.from({ length: 20 }, (_, index) => `"https://avatars.mds.yandex.net/get-altay/${index}/x/M"`).join(' ');
  assert.equal(fetchOrganizationPhotos('9', () => many).length, 12);
  assert.deepEqual(fetchOrganizationPhotos('', () => many), []);
});

test('the script reads the committed maps config and the snapshot covers its locations', () => {
  const root = path.resolve(__dirname, '../..');
  assert.equal(path.relative(root, MAPS_CONFIG_PATH), path.join('src', 'data', 'maps.config.json'));
  assert.equal(path.relative(root, SNAPSHOT_PATH), path.join('src', 'data', 'map-photos.json'));
  const config = JSON.parse(fs.readFileSync(MAPS_CONFIG_PATH, 'utf8'));
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  assert.deepEqual(Object.keys(snapshot).sort(), Object.keys(config.locationPhotos).sort());
  assert.deepEqual(Object.keys(config.locationOrganizations).sort(), Object.keys(config.locationPhotos).sort());
});
