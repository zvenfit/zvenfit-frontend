'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  compareHtml,
  compareModes,
  createAssetRegistry,
  internalLinks,
  parseConfigAssignments,
  readSitemap,
  rulesForRoute,
} = require('../lib/html-parity.cjs');

const ROUTE = 'offer/index.html';

function page({ head = '', body = '' } = {}) {
  return `<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="utf-8">\n  <title>T</title>${head}\n</head>\n<body class="body">\n  <div class="a">x</div>${body}\n</body>\n</html>\n`;
}

function compare(baseHtml, candidateHtml, rules = []) {
  return compareHtml({ route: ROUTE, baseHtml, candidateHtml, rules, assets: createAssetRegistry() });
}

test('identical documents compare clean and count nodes', () => {
  const result = compare(page(), page());
  assert.deepEqual(result.errors, []);
  assert.ok(result.nodes > 5);
});

test('whitespace is ignored inside head and at the end of body, but significant elsewhere', () => {
  assert.deepEqual(compare(page({ head: '\n\n  <meta name="x" content="1">' }), page({ head: '<meta name="x" content="1">' })).errors, []);
  assert.deepEqual(compare(page().replace('</body>\n</html>\n', '</body>\n</html>'), page()).errors, []);
  const result = compare(page({ body: '\n  <a href="/x/">x</a> <a href="/y/">y</a>' }), page({ body: '\n  <a href="/x/">x</a><a href="/y/">y</a>' }));
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /node mismatch inside <body>/);
});

test('entities and raw characters compare by decoded text; NBSP never equals a space', () => {
  assert.deepEqual(compare(page({ body: '<p>a b &amp; c</p>' }), page({ body: '<p>a&nbsp;b &amp; c</p>' })).errors, []);
  assert.equal(compare(page({ body: '<p>a b</p>' }), page({ body: '<p>a b</p>' })).errors.length, 1);
});

test('comments need an allow-list rule to disappear, and the rule must match exactly as often as declared', () => {
  const withMarker = page({ head: '\n  <!-- ZvenFit: UTM attribution -->\n  <script src="/js/utm-attribution.js?v=1" defer></script>' });
  const without = page({ head: '\n  <script src="/_astro/utm-attribution.Ab12Cd34.js" defer></script>' });
  const rule = { id: 'utm', kind: 'comment-removed', data: ' ZvenFit: UTM attribution ', count: 1 };
  assert.deepEqual(compare(withMarker, without, [rule]).errors, []);
  assert.match(compare(withMarker, without, []).errors[0], /node mismatch inside <head>/);
  assert.match(compare(withMarker, without, [{ ...rule, count: 2 }]).errors[0], /matched 1 time\(s\), expected 2/);
  const legacyWithoutMarker = page({ head: '\n  <script src="/js/utm-attribution.js?v=1" defer></script>' });
  assert.match(compare(legacyWithoutMarker, without, [rule]).errors[0], /matched 0 time\(s\), expected 1/);
});

test('an attribute may change only through a matching allow-list rule', () => {
  const base = page({ body: '<script src="https://storage.yandexcloud.net/zvenfit/v2/js/webflow.js?v=parity" type="text/javascript"></script>' });
  const candidate = page({ body: '<script src="https://storage.yandexcloud.net/zvenfit/v2/js/webflow.js?v=parity" type="text/javascript" defer></script>' });
  const rule = {
    id: 'defer',
    kind: 'attribute',
    selector: { tag: 'script', attrIncludes: { src: '/js/webflow.js?v=' } },
    name: 'defer',
    before: null,
    after: '',
    count: 1,
  };
  assert.deepEqual(compare(base, candidate, [rule]).errors, []);
  assert.match(compare(base, candidate, []).errors[0], /attribute defer differs/);
  assert.match(compare(base, page({ body: '<script src="https://storage.yandexcloud.net/zvenfit/v2/js/webflow.js?v=parity" type="module"></script>' }), [rule]).errors[0], /attribute type differs/);
});

