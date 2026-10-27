'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { analyzeWebflowPage, checkBuild, detectMode } = require('../check-build.cjs');
const { getProfile } = require('../lib/parity-profile.cjs');

function page({ pageId = '69b540f958c9c44d220bcf1a', ids = [] } = {}) {
  return `<html data-wf-page="${pageId}"><body>${ids.map(id => `<div id="${id}"></div>`).join('')}</body></html>`;
}

test('rejects synthetic Webflow page ids such as the former -mini suffix', () => {
  const result = analyzeWebflowPage({ cssSource: '', relativePath: 'trenazhernyj-zal/mini-gruppy/index.html', sourceHtml: page({ pageId: '69b540f958c9c44d220bcf1a-mini' }) });
  assert.match(result.errors.join('\n'), /24-character lowercase hex id/);
});

test('rejects pages whose generated w-node ids are mostly absent from Webflow CSS and duplicate ids', () => {
  const ids = Array.from({ length: 10 }, (_, index) => `w-node-card-${index}-220bcf1a`);
  const sparse = analyzeWebflowPage({ cssSource: ids.slice(0, 2).map(id => `#${id} { grid-area: auto; }`).join('\n'), relativePath: 'broken/index.html', sourceHtml: page({ ids }) });
  assert.match(sparse.errors.join('\n'), /covers only 2\/10 w-node ids/);
  const covered = analyzeWebflowPage({ cssSource: ids.slice(0, 9).map(id => `#${id} { grid-area: auto; }`).join('\n'), relativePath: 'valid/index.html', sourceHtml: page({ ids }) });
  assert.deepEqual(covered.errors, []);
  assert.equal(covered.coverage, 0.9);
  const duplicate = analyzeWebflowPage({ cssSource: `#${ids[0]} {}`, relativePath: 'duplicate/index.html', sourceHtml: page({ ids: [ids[0], ids[0]] }) });
  assert.match(duplicate.errors.join('\n'), /contains duplicate ids/);
});

function distPage({ beacon = true, analytics = true, webflow = 'https://storage.yandexcloud.net/zvenfit/v2/js/webflow.js?v=ci', configQuery = '' } = {}) {
  const head = analytics
    ? '<script>https://www.googletagmanager.com/gtm.js</script><script>https://top-fwz1.mail.ru/js/code.js</script><script>https://mc.yandex.ru/metrika/tag.js</script>'
    : '';
  const tail = beacon ? `<script src="/js/traffic-config.js${configQuery}" defer></script><script src="/_astro/traffic-beacon.DgQiCINO.js" defer></script>` : '';
  return `<!DOCTYPE html><html lang="ru" data-wf-page="69ae68a15d10e15990081f0d"><head>${head}<script src="/_astro/utm-attribution.DdMN3-Dg.js" defer></script></head><body><p id="a">x</p><script src="${webflow}" type="text/javascript" defer></script>${tail}</body></html>`;
}

function fixture({ pages, robots = 'User-agent: *\nAllow: /\n' }) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'check-build-'));
  for (const [route, html] of Object.entries(pages)) {
    fs.mkdirSync(path.dirname(path.join(dist, route)), { recursive: true });
    fs.writeFileSync(path.join(dist, route), html);
  }
  fs.mkdirSync(path.join(dist, 'js'));
  fs.writeFileSync(path.join(dist, 'js', 'maps-config.js'), 'window.ZVENFIT_MAPS = {"sets":{},"locations":{}};\n');
  for (const [file, name] of [['lead-config.js', 'LEAD'], ['schedule-config.js', 'SCHEDULE'], ['traffic-config.js', 'TRAFFIC']]) {
    fs.writeFileSync(path.join(dist, 'js', file), `window.ZVENFIT_${name}_API = 'https://example.invalid/${file}';\n`);
  }
  fs.mkdirSync(path.join(dist, 'images'));
  fs.writeFileSync(path.join(dist, 'images', 'zvenfit-logo.svg'), '<svg width="512" height="512"></svg>');
  fs.writeFileSync(path.join(dist, 'robots.txt'), robots);
  return dist;
}

const A1 = getProfile('a1');
const LEGAL = { 'offer/index.html': distPage(), 'privacy/index.html': distPage(), 'payment-policy/index.html': distPage() };

test('a complete partial build passes in production mode and detects staging from robots.txt', () => {
  const result = checkBuild({ dist: fixture({ pages: LEGAL }), profile: A1 });
  assert.deepEqual(result, { mode: 'production', pages: 3, profile: 'a1' });
  const stagingPages = Object.fromEntries(Object.keys(LEGAL).map(route => [route, distPage({ analytics: false })]));
  const stagingDist = fixture({ pages: stagingPages, robots: 'User-agent: *\nDisallow: /\n' });
  assert.equal(detectMode(stagingDist), 'staging');
  assert.equal(checkBuild({ dist: stagingDist, profile: A1 }).mode, 'staging');
});

test('the partial profile demands exactly its pages', () => {
  assert.throws(() => checkBuild({ dist: fixture({ pages: { 'offer/index.html': distPage() } }), profile: A1 }), /missing privacy\/index\.html, payment-policy\/index\.html/);
  assert.throws(() => checkBuild({ dist: fixture({ pages: { ...LEGAL, 'index.html': distPage() } }), profile: A1 }), /unexpected index\.html/);
});

test('missing analytics, versioned configs, local webflow and a reporting 404 fail the build contract', () => {
  const failing = { ...LEGAL, 'offer/index.html': distPage({ analytics: false }) };
  assert.throws(() => checkBuild({ dist: fixture({ pages: failing }), profile: A1 }), /offer\/index\.html is missing Yandex Metrika in a production build/);
  assert.throws(() => checkBuild({ dist: fixture({ pages: { ...LEGAL, 'privacy/index.html': distPage({ configQuery: '?v=1' }) } }), profile: A1 }), /versions a runtime config/);
  assert.throws(() => checkBuild({ dist: fixture({ pages: { ...LEGAL, 'privacy/index.html': distPage({ webflow: '/js/webflow.js' }) } }), profile: A1 }), /still references local webflow\.js/);
  assert.throws(() => checkBuild({ dist: fixture({ pages: { ...LEGAL, 'offer/index.html': distPage({ beacon: false }) } }), profile: A1 }), /missing the technical traffic config and beacon/);
  const full = { ...getProfile('a'), pages: null };
  assert.throws(() => checkBuild({ dist: fixture({ pages: { ...LEGAL, 'index.html': distPage(), '404.html': distPage() } }), profile: full }), /404 page must not emit technical page views/);
});
