'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const {
  REQUIRED_FILES,
  SOURCES_BY_PROFILE,
  astroPageToRoute,
  expectedRoutesFromAstro,
  expectedRoutesFromPublic,
  readProfile,
  routeToUrl,
  verifyDist,
} = require('../check-routes.cjs');

const SITE_URL = 'https://example.test';
const PAGES = ['index.html', '404.html', 'privacy/index.html', 'trenery/trener-a/index.html'];

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function sitemapFor(pages) {
  const urls = pages
    .filter(page => page !== '404.html')
    .map(page => `<url><loc>${routeToUrl(SITE_URL, page)}</loc></url>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset>${urls}</urlset>`;
}

function fixture({ pages = PAGES, distPages = pages, sitemapPages = pages, requiredFiles = REQUIRED_FILES, html } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-routes-'));
  const publicDir = path.join(root, 'public');
  const distDir = path.join(root, 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  for (const page of pages) {
    writeFile(publicDir, page, '<html></html>');
  }
  for (const page of distPages) {
    writeFile(distDir, page, html || '<html><script src="/js/schedule.js?v=1"></script><link href="/css/site.min.css?v=1"></html>');
  }
  writeFile(distDir, 'js/schedule.js', '');
  writeFile(distDir, 'css/site.min.css', '');
  for (const file of requiredFiles) {
    writeFile(distDir, file, file === 'sitemap.xml' ? sitemapFor(sitemapPages) : '');
  }

  return { root, publicDir, distDir };
}

function check(options) {
  const { publicDir, distDir } = fixture(options);
  return verifyDist({ distDir, expectedRoutes: expectedRoutesFromPublic(publicDir), siteUrl: SITE_URL });
}

test('a complete build passes with route, sitemap and reference counts', () => {
  const result = check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.stats, { routes: 4, indexable: 3, references: 8 });
});

test('an empty dist is refused', () => {
  const { publicDir, distDir } = fixture();
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir);
  const result = verifyDist({ distDir, expectedRoutes: expectedRoutesFromPublic(publicDir), siteUrl: SITE_URL });
  assert.deepEqual(result.errors, ['dist is empty']);
});

test('a missing route is refused', () => {
  const result = check({ distPages: PAGES.filter(page => page !== 'privacy/index.html') });
  assert.ok(result.errors.includes('missing route privacy/index.html'), result.errors.join('; '));
});

test('a route replaced by another page with the same file count is refused', () => {
  const result = check({ distPages: [...PAGES.filter(page => page !== 'privacy/index.html'), 'offer/index.html'] });
  assert.ok(result.errors.includes('missing route privacy/index.html'), result.errors.join('; '));
  assert.ok(result.errors.includes('unexpected route offer/index.html'), result.errors.join('; '));
});

test('sitemap must list exactly the indexable routes', () => {
  const result = check({ sitemapPages: PAGES.filter(page => page !== 'privacy/index.html') });
  assert.ok(result.errors.includes(`sitemap.xml lacks ${SITE_URL}/privacy/`), result.errors.join('; '));

  const extra = check({ sitemapPages: [...PAGES, 'ghost/index.html'] });
  assert.ok(extra.errors.includes(`sitemap.xml lists ${SITE_URL}/ghost/ without a page`), extra.errors.join('; '));
});

test('every runtime config and crawl file must exist', () => {
  const result = check({ requiredFiles: REQUIRED_FILES.filter(file => file !== 'js/traffic-config.js') });
  assert.ok(result.errors.includes('missing required file js/traffic-config.js'), result.errors.join('; '));
});

test('a local script or stylesheet referenced by a page must exist in dist', () => {
  const result = check({ html: '<html><script src="/js/missing.js?v=1"></script></html>' });
  assert.ok(result.errors.includes('index.html references /js/missing.js, which is not in dist'), result.errors.join('; '));
});

test('404 is a route but never an indexable URL', () => {
  assert.equal(routeToUrl(SITE_URL, 'index.html'), `${SITE_URL}/`);
  assert.equal(routeToUrl(SITE_URL, 'privacy/index.html'), `${SITE_URL}/privacy/`);
  assert.equal(routeToUrl(SITE_URL, '404.html'), `${SITE_URL}/404.html`);
  const result = check({ sitemapPages: PAGES.filter(page => page !== '404.html') });
  assert.deepEqual(result.errors, []);
});

test('the deploy profile selects the route source and matches the repository tree', () => {
  const profile = readProfile();
  assert.equal(SOURCES_BY_PROFILE[profile], fs.existsSync(path.join(__dirname, '..', '..', 'src', 'pages')) ? 'astro' : 'public');
  assert.equal(profile, 'a');
});

test('Astro pages map to directory routes and private or dynamic files are skipped', () => {
  assert.equal(astroPageToRoute('index.astro'), 'index.html');
  assert.equal(astroPageToRoute('404.astro'), '404.html');
  assert.equal(astroPageToRoute('offer/index.astro'), 'offer/index.html');
  assert.equal(astroPageToRoute('promos/apps.astro'), 'promos/apps/index.html');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-routes-astro-'));
  for (const file of ['index.astro', '404.astro', 'offer/index.astro', 'trenery/index.astro', 'trenery/[slug].astro', '_drafts/new.astro', 'promos/_partial.astro']) {
    writeFile(path.join(root, 'src/pages'), file, '---\n---\n<html></html>');
  }
  writeFile(path.join(root, 'src/content'), 'trainers/trener-a.json', '{}');
  writeFile(path.join(root, 'src/content'), 'trainers/trener-b.json', '{}');
  assert.deepEqual(expectedRoutesFromAstro(path.join(root, 'src/pages'), path.join(root, 'src/content')), [
    '404.html',
    'index.html',
    'offer/index.html',
    'trenery/index.html',
    'trenery/trener-a/index.html',
    'trenery/trener-b/index.html',
  ]);
  assert.throws(() => expectedRoutesFromAstro(path.join(root, 'nowhere'), path.join(root, 'nowhere-either')), /no Astro pages/);
});

test('the full profile requires a 404 route while the partial profile does not', () => {
  const pages = ['offer/index.html', 'privacy/index.html'];
  const { distDir } = fixture({ pages, distPages: pages, sitemapPages: pages });
  const partial = verifyDist({ distDir, expectedRoutes: pages, siteUrl: SITE_URL, requires404: false });
  assert.deepEqual(partial.errors, []);
  const full = verifyDist({ distDir, expectedRoutes: pages, siteUrl: SITE_URL });
  assert.deepEqual(full.errors, ['sources define no 404.html route']);
});

test('hashed Astro assets referenced by a page must exist in dist', () => {
  const result = check({ html: '<html><script src="/_astro/lead-form.DzJub9Ws.js" defer></script></html>' });
  assert.ok(result.errors.includes('index.html references /_astro/lead-form.DzJub9Ws.js, which is not in dist'), result.errors.join('; '));
});
