'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  BASE_PHOTO_TRAINERS,
  VENDOR_LICENCES,
  analyzeTrainerPage,
  analyzeWebflowPage,
  checkBuild,
  detectMode,
  publicFilesShadowingRoutes,
} = require('../check-build.cjs');
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

function distPage({ beacon = true, analytics = true, webflow = 'https://storage.yandexcloud.net/zvenfit/v2/js/webflow.js?v=ci', configQuery = '', attributes = '', head = '', body = '<p id="a">x</p>' } = {}) {
  const counters = analytics
    ? '<script>https://www.googletagmanager.com/gtm.js</script><script>https://top-fwz1.mail.ru/js/code.js</script><script>https://mc.yandex.ru/metrika/tag.js</script>'
    : '';
  const tail = beacon ? `<script src="/js/traffic-config.js${configQuery}" defer></script><script src="/_astro/traffic-beacon.DgQiCINO.js" defer></script>` : '';
  return `<!DOCTYPE html><html lang="ru" data-wf-page="69ae68a15d10e15990081f0d"${attributes}><head>${counters}${head}<script src="/_astro/utm-attribution.DdMN3-Dg.js" defer></script><script src="/_astro/analytics.Ab123456.js" data-analytics-timer="true" defer></script></head><body>${body}<script src="${webflow}" type="text/javascript" defer></script>${tail}</body></html>`;
}

// The smallest site the build contract accepts: the pages its full-site checks
// read, each with the markup they look for, and two pages without any.
function sitePages({ analytics = true } = {}) {
  const page = options => distPage({ analytics, ...options });
  const cta = '<a href="/forma-dlya-zayavki/">записаться</a>';
  return {
    'index.html': page({ body: '<script type="application/ld+json">{"logo":"https://zvenfit.ru/images/zvenfit-logo.svg"}</script>' }),
    'forma-dlya-zayavki/index.html': page({ body: '<form method="post"><select id="service"></select><div role="alert" aria-live="assertive"></div></form>' }),
    'klubnaya-karta/index.html': page({
      head: '<link rel="canonical" href="https://zvenfit.ru/klubnaya-karta/"><link href="/_astro/klubnaya-karta.v1.Ef56Gh78.css" rel="stylesheet" type="text/css">',
      body: `<main id="main-content" tabindex="-1">${cta.repeat(8)}<a href="#contacts">контакты</a><a href="#contacts">как добраться</a><div data-map-set="chekhova"></div></main><script src="/_astro/yandex-map.5Ve8yguv.js" defer></script>`,
    }),
    'trenazhernyj-zal/index.html': page({ body: '<h3 class="text-block">Самостоятельно</h3><a href="/klubnaya-karta/">клубная карта</a>' }),
    'gruppovye-trenirovki/index.html': page({ attributes: ' data-zvenfit-page="group-fitness"' }),
    'trenazhernyj-zal/mini-gruppy/index.html': page({ attributes: ' data-zvenfit-page="mini-groups"' }),
    'offer/index.html': page(),
    'privacy/index.html': page(),
  };
}

const SITE = sitePages();

