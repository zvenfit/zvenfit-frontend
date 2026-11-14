'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { BASE_PHOTO_TRAINERS, VENDOR_LICENCES, analyzeTrainerPage, analyzeWebflowPage, checkBuild, detectMode } = require('../check-build.cjs');
const { getProfile } = require('../lib/parity-profile.cjs');
const { minifySiteCss } = require('../lib/site-css.cjs');

const SITE_CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'styles', 'zvenfit.webflow.css'), 'utf8');
const BUILT_SITE_CSS = minifySiteCss(SITE_CSS);
const VENDOR_DIR = path.join(__dirname, '..', '..', 'src', 'vendor');

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
  return `<!DOCTYPE html><html lang="ru" data-wf-page="69ae68a15d10e15990081f0d"><head>${head}<script src="/_astro/utm-attribution.DdMN3-Dg.js" defer></script><script src="/_astro/analytics.Ab123456.js" data-analytics-timer="true" defer></script></head><body><p id="a">x</p><script src="${webflow}" type="text/javascript" defer></script>${tail}</body></html>`;
}

function fixture({ pages, robots = 'User-agent: *\nAllow: /\n', styles = { 'zvenfit.webflow.Ab12Cd34.css': BUILT_SITE_CSS }, licences = name => fs.readFileSync(path.join(VENDOR_DIR, name)) }) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'check-build-'));
  fs.mkdirSync(path.join(dist, '_astro'));
  for (const [name, css] of Object.entries(styles)) {
    fs.writeFileSync(path.join(dist, '_astro', name), css);
  }
  for (const [route, html] of Object.entries(pages)) {
    fs.mkdirSync(path.dirname(path.join(dist, route)), { recursive: true });
    fs.writeFileSync(path.join(dist, route), html);
  }
  fs.mkdirSync(path.join(dist, 'js'));
  fs.writeFileSync(path.join(dist, 'js', 'maps-config.js'), 'window.ZVENFIT_MAPS = {"sets":{},"locations":{}};\n');
  for (const [file, name] of [['lead-config.js', 'LEAD'], ['schedule-config.js', 'SCHEDULE'], ['traffic-config.js', 'TRAFFIC']]) {
    fs.writeFileSync(path.join(dist, 'js', file), `window.ZVENFIT_${name}_API = 'https://example.invalid/${file}';\n`);
  }
  fs.mkdirSync(path.join(dist, 'js', 'vendor'));
  for (const name of VENDOR_LICENCES) {
    const bytes = licences(name);
    if (bytes !== null) {
      fs.writeFileSync(path.join(dist, 'js', 'vendor', name), bytes);
    }
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


test('rejects a missing, duplicated or non-deferred analytics event loader', () => {
  const script = '<script src="/_astro/analytics.Ab123456.js" data-analytics-timer="true" defer></script>';
  for (const replacement of ['', script + script, script.replace(' defer', '')]) {
    const failing = { ...LEGAL, 'offer/index.html': distPage().replace(script, replacement) };
    assert.throws(() => checkBuild({ dist: fixture({ pages: failing }), profile: A1 }), /analytics event loader/);
  }
});

test('the built site stylesheet must be the legacy minification and no stylesheet may use range media queries', () => {
  assert.throws(() => checkBuild({ dist: fixture({ pages: LEGAL, styles: {} }), profile: A1 }), /expected exactly one built site stylesheet in _astro\/, found 0/);
  assert.throws(() => checkBuild({ dist: fixture({ pages: LEGAL, styles: { 'zvenfit.webflow.Ab12Cd34.css': SITE_CSS } }), profile: A1 }), /must be the clean-css level 2 output/);
  const ranged = BUILT_SITE_CSS.replace('(max-width:767px)', '(width<=767px)');
  assert.notEqual(ranged, BUILT_SITE_CSS);
  assert.throws(() => checkBuild({ dist: fixture({ pages: LEGAL, styles: { 'zvenfit.webflow.Ab12Cd34.css': ranged } }), profile: A1 }), /must be the clean-css level 2 output[\s\S]*uses media query range syntax \(@media screen and \(width<=767px\)\)/);
  const pageScoped = { 'zvenfit.webflow.Ab12Cd34.css': BUILT_SITE_CSS, 'klubnaya-karta.v1.Ef56Gh78.css': '@media (width>=992px){.card{display:grid}}' };
  assert.throws(() => checkBuild({ dist: fixture({ pages: LEGAL, styles: pageScoped }), profile: A1 }), /_astro\/klubnaya-karta\.v1\.Ef56Gh78\.css uses media query range syntax/);
});

test('the licence text of the vendored code is served at /js/vendor/ with the source bytes', () => {
  assert.deepEqual(VENDOR_LICENCES, ['imask-7.6.1.LICENSE.txt']);
  for (const name of VENDOR_LICENCES) {
    assert.ok(fs.existsSync(path.join(VENDOR_DIR, name.replace(/\.LICENSE\.txt$/, '.min.js'))), `${name} has no vendored script next to it`);
  }
  assert.throws(() => checkBuild({ dist: fixture({ pages: LEGAL, licences: () => null }), profile: A1 }), /js\/vendor\/imask-7\.6\.1\.LICENSE\.txt is missing: the licence text of vendored code must be served with the site/);
  const trimmed = name => fs.readFileSync(path.join(VENDOR_DIR, name), 'utf8').trimEnd();
  assert.throws(() => checkBuild({ dist: fixture({ pages: LEGAL, licences: trimmed }), profile: A1 }), /js\/vendor\/imask-7\.6\.1\.LICENSE\.txt must carry the bytes of src\/vendor\/imask-7\.6\.1\.LICENSE\.txt/);
});

// The six node ids of the trainer template (src/lib/trainers.ts) with the page's own suffix.
const TRAINER_NODE_IDS = [
  'w-node-e11a7337-bde2-19aa-1b4b-c032af4154f2',
  'w-node-e11a7337-bde2-19aa-1b4b-c032af4154f5',
  'w-node-_3a3877c5-6cff-fbf8-e343-fd2c16920b2f',
  'w-node-_980bac73-2f9d-6ef2-62fc-7ca3af7945ed',
  'w-node-ef656b17-654a-462b-e243-174727480d7f',
  'w-node-_56762e99-7fb7-f4e5-d9ce-ad52ba56dcbf',
];

// trener-veronika-voznaya by default: wfPage suffix a2c8310c, photo class veron.
function trainerBody({ suffix = 'a2c8310c', photoClass = 'veron', extraIds = [] } = {}) {
  const modifier = photoClass ? ` ${photoClass}` : '';
  const ids = [...TRAINER_NODE_IDS.map(id => `${id}-${suffix}`), ...extraIds].map(id => `<div id="${id}"></div>`).join('');
  return `<div class="photo_coach${modifier}"></div>${ids}<div class="photo_coach_mini${modifier}"></div>`;
}

function trainerErrors(slug, options) {
  return analyzeTrainerPage({ cssSource: SITE_CSS, relativePath: `trenery/${slug}/index.html`, slug, sourceHtml: `<html><body>${trainerBody(options)}</body></html>` }).errors;
}

test('a trainer page passes when the stylesheet has rules for its w-node ids and both photo rules', () => {
  assert.deepEqual(trainerErrors('trener-veronika-voznaya'), []);
  // A new entry may reuse the wfPage of an existing page with the same layout.
  assert.deepEqual(trainerErrors('trener-new', { suffix: 'a2c8310c', photoClass: 'nat' }), []);
  // The six certificate cards of trener-natalya-shulepova carry ids of their own.
  const certificate = 'w-node-f394948c-d9ea-9703-61a4-183cf369dda6-bdc57907';
  assert.ok(SITE_CSS.includes(`#${certificate}`));
  assert.deepEqual(trainerErrors('trener-natalya-shulepova', { suffix: 'bdc57907', photoClass: 'nata', extraIds: [certificate] }), []);
});

test('a trainer page with a wfPage the stylesheet does not know fails id by id', () => {
  const unknown = trainerErrors('trener-new', { suffix: 'bbbbbbbb' });
  assert.equal(unknown.length, 1);
  assert.match(unknown[0], /^trenery\/trener-new\/index\.html: zvenfit\.webflow\.css has no rule for 6 of 6 w-node ids \(w-node-e11a7337-bde2-19aa-1b4b-c032af4154f2-bbbbbbbb, /);
  assert.match(unknown[0], /needs the wfPage of an existing page with the same layout or its own rules$/);
  // One id without a rule is enough: the 90% threshold of the exported pages does not apply.
  // The certificate card id exists in the stylesheet for another page only.
  const single = trainerErrors('trener-new', { extraIds: ['w-node-f394948c-d9ea-9703-61a4-183cf369dda6-a2c8310c'] });
  assert.match(single.join('\n'), /has no rule for 1 of 7 w-node ids \(w-node-f394948c-d9ea-9703-61a4-183cf369dda6-a2c8310c\)/);
});

test('a trainer page with a photo class the stylesheet does not know fails for both photo blocks', () => {
  const mistyped = trainerErrors('trener-new', { photoClass: 'veronn' });
  assert.equal(mistyped.length, 2);
  assert.match(mistyped[0], /has no \.photo_coach\.veronn rule with a background-image; the block shows the base photo, which belongs to trener-efim$/);
  assert.match(mistyped[1], /has no \.photo_coach_mini\.veronn rule with a background-image/);
  // `natal` is only the beginning of the existing class `nataly`.
  assert.ok(SITE_CSS.includes('.photo_coach.nataly {'));
  assert.equal(trainerErrors('trener-new', { photoClass: 'natal' }).length, 2);
  // A rule of another kind for the selector is not a photo.
  const withoutImage = analyzeTrainerPage({
    cssSource: '.photo_coach.pavel { background-position: 50% 30%; }\n.photo_coach_mini.pavel, .photo_coach_mini.other {\n  background-image: url(pavel.webp);\n}\n',
    relativePath: 'trenery/trener-pavel/index.html',
    slug: 'trener-pavel',
    sourceHtml: '<div class="photo_coach pavel"></div><div class="photo_coach_mini pavel"></div>',
  });
  assert.equal(withoutImage.errors.length, 1);
  assert.match(withoutImage.errors[0], /has no \.photo_coach\.pavel rule with a background-image/);
});

test('only the trainer whose photos are the base rules may go without a photo class', () => {
  assert.deepEqual(BASE_PHOTO_TRAINERS, ['trener-efim']);
  assert.match(SITE_CSS, /\n\.photo_coach \{\n {2}background-image: url\('[^']*\/coaches\/efim-4\.jpeg'\);/);
  assert.match(SITE_CSS, /\n\.photo_coach_mini \{\n {2}background-image: url\('[^']*\/coaches\/efim-3\.jpeg'\);/);
  assert.deepEqual(trainerErrors('trener-efim', { suffix: '2008aa7b', photoClass: '' }), []);
  const bare = trainerErrors('trener-new', { photoClass: '' });
  assert.equal(bare.length, 2);
  assert.match(bare[0], /\.photo_coach has no photo class and shows the base photo, which belongs to trener-efim; set photoClass in the entry$/);
  assert.match(bare[1], /\.photo_coach_mini has no photo class/);
});

test('the build contract runs the trainer check on trainer routes only', () => {
  const full = { ...getProfile('a'), pages: null };
  const trainerPage = body => distPage().replace('<p id="a">x</p>', body);
  const pages = { ...LEGAL, 'index.html': distPage() };
  const failure = dist => {
    try {
      checkBuild({ dist, profile: full });
    } catch (error) {
      return error.message;
    }
    return '';
  };
  const broken = failure(fixture({ pages: { ...pages, 'trenery/trener-new/index.html': trainerPage(trainerBody({ suffix: 'bbbbbbbb', photoClass: 'veronn' })) } }));
  assert.match(broken, /trenery\/trener-new\/index\.html: zvenfit\.webflow\.css has no rule for 6 of 6 w-node ids/);
  assert.match(broken, /trenery\/trener-new\/index\.html: zvenfit\.webflow\.css has no \.photo_coach\.veronn rule/);
  // The id-by-id check replaces the coverage threshold on trainer routes instead of repeating it.
  assert.doesNotMatch(broken, /trener-new\/index\.html: Webflow CSS covers only/);
  const valid = failure(fixture({ pages: { ...pages, 'trenery/trener-veronika-voznaya/index.html': trainerPage(trainerBody()) } }));
  assert.doesNotMatch(valid, /trenery\/trener-veronika-voznaya/);
  // The same markup on another route is not a trainer page: only the coverage threshold applies there.
  const elsewhere = failure(fixture({ pages: { ...pages, 'promos/index.html': trainerPage(trainerBody({ suffix: 'bbbbbbbb', photoClass: 'veronn' })) } }));
  assert.match(elsewhere, /promos\/index\.html: Webflow CSS covers only 0\/6 w-node ids/);
  assert.doesNotMatch(elsewhere, /photo_coach/);
});
