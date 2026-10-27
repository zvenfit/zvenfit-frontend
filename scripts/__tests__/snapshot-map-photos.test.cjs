'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildSnapshot, fetchOrganizationPhotos, normalizeAltayPhotoUrl } = require('../snapshot-map-photos.cjs');

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