function without(pages, ...routes) {
  return Object.fromEntries(Object.entries(pages).filter(([route]) => !routes.includes(route)));
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

// Every problem the build contract reports for the fixture, so a test can show
// that one broken thing yields exactly its own message.
function problems(pages, { sources, ...options } = {}) {
  try {
    checkBuild({ dist: fixture({ pages, ...options }), sources });
  } catch (error) {
    return error.message.split('\n- ').slice(1);
  }
  return [];
}

test('a complete build passes in production mode and detects staging from robots.txt', () => {
  assert.deepEqual(checkBuild({ dist: fixture({ pages: SITE }) }), { mode: 'production', pages: 8 });
  const stagingDist = fixture({ pages: sitePages({ analytics: false }), robots: 'User-agent: *\nDisallow: /\n' });
  assert.equal(detectMode(stagingDist), 'staging');
  assert.deepEqual(checkBuild({ dist: stagingDist }), { mode: 'staging', pages: 8 });
});

test('there is no partial build: an empty dist, a missing home page and a missing page of the full-site checks are refused', () => {
  assert.throws(() => checkBuild({ dist: fixture({ pages: {} }) }), /^Error: check-build: dist has no HTML pages$/);
  assert.throws(() => checkBuild({ dist: fixture({ pages: without(SITE, 'index.html') }) }), /^Error: check-build: dist\/index\.html is missing$/);
  assert.deepEqual(problems(without(SITE, 'forma-dlya-zayavki/index.html', 'trenazhernyj-zal/mini-gruppy/index.html')), [
    'full-site checks need forma-dlya-zayavki/index.html, trenazhernyj-zal/mini-gruppy/index.html',
  ]);
  // The three legal pages were a complete build for the partial profile of stage A1.
  const legal = { 'offer/index.html': distPage(), 'privacy/index.html': distPage(), 'payment-policy/index.html': distPage() };
  assert.throws(() => checkBuild({ dist: fixture({ pages: legal }) }), /dist\/index\.html is missing/);
});

test('missing analytics, versioned configs, local webflow and a reporting 404 fail the build contract', () => {
  assert.deepEqual(problems({ ...SITE, 'offer/index.html': distPage({ analytics: false }) }), [
    'offer/index.html is missing Yandex Metrika in a production build',
    'offer/index.html is missing Top.Mail.Ru in a production build',
    'offer/index.html is missing Google Tag Manager in a production build',
  ]);
  assert.deepEqual(problems({ ...SITE, 'privacy/index.html': distPage({ configQuery: '?v=1' }) }), [
    'privacy/index.html is missing the technical traffic config and beacon',
    'privacy/index.html versions a runtime config with ?v=; configs are served with no-cache',
  ]);
  assert.deepEqual(problems({ ...SITE, 'privacy/index.html': distPage({ webflow: '/js/webflow.js' }) }), [
    'privacy/index.html still references local webflow.js',
    'privacy/index.html is missing the versioned CDN webflow.js',
  ]);
  assert.deepEqual(problems({ ...SITE, 'offer/index.html': distPage({ beacon: false }) }), ['offer/index.html is missing the technical traffic config and beacon']);
  assert.deepEqual(problems({ ...SITE, '404.html': distPage() }), ['404 page must not emit technical page views', '404.html must have 0 hashed analytics event loader(s)']);
  // The 404 page of a real build has neither the beacon nor the event loader.
  const notFound = distPage({ beacon: false }).replace('<script src="/_astro/analytics.Ab123456.js" data-analytics-timer="true" defer></script>', '');
  assert.deepEqual(problems({ ...SITE, '404.html': notFound }), []);
});

test('rejects a missing, duplicated or non-deferred analytics event loader', () => {
  const script = '<script src="/_astro/analytics.Ab123456.js" data-analytics-timer="true" defer></script>';
  for (const replacement of ['', script + script]) {
    assert.deepEqual(problems({ ...SITE, 'offer/index.html': distPage().replace(script, replacement) }), ['offer/index.html must have 1 hashed analytics event loader(s)']);
  }
  assert.deepEqual(problems({ ...SITE, 'offer/index.html': distPage().replace(script, script.replace(' defer', '')) }), ['offer/index.html analytics event loader must be deferred in head']);
});

test('the built site stylesheet must be the legacy minification and no stylesheet may use range media queries', () => {
  const notMinified = 'zvenfit.webflow.Ab12Cd34.css must be the clean-css level 2 output of src/styles/zvenfit.webflow.css, as in the legacy build';
  const oldBrowsers = 'which Safari before 16.4 and Chrome before 104 ignore';
  assert.deepEqual(problems(SITE, { styles: {} }), ['expected exactly one built site stylesheet in _astro/, found 0']);
  assert.deepEqual(problems(SITE, { styles: { 'zvenfit.webflow.Ab12Cd34.css': SITE_CSS } }), [notMinified]);
  const ranged = BUILT_SITE_CSS.replace('(max-width:767px)', '(width<=767px)');
  assert.notEqual(ranged, BUILT_SITE_CSS);
  assert.deepEqual(problems(SITE, { styles: { 'zvenfit.webflow.Ab12Cd34.css': ranged } }), [
    notMinified,
    `_astro/zvenfit.webflow.Ab12Cd34.css uses media query range syntax (@media screen and (width<=767px)), ${oldBrowsers}`,
  ]);
  const pageScoped = { 'zvenfit.webflow.Ab12Cd34.css': BUILT_SITE_CSS, 'klubnaya-karta.v1.Ef56Gh78.css': '@media (width>=992px){.card{display:grid}}' };
  assert.deepEqual(problems(SITE, { styles: pageScoped }), [`_astro/klubnaya-karta.v1.Ef56Gh78.css uses media query range syntax (@media (width>=992px)), ${oldBrowsers}`]);
});

test('the licence text of the vendored code is served at /js/vendor/ with the source bytes', () => {
  assert.deepEqual(VENDOR_LICENCES, ['imask-7.6.1.LICENSE.txt']);
  for (const name of VENDOR_LICENCES) {
    assert.ok(fs.existsSync(path.join(VENDOR_DIR, name.replace(/\.LICENSE\.txt$/, '.min.js'))), `${name} has no vendored script next to it`);
  }
  assert.deepEqual(problems(SITE, { licences: () => null }), ['js/vendor/imask-7.6.1.LICENSE.txt is missing: the licence text of vendored code must be served with the site']);
  const trimmed = name => fs.readFileSync(path.join(VENDOR_DIR, name), 'utf8').trimEnd();
  assert.deepEqual(problems(SITE, { licences: trimmed }), ['js/vendor/imask-7.6.1.LICENSE.txt must carry the bytes of src/vendor/imask-7.6.1.LICENSE.txt']);
});

test('the full-site checks read the lead form, the club card, the gym page, the logo reference and the page markers', () => {
  const changed = (route, from, to) => {
    assert.ok(SITE[route].includes(from), `${route} has no ${from}`);
    return problems({ ...SITE, [route]: SITE[route].replace(from, to) });
  };
  assert.deepEqual(changed('forma-dlya-zayavki/index.html', 'method="post"', 'method="get"'), ['lead form must use method="post"']);
  assert.deepEqual(changed('forma-dlya-zayavki/index.html', '<select id="service">', '<select id="service" class="custom-select">'), ['lead form must use the native service select']);
  assert.deepEqual(changed('forma-dlya-zayavki/index.html', ' aria-live="assertive"', ''), ['lead form error feedback must be announced to assistive technology']);
  assert.deepEqual(changed('klubnaya-karta/index.html', '<link rel="canonical" href="https://zvenfit.ru/klubnaya-karta/">', ''), ['club card page canonical URL is missing']);
  assert.deepEqual(changed('klubnaya-karta/index.html', '/_astro/klubnaya-karta.v1.Ef56Gh78.css', '/css/klubnaya-karta.v1.css'), ['club card page-scoped stylesheet is missing its hashed asset']);
  assert.deepEqual(changed('klubnaya-karta/index.html', 'data-map-set="chekhova"', 'data-map-set="home"'), ['club card page map was not converted to the shared runtime map']);
  assert.deepEqual(changed('klubnaya-karta/index.html', '<a href="/forma-dlya-zayavki/">записаться</a>', ''), ['club card page exposes only 7 lead CTA(s)']);
  assert.deepEqual(changed('klubnaya-karta/index.html', ' tabindex="-1"', ''), ['club card skip-link target must accept keyboard focus']);
  assert.deepEqual(changed('klubnaya-karta/index.html', '<a href="#contacts">контакты</a>', '<a href="#contact">контакты</a>'), ['club card navigation must use the shared visible contacts anchor']);
  assert.deepEqual(problems(without(SITE, 'klubnaya-karta/index.html')), ['club card page is missing']);
  assert.deepEqual(changed('trenazhernyj-zal/index.html', 'href="/klubnaya-karta/"', 'href="/forma-dlya-zayavki/"'), ['gym self-training card must link to the club card page']);
  assert.deepEqual(changed('index.html', 'https://zvenfit.ru/images/zvenfit-logo.svg', 'https://zvenfit.ru/images/logo.png'), ['Organization JSON-LD does not reference the dedicated logo']);
  assert.deepEqual(changed('gruppovye-trenirovki/index.html', ' data-zvenfit-page="group-fitness"', ''), ['gruppovye-trenirovki/index.html must carry the semantic page marker group-fitness']);
  assert.deepEqual(changed('trenazhernyj-zal/mini-gruppy/index.html', 'mini-groups', 'gym'), ['trenazhernyj-zal/mini-gruppy/index.html must carry the semantic page marker mini-groups']);
});

function sourceTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-build-sources-'));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), '');
  }
  return { publicDir: path.join(root, 'public'), pagesDir: path.join(root, 'src/pages'), contentDir: path.join(root, 'src/content') };
}

