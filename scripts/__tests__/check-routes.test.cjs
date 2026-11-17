'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const {
  REQUIRED_FILES,
  SOURCES_BY_PROFILE,
  astroPageToRoute,
  endpointFilesFromAstro,
  expectedRoutesFromAstro,
  readProfile,
  routeToUrl,
  verifyDist,
} = require('../check-routes.cjs');

const CLI = path.join(__dirname, '..', 'check-routes.cjs');
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

// The source of a route: an entry of the trainer collection for a trainer
// page, a page file for any other.
function writeSource(root, route) {
  const trainer = route.match(/^trenery\/(trener-[^/]+)\/index\.html$/);
  if (trainer) {
    writeFile(path.join(root, 'src/content'), `trainers/${trainer[1]}.json`, '{}');
  } else {
    writeFile(path.join(root, 'src/pages'), route.replace(/\.html$/, '.astro'), '---\n---\n<html></html>');
  }
}

function sourceRoutes(root) {
  return expectedRoutesFromAstro(path.join(root, 'src/pages'), path.join(root, 'src/content'));
}

function fixture({ pages = PAGES, distPages = pages, sitemapPages = pages, requiredFiles = REQUIRED_FILES, html } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-routes-'));
  const distDir = path.join(root, 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  for (const page of pages) {
    writeSource(root, page);
  }
  for (const page of distPages) {
    writeFile(distDir, page, html || '<html><script src="/js/schedule.js?v=1"></script><link href="/css/site.min.css?v=1"></html>');
  }
  writeFile(distDir, 'js/schedule.js', '');
  writeFile(distDir, 'css/site.min.css', '');
  for (const file of requiredFiles) {
    writeFile(distDir, file, file === 'sitemap.xml' ? sitemapFor(sitemapPages) : '');
  }

  return { root, distDir };
}

function check(options) {
  const { root, distDir } = fixture(options);
  return verifyDist({ distDir, expectedRoutes: sourceRoutes(root), siteUrl: SITE_URL });
}

test('a complete build passes with route, sitemap and reference counts', () => {
  const result = check();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.stats, { routes: 4, indexable: 3, references: 8 });
});

test('an empty dist is refused', () => {
  const { root, distDir } = fixture();
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir);
  const result = verifyDist({ distDir, expectedRoutes: sourceRoutes(root), siteUrl: SITE_URL });
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

test('the deploy profile is one of the Astro profiles: the legacy one is gone with its source', () => {
  const profile = readProfile();
  assert.equal(profile, 'a');
  assert.deepEqual(SOURCES_BY_PROFILE, { a: 'astro', b: 'astro' });

  const config = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'check-routes-profile-')), 'deploy.config.json');
  fs.writeFileSync(config, '{"profile":"b"}');
  assert.equal(readProfile(config), 'b');
  for (const retired of ['legacy', 'a1']) {
    fs.writeFileSync(config, JSON.stringify({ profile: retired }));
    assert.throws(() => readProfile(config), new RegExp(`unknown deploy profile "${retired}"`));
  }
});

test('the command line reads the routes from the Astro sources and refuses any other source', () => {
  const { root, distDir } = fixture();
  const run = (...args) =>
    spawnSync(process.execPath, [CLI, '--dist', distDir, '--pages', path.join(root, 'src/pages'), '--content', path.join(root, 'src/content'), '--site', SITE_URL, ...args], {
      encoding: 'utf8',
    });

  const byProfile = run();
  assert.equal(byProfile.status, 0, byProfile.stderr);
  assert.match(byProfile.stdout, /4 HTML route\(s\), 3 in sitemap, 8 local reference\(s\) verified .* \(source astro, profile a\)/);
  assert.equal(run('--source', 'astro').status, 0);

  const legacy = run('--source', 'public');
  assert.equal(legacy.status, 1);
  assert.match(legacy.stderr, /check-routes: unknown source "public"/);
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

test('endpoints are built at their own path without the script extension', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-routes-endpoints-'));
  for (const file of ['index.astro', 'robots.txt.ts', 'sitemap.xml.ts', 'js/lead-config.js.ts', 'js/vendor/licence.txt.js', 'env.d.ts', '_lib/helper.ts', 'feeds/[name].xml.ts']) {
    writeFile(path.join(root, 'src/pages'), file, '');
  }
  assert.deepEqual(endpointFilesFromAstro(path.join(root, 'src/pages')), ['js/lead-config.js', 'js/vendor/licence.txt', 'robots.txt', 'sitemap.xml']);
  assert.deepEqual(endpointFilesFromAstro(path.join(root, 'nowhere')), []);
  // The endpoints of this repository are the files the deploy requires in dist, and the licence text.
  const endpoints = endpointFilesFromAstro(path.join(__dirname, '..', '..', 'src', 'pages'));
  assert.deepEqual(endpoints, [...REQUIRED_FILES, 'js/vendor/imask-7.6.1.LICENSE.txt'].sort());
});

test('the sources must define a 404 route: there is no partial route set', () => {
  const pages = ['offer/index.html', 'privacy/index.html'];
  const { distDir } = fixture({ pages, distPages: pages, sitemapPages: pages });
  assert.deepEqual(verifyDist({ distDir, expectedRoutes: pages, siteUrl: SITE_URL }).errors, ['sources define no 404.html route']);
  // An option that used to waive the 404 route for the partial profile of stage A1 changes nothing.
  assert.deepEqual(verifyDist({ distDir, expectedRoutes: pages, siteUrl: SITE_URL, requires404: false }).errors, ['sources define no 404.html route']);
});

test('hashed Astro assets referenced by a page must exist in dist', () => {
  const result = check({ html: '<html><script src="/_astro/lead-form.DzJub9Ws.js" defer></script></html>' });
  assert.ok(result.errors.includes('index.html references /_astro/lead-form.DzJub9Ws.js, which is not in dist'), result.errors.join('; '));
});
