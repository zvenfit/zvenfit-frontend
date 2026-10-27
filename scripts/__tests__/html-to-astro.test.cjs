'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const converter = require('../migrate/html-to-astro.cjs');

const ROOT = path.resolve(__dirname, '../..');

test('entities decode, braces and Unicode spaces are escaped outside raw text', () => {
  assert.equal(converter.decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &nbsp;f &#x2014;'), 'a & b <c> "d" \'e\'  f —');
  assert.throws(() => converter.decodeEntities('&bogus;'), /unknown entity/);
  const html = '<p title="{x}">a {b} c d e</p><script>if (a) { b(); } </script><style>a{b}</style>';
  assert.equal(
    converter.escapeBracesOutsideRawText(html),
    '<p title="&#123;x&#125;">a &#123;b&#125; c&nbsp;d&#x2009;e</p><script>if (a) { b(); } </script><style>a{b}</style>',
  );
});

test('every script becomes is:inline once and comments are emitted through set:html', () => {
  assert.equal(converter.markScriptsInline('<script src="/x.js" defer></script><script is:inline>1</script>'), '<script is:inline src="/x.js" defer></script><script is:inline>1</script>');
  assert.equal(converter.wrapComments('a<!-- x "y" -->b'), 'a<Fragment set:html={"<!-- x \\"y\\" -->"} />b');
});

test('GTM comment styles are recognised', () => {
  assert.equal(converter.detectGtmStyle(undefined), false);
  assert.equal(converter.detectGtmStyle('<!--  Google Tag Manager  -->\n  <script>x</script>'), 'commented');
  assert.equal(converter.detectGtmStyle('<!-- Google Tag Manager -->\n  <script>x</script>'), 'single-space');
  assert.equal(converter.detectGtmStyle('<script>x</script>'), 'bare');
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

const LOGO = '<div class="code-embed-5 w-embed"><svg></svg></div>\n        <div class="code-embed-6 w-embed"><svg></svg></div>';

function menu({ logo = LOGO, ariaLabel = '', dataBack = ' data-back="true"', href = '#', target = '', block = 1, label = 'вернуться назад' } = {}) {
  return `<section class="menu3">\n    <div class="menu_grid-4">\n      <a href="/" class="link-block-4 w-inline-block"${ariaLabel}>\n        ${logo}\n      </a>\n      <a${dataBack} href="${href}"${target} class="link-block-page${block} w-inline-block">\n        <div class="menu-txt">${label}</div>\n      </a>\n    </div>\n  </section>`;
}

test('the plain menu is reduced to component props and anything else is refused', () => {
  assert.equal(converter.convertMenu(menu(), '/offer/', LOGO), '<Menu variant="plain" secondary={{"label":"вернуться назад","href":"#","dataBack":true,"block":1}} />');
  assert.equal(
    converter.convertMenu(menu({ logo: '<div class="menu-txt">zvenfit</div>', ariaLabel: ' aria-label="На главную ZvenFit"' }), '/raspisanie/', LOGO),
    '<Menu variant="plain" logo="text" logoText="zvenfit" logoLabel="На главную ZvenFit" secondary={{"label":"вернуться назад","href":"#","dataBack":true,"block":1}} />',
  );
  assert.equal(
    converter.convertMenu(menu({ dataBack: '', href: '/forma-dlya-zayavki/', block: 4, label: 'оставить заявку' }), '/404.html', LOGO),
    '<Menu variant="plain" secondary={{"label":"оставить заявку","href":"/forma-dlya-zayavki/","block":4}} />',
  );
  assert.throws(() => converter.convertMenu(menu().replace('menu3', 'menu2'), '/x/', LOGO), /plain menu contract/);
  assert.throws(() => converter.convertMenu(menu({ logo: LOGO.replace('code-embed-6', 'code-embed-7') }), '/x/', LOGO), /plain menu contract/);
  assert.throws(() => converter.convertMenu(menu(), '/x/', LOGO.replace('<svg>', '<svg width="1">')), /logo embeds differ/);
});

test('the footer contract marks the current legal link and drops badge markers when the page had none', () => {
  const template = '<section class="section-4"><a href="/privacy/" target="_blank" class="link">P</a><a href="/offer/" target="_blank" class="link text-span-2 _2">O</a>\n        <!-- ZvenFit: app-download-links-desktop --></section>\n  <section class="section-3"><a href="/offer/" target="_blank" class="link text-span-2 _2">O</a>\n        <!-- ZvenFit: app-download-links-mobile --></section>';
  const expected = converter.expectedFooter(template, { pagePath: '/offer/', badges: true });
  assert.match(expected, /<a href="\/offer\/" target="_blank" aria-current="page" class="link text-span-2 _2 w--current">O<\/a>/);
  assert.match(expected, /<a href="\/privacy\/" target="_blank" class="link">P<\/a>/);
  assert.doesNotMatch(converter.expectedFooter(template, { pagePath: '/x/', badges: false }), /ZvenFit: app-download/);
});

test('head parsing extracts the page meta and refuses unknown head lines', () => {
  const head = [
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
  ].join('\n');
  const parsed = converter.parseHead(`\n${head}`, '/offer/');
  assert.equal(parsed.title, 'Публичная оферта');
  assert.equal(parsed.canonical, 'https://zvenfit.ru/offer/');
  assert.equal(parsed.gtm, 'commented');
  assert.equal(parsed.robots, undefined);
  const bare = converter.parseHead(`\n${head.replace('<!--  Google Tag Manager  -->', '').replace('\n  <!--  End Google Tag Manager  -->', '')}`, '/x/');
  assert.equal(bare.gtm, 'bare');
  assert.throws(() => converter.parseHead(`\n${head}  <meta name="x" content="y">\n`, '/offer/'), /unsupported head line/);
});

test('the legal pages at HEAD convert into Base pages with Menu, Footer and Analytics calls', t => {
  const tracked = execFileSync('git', ['ls-files', 'public/offer/index.html'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!tracked) {
    t.skip('public/offer/index.html is no longer tracked');
    return;
  }
  const ref = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const sitemapEntries = new Map([['https://zvenfit.ru/offer/', { updated: '2026-05-13', changefreq: 'yearly', priority: '0.3' }]]);
  const logoMarkup = fs.readFileSync(path.join(ROOT, 'src/components/logo-embeds.html'), 'utf8');
  const footerMarkup = converter.footerTemplate(ref);
  const result = converter.convertPage({ ref, relativePath: 'offer/index.html', sitemapEntries, logoMarkup, footerMarkup });

  assert.equal(result.pagePath, '/offer/');
  assert.equal(result.webflowDefer, false);
  assert.equal(result.hasMaps, true);
  assert.match(result.output, /^---\nimport Analytics from '\.\.\/\.\.\/components\/Analytics\.astro';\n/);
  assert.match(result.output, /export const sitemap = \{ updated: '2026-05-13', changefreq: 'yearly', priority: '0\.3' \};/);
  assert.match(result.output, /<Base title="Публичная оферта" description="[^"]+" wfPage="69ae68a15d10e15990081f0d" wfSite="697f30b67cb029a39716bd07" webflowComments="[^"]+" hasMaps>/);
  assert.match(result.output, /<Menu variant="plain" secondary=\{\{"label":"вернуться назад","href":"#","dataBack":true,"block":1\}\} \/>/);
  assert.match(result.output, /<Footer location="chekhova" \/>/);
  assert.match(result.output, /<Fragment slot="scripts"><Analytics placement="body" gtm="commented" \/>\n  <script is:inline>/);
  const body = result.output.slice(result.output.indexOf('hasMaps>') + 'hasMaps>'.length);
  assert.doesNotMatch(body, /<!--/);
  assert.doesNotMatch(result.output, /map-widget/);
  assert.doesNotMatch(result.output, / /);
  assert.ok(result.output.endsWith('</Fragment></Base>\n'));
});

test('pages listed in manual.json are refused without --force', () => {
  const manual = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/migrate/manual.json'), 'utf8'));
  assert.ok(manual.pages['/klubnaya-karta/'], 'the club card is maintained by hand');
  for (const entry of Object.values(manual.pages)) {
    assert.match(entry.since, /^[0-9a-f]{40}$/);
    assert.ok(entry.reason.length > 20);
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'html-to-astro-'));
  const result = require('node:child_process').spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts/migrate/html-to-astro.cjs'), '--ref', '978b9219d45f858d6d0afcad412f8ed180d8a2f6', '--page', '/klubnaya-karta/', '--out', out],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /maintained by hand/);
});