const ROUTE_SOURCES = [
  'src/pages/index.astro',
  'src/pages/404.astro',
  'src/pages/offer/index.astro',
  'src/pages/trenery/[slug].astro',
  'src/pages/robots.txt.ts',
  'src/pages/js/lead-config.js.ts',
  'src/pages/_drafts/note.astro',
  'src/content/trainers/trener-a.json',
];

test('a file in public/ may not take the path of a page, a trainer page of the collection or an endpoint', () => {
  // Without public/, and with files that are nobody's route.
  assert.deepEqual(publicFilesShadowingRoutes(sourceTree(ROUTE_SOURCES)), []);
  const harmless = ['public/images/logo.svg', 'public/offer/terms.pdf', 'public/_drafts/note/index.html', 'public/trenery/[slug]/index.html', 'public/robots.txt.ts'];
  assert.deepEqual(publicFilesShadowingRoutes(sourceTree([...ROUTE_SOURCES, ...harmless])), []);
  const shadowing = ['public/404.html', 'public/index.html', 'public/js/lead-config.js', 'public/offer/index.html', 'public/robots.txt', 'public/trenery/trener-a/index.html'];
  assert.deepEqual(
    publicFilesShadowingRoutes(sourceTree([...ROUTE_SOURCES, ...harmless, ...shadowing])),
    shadowing.map(file => file.slice('public/'.length)),
  );
});

