'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const converter = require('../migrate/html-to-astro.cjs');
const blocks = require('../migrate/shared-blocks.cjs');

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'scripts/migrate/html-to-astro.cjs');

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

// A pull-request checkout is shallow, so the pinned legacy base SHA may be
// missing; HEAD carries the same frozen public/ tree until A2b removes it.
const legacyTracked = git('ls-files', 'public/sitemap.xml') !== '';
const HEAD = git('rev-parse', 'HEAD');

function walk(dir, files = [], base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files, base);
    } else {
      files.push(path.relative(base, fullPath).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

function legacyContext() {
  const show = file => git('show', `${HEAD}:${file}`);
  return {
    ref: HEAD,
    logo: converter.logoMarkup(),
    templates: blocks.footerTemplates({ classicSource: `${show('public/privacy/index.html')}\n`, gridSource: `${show('public/index.html')}\n` }),
    profiles: JSON.parse(show('scripts/structured-data.config.json')).trainers,
    sitemapEntries: new Map([
      ['https://zvenfit.ru/', { updated: '2026-05-13', changefreq: 'weekly', priority: '1.0' }],
      ['https://zvenfit.ru/offer/', { updated: '2026-05-13', changefreq: 'yearly', priority: '0.3' }],
      ['https://zvenfit.ru/klubnaya-karta/', { updated: '2026-08-25', changefreq: 'weekly', priority: '0.85' }],
      ['https://zvenfit.ru/gruppovye-trenirovki/', { updated: '2026-05-13', changefreq: 'weekly', priority: '0.9' }],
      ['https://zvenfit.ru/forma-dlya-zayavki/', { updated: '2026-05-13', changefreq: 'monthly', priority: '0.8' }],
      ['https://zvenfit.ru/trenery/trener-efim/', { updated: '2026-05-13', changefreq: 'monthly', priority: '0.65' }],
      ['https://zvenfit.ru/trenery/trener-natalya-shulepova/', { updated: '2026-07-26', changefreq: 'monthly', priority: '0.6' }],
    ]),
  };
}

test('entities decode, braces and Unicode spaces are escaped outside raw text', () => {
  assert.equal(converter.decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &nbsp;f &#x2014;'), 'a & b <c> "d" \'e\' \u00a0f —');
  assert.throws(() => converter.decodeEntities('&bogus;'), /unknown entity/);
  const html = '<p title="{x}">a {b} c\u00a0d\u2009e</p><script>if (a) { b(); } </script><style>a{b}</style>';
  assert.equal(
    converter.escapeBracesOutsideRawText(html),
    '<p title="&#123;x&#125;">a &#123;b&#125; c&nbsp;d&#x2009;e</p><script>if (a) { b(); } </script><style>a{b}</style>',
  );
});

test('every script becomes is:inline once and comments are emitted through set:html', () => {
  assert.equal(converter.markScriptsInline('<script src="/x.js" defer></script><script is:inline>1</script>'), '<script is:inline src="/x.js" defer></script><script is:inline>1</script>');
  assert.equal(converter.wrapComments('a<!-- x "y" -->b'), 'a<Fragment set:html={"<!-- x \\"y\\" -->"} />b');
});

test('inline SVGs get the specification spelling of viewBox and nothing else changes', () => {
  assert.equal(
    converter.normalizeSvgAttributes('<svg width="11" viewbox="0 0 11 18"><path d="viewbox=1"></path></svg><p viewbox="x">t</p>'),
    '<svg width="11" viewBox="0 0 11 18"><path d="viewbox=1"></path></svg><p viewbox="x">t</p>',
  );
});

test('import identifiers are derived from asset file names', () => {
  assert.equal(converter.identifierFor('scripts/accordion-horizontal.js'), 'accordionHorizontal');
  assert.equal(converter.identifierFor('vendor/imask-7.6.1.min.js'), 'imask761');
  assert.equal(converter.identifierFor('klubnaya-karta.v1.css'), 'klubnayaKartaV1');
  assert.equal(converter.identifierFor('scripts/schedule.js'), 'schedule');
});

test('GTM comment styles are recognised', () => {
  assert.equal(converter.detectGtmStyle(undefined), false);
  assert.equal(converter.detectGtmStyle('<!--  Google Tag Manager  -->\n  <script>x</script>'), 'commented');
  assert.equal(converter.detectGtmStyle('<!-- Google Tag Manager -->\n  <script>x</script>'), 'single-space');
  assert.equal(converter.detectGtmStyle('<script>x</script>'), 'bare');
});

test('the body GTM frame is matched in every comment style, with and without a title', () => {
  const frame = title => `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5532ZMV5" height="0" width="0" style="display:none;visibility:hidden"${title}></iframe></noscript>`;
  assert.equal(`<!--  Google Tag Manager (noscript)  -->\n  ${frame('')}\n  <!--  End Google Tag Manager (noscript)  -->`.replace(converter.GTM_BODY_RE, ''), '');
  const titled = `x<!-- Google Tag Manager (noscript) -->\n  ${frame(' title="Google Tag Manager"')}\n  <!-- End Google Tag Manager (noscript) -->y`.match(converter.GTM_BODY_RE);
  assert.equal(titled[4], 'Google Tag Manager');
  assert.equal(`a\n  ${frame('')}\n  b`.replace(converter.GTM_BODY_RE, '@'), 'a\n  @\n  b');
  assert.equal(converter.GTM_BODY_RE.test(frame('').replace('height="0"', 'height="1"')), false);
});

test('page paths, legacy files and output files map onto each other', () => {
  assert.equal(converter.pagePathFor('index.html'), '/');
  assert.equal(converter.pagePathFor('offer/index.html'), '/offer/');
  assert.equal(converter.pagePathFor('404.html'), '/404.html');
  assert.equal(converter.relativePathFor('/offer/'), 'offer/index.html');
  assert.equal(converter.relativePathFor('/404.html'), '404.html');
  assert.equal(converter.outputFileFor('/offer/', '/out'), '/out/offer/index.astro');
  assert.equal(converter.outputFileFor('/404.html', '/out'), '/out/404.astro');
  assert.equal(converter.outputFileFor('/', '/out'), '/out/index.astro');
});

const HEAD_LINES = [
  '  <meta charset="utf-8">',
  '  <title>Публичная оферта</title>',
  '  <meta name="description" content="D">',
  '  <meta content="width=device-width, initial-scale=1" name="viewport">',
  '  <link rel="canonical" href="https://zvenfit.ru/offer/">',
  '  <link href="https://storage.yandexcloud.net/zvenfit/v2/css/normalize.min.css" rel="stylesheet" type="text/css">',
  '  <link href="https://storage.yandexcloud.net/zvenfit/v2/css/webflow.min.css" rel="stylesheet" type="text/css">',
  '  <link href="/css/zvenfit.webflow.css" rel="stylesheet" type="text/css">',
  '  <link rel="preconnect" href="https://storage.yandexcloud.net">',
  '  <link href="https://fonts.bunny.net" rel="preconnect" crossorigin="anonymous">',
  '  <script type="text/javascript">!function(o,c){var n=c.documentElement,t=" w-mod-";n.className+=t+"js",("ontouchstart"in o||o.DocumentTouch&&c instanceof DocumentTouch)&&(n.className+=t+"touch")}(window,document);</script>',
  '  <link href="https://storage.yandexcloud.net/zvenfit/v2/images/favicon.png" rel="shortcut icon" type="image/x-icon">',
  '  <link href="https://storage.yandexcloud.net/zvenfit/v2/images/webclip.png" rel="apple-touch-icon"><!--  Google Tag Manager  -->',
  "  <script>(function(w,d,s,l,i){j.src='https://www.googletagmanager.com/gtm.js?id='+i})(window,document,'script','dataLayer','GTM-1');</script>",
  '  <!--  End Google Tag Manager  -->',
  '',
];

test('head parsing extracts the page meta and refuses unknown head lines', () => {
  const head = HEAD_LINES.join('\n');
  const parsed = converter.parseHead(`\n${head}`, '/offer/');
  assert.equal(parsed.title, 'Публичная оферта');
  assert.equal(parsed.canonical, 'https://zvenfit.ru/offer/');
  assert.equal(parsed.gtm, 'commented');
  assert.equal(parsed.robots, undefined);
  assert.deepEqual(parsed.headStart, []);
  const bare = converter.parseHead(`\n${head.replace('<!--  Google Tag Manager  -->', '').replace('\n  <!--  End Google Tag Manager  -->', '')}`, '/x/');
  assert.equal(bare.gtm, 'bare');
  assert.throws(() => converter.parseHead(`\n${head}  <meta name="x" content="y">\n`, '/offer/'), /unsupported head line/);
  assert.throws(() => converter.parseHead(`\n${head.replace('  <meta name="description" content="D">\n', '')}`, '/offer/'), /shared skeleton \(description\)/);
});

test('head parsing accepts the extra metas of the home page, a robots meta, page CSS and any indentation', () => {
  const lines = [...HEAD_LINES];
  lines.splice(1, 1, '  <meta http-equiv="X-Content-Type-Options" content="nosniff">', '  <meta name="referrer" content="strict-origin-when-cross-origin">', '      <title>Главная</title>');
  lines.splice(5, 0, '  <meta name="robots" content="noindex, follow">');
  lines.splice(11, 0, '  <link href="/css/klubnaya-karta.v1.css" rel="stylesheet" type="text/css">');
  const parsed = converter.parseHead(`\n${lines.join('\n')}`, '/');
  assert.equal(parsed.title, 'Главная');
  assert.equal(parsed.robots, 'noindex, follow');
  assert.equal(parsed.pageCss, '/css/klubnaya-karta.v1.css');
  assert.deepEqual(parsed.headStart, [
    { attribute: 'http-equiv', name: 'X-Content-Type-Options', content: 'nosniff' },
    { attribute: 'name', name: 'referrer', content: 'strict-origin-when-cross-origin' },
  ]);
});

test('a legal page at HEAD converts into a Base page with Menu, Footer and Analytics calls', t => {
  if (!legacyTracked) {
    t.skip('the legacy public/ tree is no longer tracked');
    return;
  }
  const result = converter.convertPage({ ...legacyContext(), relativePath: 'offer/index.html' });
  assert.equal(result.pagePath, '/offer/');
  assert.equal(result.webflowDefer, false);
  assert.equal(result.hasMaps, true);
  assert.match(result.output, /^---\nimport Analytics from '\.\.\/\.\.\/components\/Analytics\.astro';\n/);
  assert.match(result.output, /export const sitemap = \{ updated: '2026-05-13', changefreq: 'yearly', priority: '0\.3' \};/);
  assert.match(result.output, /<Base title="Публичная оферта" description="[^"]+" wfPage="69ae68a15d10e15990081f0d" wfSite="697f30b67cb029a39716bd07" webflowComments="[^"]+" hasMaps>/);
  assert.match(result.output, /<Menu variant="plain" secondary=\{\{"label":"вернуться назад","href":"#","dataBack":true,"block":1\}\} \/>/);
  assert.match(result.output, /<Footer location="chekhova" \/>/);
  assert.match(result.output, /<Fragment slot="scripts"><Analytics placement="body" gtm="commented" \/>\n {2}<script is:inline>/);
  const body = result.output.slice(result.output.indexOf('hasMaps>') + 'hasMaps>'.length);
  assert.doesNotMatch(body, /<!--/);
  assert.doesNotMatch(result.output, /map-widget/);
  assert.doesNotMatch(result.output, /\u00a0/);
  assert.doesNotMatch(result.output, /AppDownload/);
  assert.ok(result.output.endsWith('</Fragment></Base>\n'));
});

test('the home page gets the home menu, the grid footer and its extra head metas', t => {
  if (!legacyTracked) {
    t.skip('the legacy public/ tree is no longer tracked');
    return;
  }
  const { output } = converter.convertPage({ ...legacyContext(), relativePath: 'index.html' });
  assert.match(output, /import Base from '\.\.\/layouts\/Base\.astro';/);
  assert.match(output, /<meta slot="head-start" http-equiv="X-Content-Type-Options" content="nosniff" \/><meta slot="head-start" name="referrer" content="strict-origin-when-cross-origin" \/>/);
  assert.match(output, /<Menu variant="home" wNode=\{\{"call":"w-node-cb5099cb-a39d-b6a2-9dbf-597fb5bf5ba9-9716bd19","cta":"w-node-_7d41401a-7067-c94a-50a0-91074370b2db-9716bd19","contacts":"w-node-_3e4ebd6f-68d9-b921-883a-eec3495ae707-9716bd19"\}\} \/>/);
  assert.match(output, /<Footer withGrid \/>/);
  assert.doesNotMatch(output, /footer-grid|section-4|menu1/);
});

test('a service page keeps its own scripts as hashed imports and its GTM frame before the runtime', t => {
  if (!legacyTracked) {
    t.skip('the legacy public/ tree is no longer tracked');
    return;
  }
  const { output } = converter.convertPage({ ...legacyContext(), relativePath: 'gruppovye-trenirovki/index.html' });
  assert.match(output, /import accordionHorizontal from '\.\.\/\.\.\/scripts\/accordion-horizontal\.js\?url';\nimport coachesShowMore from '\.\.\/\.\.\/scripts\/coaches-show-more\.js\?url';/);
  assert.match(output, /zvenfitPage="group-fitness"/);
  assert.match(output, /<Menu variant="service" secondary=\{\{"label":"показать на карте","href":"https:\/\/yandex\.kz\/maps\/-\/CPeXe80n","target":"_blank"\}\} logoEmbedClass="w-embed" wNode=\{\{"cta":"w-node-fc8cf782-[^"]+","secondary":"[^"]+","reviews":"[^"]+","contacts":"[^"]+"\}\} \/>/);
  assert.match(output, /<Footer location="nahabinskoe-shosse" anchorId="contacts" mobileAnchorId="contact" \/>\n {2}<Analytics placement="body" gtm="commented" \/>\n\n {2}<Fragment slot="scripts">/);
  assert.match(output, /<script is:inline src=\{accordionHorizontal\} type="text\/javascript" defer><\/script>\n {2}<script is:inline src=\{coachesShowMore\} type="text\/javascript" defer><\/script>/);
  assert.doesNotMatch(output, /"\/js\//);
});

test('the lead form keeps its config endpoint on the legacy path and imports the vendor mask', t => {
  if (!legacyTracked) {
    t.skip('the legacy public/ tree is no longer tracked');
    return;
  }
  const { output } = converter.convertPage({ ...legacyContext(), relativePath: 'forma-dlya-zayavki/index.html' });
  assert.match(output, /import imask761 from '\.\.\/\.\.\/vendor\/imask-7\.6\.1\.min\.js\?url';\nimport leadForm from '\.\.\/\.\.\/scripts\/lead-form\.js\?url';/);
  assert.match(output, /<script is:inline src=\{imask761\} defer><\/script>/);
  assert.match(output, /<script is:inline src="\/js\/lead-config\.js"><\/script>\n {2}<script is:inline src=\{leadForm\} defer><\/script>/);
});

test('a manual page keeps the listed blocks as markup and still gets map and badge components', t => {
  if (!legacyTracked) {
    t.skip('the legacy public/ tree is no longer tracked');
    return;
  }
  const context = { ...legacyContext(), relativePath: 'klubnaya-karta/index.html' };
  assert.throws(() => converter.convertPage(context), /footer differs from the shared Footer contract|menu does not match/);
  assert.throws(() => converter.convertPage({ ...context, keep: ['menu', 'footer', 'header'] }), /keeps unknown blocks: header/);
  const { output, kept } = converter.convertPage({ ...context, keep: ['menu', 'footer'] });
  assert.deepEqual(kept, ['menu', 'footer']);
  assert.match(output, /import klubnayaKartaV1 from '\.\.\/\.\.\/styles\/klubnaya-karta\.v1\.css\?url';/);
  assert.match(output, /gtm="single-space" hasMaps ogImage="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/images\/club-card\/hero\.webp" openGraphSkip=\{\["og:image","twitter:image"\]\}>/);
  assert.match(output, /<section class="menu2" aria-label="Основная навигация">/);
  assert.match(output, /<div id="contacts" class="club-card-contacts">\n {2}<section class="section-4">\n {4}<div class="div-block-13">\n {6}<MapRegion \/>\n/);
  assert.equal(output.split('<MapRegion />').length - 1, 2);
  assert.equal(output.split('    <AppDownloadBadges />\n').length - 1, 2);
  assert.match(output, /<Analytics placement="body" gtm="single-space" frameTitle="Google Tag Manager" \/>/);
  assert.doesNotMatch(output, /<Menu |<Footer |map-widget|ZvenFit: app-download/);
});

test('trainer pages become collection entries with their legacy deviations', t => {
  if (!legacyTracked) {
    t.skip('the legacy public/ tree is no longer tracked');
    return;
  }
  const context = legacyContext();
  const efim = converter.convertTrainer({ ...context, relativePath: 'trenery/trener-efim/index.html' });
  assert.equal(efim.slug, 'trener-efim');
  assert.deepEqual(Object.keys(efim.entry), ['wfPage', 'name', 'nameDative', 'jobTitle', 'location', 'headingHtml', 'roleHtml', 'groups', 'certificates', 'nextSlug', 'updated', 'sitemap', 'meta', 'legacy']);
  assert.equal(efim.entry.nameDative, 'Ефиму');
  assert.equal(efim.entry.photoClass, undefined);
  assert.deepEqual(efim.entry.sitemap, { changefreq: 'monthly', priority: '0.65' });
  assert.deepEqual(efim.entry.legacy, { markup: 'webflow', gtm: 'bare', ctaRegularSpace: true, backFallbackPath: '/trenery/' });
  assert.ok(efim.output.endsWith('}\n'));
  assert.doesNotMatch(efim.output, /\u00a0/);
  assert.match(efim.output, /\\u00a0/);
  assert.deepEqual(JSON.parse(efim.output), efim.entry);

  const shulepova = converter.convertTrainer({ ...context, relativePath: 'trenery/trener-natalya-shulepova/index.html' });
  assert.equal(shulepova.entry.certificates.length, 7);
  assert.equal(shulepova.entry.certificates.filter(certificate => certificate.wNode).length, 6);
  assert.equal(shulepova.entry.certificates[0].plainDescription, true);
  assert.equal(shulepova.entry.legacy.markup, 'handwritten');
  assert.equal(shulepova.entry.legacy.certificateLinkRel, 'noopener noreferrer');
  assert.match(shulepova.entry.legacy.webflowComments, /^<!-- {2}This site was created in Webflow/);

  const withoutProfile = { ...context, profiles: {} };
  assert.throws(() => converter.convertTrainer({ ...withoutProfile, relativePath: 'trenery/trener-efim/index.html' }), /has no name, jobTitle and location/);
  assert.throws(() => converter.convertTrainer({ ...context, sitemapEntries: new Map(), relativePath: 'trenery/trener-efim/index.html' }), /missing from the legacy sitemap/);
});

test('every legacy deviation of the trainer entries must be recorded in manual.json with a reason', () => {
  const entries = [
    { slug: 'trener-a', entry: { legacy: { markup: 'webflow', gtm: 'bare' }, certificates: [{ plainDescription: true }, {}] } },
    { slug: 'trener-b', entry: { legacy: { markup: 'handwritten' }, certificatesSectionEmpty: true } },
  ];
  const recorded = {
    'markup=webflow': { reason: 'r', entries: ['trener-a'] },
    'markup=handwritten': { reason: 'r', entries: ['trener-b'] },
    gtm: { reason: 'r', entries: ['trener-a'] },
    'certificates.plainDescription': { reason: 'r', entries: ['trener-a#1'] },
    certificatesSectionEmpty: { reason: 'r', entries: ['trener-b'] },
  };
  assert.doesNotThrow(() => converter.checkTrainerDeviations(entries, { trainers: { legacy: recorded } }));
  assert.throws(() => converter.checkTrainerDeviations(entries, { trainers: { legacy: { ...recorded, gtm: { reason: 'r', entries: [] } } } }), /gtm: trener-a/);
  assert.throws(() => converter.checkTrainerDeviations(entries, { trainers: { legacy: { ...recorded, gtm: { entries: ['trener-a'] } } } }), /gtm: trener-a/);
  assert.throws(
    () => converter.checkTrainerDeviations(entries, { trainers: { legacy: { ...recorded, backFallbackPath: { reason: 'r', entries: ['trener-a'] } } } }),
    /backFallbackPath: recorded in manual\.json but no entry carries it/,
  );
  assert.throws(() => converter.checkTrainerDeviations(entries, {}), /record each with a reason/);
});

test('manual.json names its pages, kept blocks and trainer deviations with reasons', () => {
  const manual = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/migrate/manual.json'), 'utf8'));
  assert.deepEqual(manual.pages['/klubnaya-karta/'].keep, ['menu', 'footer']);
  for (const entry of [...Object.values(manual.pages), manual.trainers]) {
    assert.match(entry.since, /^[0-9a-f]{40}$/);
  }
  for (const entry of [...Object.values(manual.pages), ...Object.values(manual.trainers.legacy)]) {
    assert.ok(entry.reason.length > 20);
  }
  for (const record of Object.values(manual.trainers.legacy)) {
    assert.ok(record.entries.length > 0);
    assert.ok(record.entries.every(entry => /^trener-[a-z-]+(?:#\d+)?$/.test(entry)));
  }
});

test('pages listed in manual.json are refused without --force', t => {
  if (!legacyTracked) {
    t.skip('the legacy public/ tree is no longer tracked');
    return;
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'html-to-astro-'));
  const result = spawnSync(process.execPath, [CLI, '--ref', HEAD, '--page', '/klubnaya-karta/', '--out', out, '--content', path.join(out, 'trainers')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /maintained by hand/);
  assert.deepEqual(walk(out), []);
});

test('the committed pages and trainer entries are exactly what the converter produces', t => {
  if (!legacyTracked) {
    t.skip('the legacy public/ tree is no longer tracked');
    return;
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'html-to-astro-'));
  const pages = path.join(out, 'pages');
  const content = path.join(out, 'trainers');
  const partial = spawnSync(process.execPath, [CLI, '--ref', HEAD, '--all', '--out', pages, '--content', content], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(partial.status, 1, 'without --force the run must end with a non-zero code');
  assert.match(partial.stderr, /\/klubnaya-karta\/ is maintained by hand/);
  assert.equal(fs.existsSync(path.join(pages, 'klubnaya-karta')), false);

  const full = spawnSync(process.execPath, [CLI, '--ref', HEAD, '--all', '--force', '--out', pages, '--content', content], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(full.status, 0, full.stderr);
  const generatedPages = walk(pages);
  const committedPages = walk(path.join(ROOT, 'src/pages')).filter(file => file.endsWith('.astro') && !file.includes('['));
  assert.deepEqual(generatedPages, committedPages);
  assert.equal(generatedPages.length, 20);
  for (const file of generatedPages) {
    assert.equal(fs.readFileSync(path.join(pages, file), 'utf8'), fs.readFileSync(path.join(ROOT, 'src/pages', file), 'utf8'), `src/pages/${file} differs from the converter output`);
  }
  const generatedEntries = walk(content);
  assert.deepEqual(generatedEntries, walk(path.join(ROOT, 'src/content/trainers')));
  assert.equal(generatedEntries.length, 21);
  for (const file of generatedEntries) {
    assert.equal(fs.readFileSync(path.join(content, file), 'utf8'), fs.readFileSync(path.join(ROOT, 'src/content/trainers', file), 'utf8'), `src/content/trainers/${file} differs from the converter output`);
  }
});