test('own scripts, styles and configs are mapped through the asset table and registered', () => {
  const assets = createAssetRegistry();
  const base = page({
    head: '<link href="/css/zvenfit.webflow.min.css?v=1" rel="stylesheet">',
    body: '<script src="/js/lead-form.js?v=1" defer></script><script src="/js/lead-config.js?v=1"></script>',
  });
  const candidate = page({
    head: '<link href="/_astro/zvenfit.webflow.DCaF7bL2.css" rel="stylesheet">',
    body: '<script src="/_astro/lead-form.DzJub9Ws.js" defer></script><script src="/js/lead-config.js"></script>',
  });
  const result = compareHtml({ route: ROUTE, baseHtml: base, candidateHtml: candidate, rules: [], assets });
  assert.deepEqual(result.errors, []);
  assert.equal(assets.base.scripts.get('lead-form.js'), 'js/lead-form.js');
  assert.equal(assets.candidate.scripts.get('lead-form.js'), '_astro/lead-form.DzJub9Ws.js');
  assert.equal(assets.base.styles.get('zvenfit.webflow.css'), 'css/zvenfit.webflow.min.css');
  assert.equal(assets.candidate.styles.get('zvenfit.webflow.css'), '_astro/zvenfit.webflow.DCaF7bL2.css');
});

test('the candidate may not keep legacy paths, version configs or reference unknown hashed files', () => {
  const base = page({ body: '<script src="/js/lead-form.js?v=1" defer></script>' });
  assert.match(compare(base, page({ body: '<script src="/js/lead-form.js" defer></script>' })).errors[0], /still references a legacy path/);
  assert.match(compare(base, page({ body: '<script src="/_astro/mystery.Ab12Cd34.js" defer></script>' })).errors[0], /unknown hashed asset/);
  assert.match(
    compare(page({ body: '<script src="/js/lead-config.js?v=1"></script>' }), page({ body: '<script src="/js/lead-config.js?v=2"></script>' })).errors[0],
    /must not carry a query/,
  );
});

test('inline scripts compare byte for byte, JSON-LD as parsed JSON, noscript as raw text', () => {
  assert.equal(compare(page({ body: '<script>var a = 1;</script>' }), page({ body: '<script>var a=1;</script>' })).errors.length, 1);
  assert.deepEqual(
    compare(page({ head: '<script type="application/ld+json">{"a":1,"b":[1,2]}</script>' }), page({ head: '<script type="application/ld+json">\n{\n  "a": 1,\n  "b": [1, 2]\n}\n</script>' })).errors,
    [],
  );
  assert.match(compare(page({ head: '<script type="application/ld+json">{"a":1}</script>' }), page({ head: '<script type="application/ld+json">{"a":2}</script>' })).errors[0], /JSON-LD graph differs/);
  const noscript = '<noscript><div><img src="https://mc.yandex.ru/watch/1" alt="" /></div></noscript>';
  assert.deepEqual(compare(page({ head: noscript }), page({ head: noscript })).errors, []);
  assert.match(compare(page({ head: noscript }), page({ head: noscript.replace(' />', '>') })).errors[0], /noscript content differs/);
});

test('rulesForRoute scopes rules by profile, mode, route and exceptions', () => {
  const rules = [
    { id: 'all', profiles: ['a1', 'a'], mode: 'production', routes: ['*'], exceptRoutes: ['404.html'] },
    { id: 'offer', profiles: ['a1'], mode: 'production', routes: ['offer/index.html'] },
    { id: 'staging', profiles: ['a1'], mode: 'staging', routes: ['*'] },
  ];
  assert.deepEqual(rulesForRoute(rules, { profile: 'a1', mode: 'production', route: 'offer/index.html' }).map(rule => rule.id), ['all', 'offer']);
  assert.deepEqual(rulesForRoute(rules, { profile: 'a', mode: 'production', route: '404.html' }).map(rule => rule.id), []);
  assert.deepEqual(rulesForRoute(rules, { profile: 'a', mode: 'production', route: 'privacy/index.html' }).map(rule => rule.id), ['all']);
});