test('the build contract refuses a public file that shadows a route, and the committed public/ has none', () => {
  assert.deepEqual(publicFilesShadowingRoutes(), []);
  const sources = sourceTree([...ROUTE_SOURCES, 'public/offer/index.html', 'public/robots.txt']);
  assert.deepEqual(problems(SITE, { sources }), [
    'public/ holds a file with the path of a route, and Astro ships it instead of the route: offer/index.html, robots.txt',
  ]);
  assert.deepEqual(problems(SITE, { sources: sourceTree(ROUTE_SOURCES) }), []);
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
  const trainerPage = options => distPage({ body: trainerBody(options) });
  const broken = problems({ ...SITE, 'trenery/trener-new/index.html': trainerPage({ suffix: 'bbbbbbbb', photoClass: 'veronn' }) });
  // The id-by-id check replaces the coverage threshold on trainer routes instead of repeating it.
  assert.equal(broken.length, 3, broken.join('\n'));
  assert.match(broken[0], /^trenery\/trener-new\/index\.html: zvenfit\.webflow\.css has no rule for 6 of 6 w-node ids/);
  assert.match(broken[1], /^trenery\/trener-new\/index\.html: zvenfit\.webflow\.css has no \.photo_coach\.veronn rule/);
  assert.match(broken[2], /^trenery\/trener-new\/index\.html: zvenfit\.webflow\.css has no \.photo_coach_mini\.veronn rule/);
  assert.deepEqual(problems({ ...SITE, 'trenery/trener-veronika-voznaya/index.html': trainerPage() }), []);
  // The same markup on another route is not a trainer page: only the coverage threshold applies there.
  const elsewhere = problems({ ...SITE, 'promos/index.html': trainerPage({ suffix: 'bbbbbbbb', photoClass: 'veronn' }) });
  assert.equal(elsewhere.length, 1, elsewhere.join('\n'));
  assert.match(elsewhere[0], /^promos\/index\.html: Webflow CSS covers only 0\/6 w-node ids/);
});