const ANALYTICS_HEAD =
  '<!--  Google Tag Manager  -->\n  <script>(function(w){})(window,"https://www.googletagmanager.com/gtm.js");</script>\n  <!--  End Google Tag Manager  -->\n  <!-- Top.Mail.Ru counter -->\n  <script type="text/javascript">ts.src = "https://top-fwz1.mail.ru/js/code.js";</script>\n  <noscript><div><img src="https://top-fwz1.mail.ru/counter?id=1;js=na" alt="Top.Mail.Ru" /></div></noscript>\n  <!-- /Top.Mail.Ru counter -->\n  <!-- Yandex.Metrika counter -->\n  <script type="text/javascript">k.src="https://mc.yandex.ru/metrika/tag.js?id=1"</script>\n  <noscript><div><img src="https://mc.yandex.ru/watch/1" alt="" /></div></noscript>\n  <!-- /Yandex.Metrika counter -->\n';
const ANALYTICS_BODY = '<!--  Google Tag Manager (noscript)  -->\n  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-1"></iframe></noscript>\n  <!--  End Google Tag Manager (noscript)  -->';

function modes(productionHtml, stagingHtml) {
  return compareModes({ route: ROUTE, productionHtml, stagingHtml, assets: createAssetRegistry() });
}

test('staging may differ from production only by analytics, adjacent whitespace and the robots meta', () => {
  const production = page({ head: `\n  ${ANALYTICS_HEAD}`, body: `\n  <script src="/_astro/a.Ab12Cd34.js"></script>${ANALYTICS_BODY}\n  <script>x()</script>\n` });
  const staging = page({ head: '\n  <meta name="robots" content="noindex, nofollow">', body: '\n  <script src="/_astro/a.Ab12Cd34.js"></script>\n  <script>x()</script>\n' });
  const result = modes(production, staging);
  assert.deepEqual(result.errors, []);
  assert.equal(result.counts.analyticsRemoved, 14);
  assert.equal(result.counts.robotsInserted, 1);
});

test('staging mode rejects missing or wrong robots meta, surviving analytics and any other change', () => {
  const production = page({ head: `\n  ${ANALYTICS_HEAD}`, body: `${ANALYTICS_BODY}` });
  assert.match(modes(production, page()).errors[0], /exactly one robots meta/);
  assert.match(modes(production, page({ head: '<meta name="robots" content="noindex, follow">' })).errors[0], /exactly noindex, nofollow/);
  assert.match(modes(production, page({ head: `<meta name="robots" content="noindex, nofollow">${ANALYTICS_BODY}` })).errors[0], /node mismatch/);
  assert.match(
    modes(production, page({ head: '<meta name="robots" content="noindex, nofollow">', body: '' }).replace('class="a"', 'class="b"')).errors[0],
    /attribute class differs/,
  );
});

test('config assignments, sitemap entries and internal links are extracted', () => {
  const assignments = parseConfigAssignments("// comment\nwindow.ZVENFIT_LEAD_API = 'https://a.test/lead';\n");
  assert.deepEqual([...assignments], [['ZVENFIT_LEAD_API', 'https://a.test/lead']]);
  assert.throws(() => parseConfigAssignments('window.x = 1;'), /unexpected config line/);
  const sitemap = readSitemap('<urlset><!-- c --><url>\n<loc>https://z.ru/offer/</loc><lastmod>2026-05-13</lastmod><changefreq>yearly</changefreq><priority>0.3</priority></url></urlset>');
  assert.deepEqual(sitemap.get('https://z.ru/offer/'), { lastmod: '2026-05-13', changefreq: 'yearly', priority: '0.3' });
  assert.deepEqual(
    [...internalLinks('<a href="/offer/#x">a</a><a href="/privacy/?u=1">b</a><a href="https://x.test/">c</a><a href="//cdn/x">d</a><link href="/_astro/x.css">')].sort(),
    ['/_astro/x.css', '/offer/', '/privacy/'],
  );
});
