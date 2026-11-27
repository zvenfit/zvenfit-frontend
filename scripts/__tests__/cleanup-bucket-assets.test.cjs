'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { promisify } = require('node:util');
const { execFile, execFileSync, spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { planCleanup, deployment, options, selectCandidates } = require('../cleanup-bucket-assets.cjs');

const { configDigest } = require('../lib/deployed-site-config.cjs');
const runtime = Object.fromEntries(
  ['lead', 'schedule', 'traffic'].map(name => [
    'js/' + name + '-config.js',
    `window.ZVENFIT_${name.toUpperCase()}_API = 'https://deployed.invalid/${name}';\n`,
  ]),
);
runtime['js/maps-config.js'] = 'window.ZVENFIT_MAPS = {"apiKey":"deployed-key"};\n';
const digest = configDigest(key => runtime[key]);
const release = { sha: 'a'.repeat(40), version: '175', digest };
const now = Date.parse('2026-11-27T12:00:00Z');
const old = '2026-11-20T10:00:00Z';
const cutoff = '2026-11-25T12:00:00Z';
const html = '<link href="/_astro/live.css?x=1"><script src="/_astro/app.js"></script>';
const object = (Key, LastModified = old, Size = 128) => ({ Key, LastModified, Size });

function fixture(t, extra = []) {
  const runnerTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-fixture-'));
  t.after(() => fs.rmSync(runnerTemp, { recursive: true, force: true }));
  const root = path.join(runnerTemp, 'deployed');
  fs.mkdirSync(root);
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist);
  fs.mkdirSync(path.join(dist, '_astro'));
  fs.mkdirSync(path.join(dist, 'js'), { recursive: true });
  for (const [key, source] of Object.entries(runtime)) fs.writeFileSync(path.join(dist, key), source);
  for (const key of ['live.css', 'app.js', 'font.woff2']) fs.writeFileSync(path.join(dist, '_astro', key), '');
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  fs.writeFileSync(path.join(dist, '404.html'), '<script src="/_astro/app.js"></script>');
  const objects = ['index.html', '404.html', '_astro/live.css', '_astro/app.js', '_astro/font.woff2'].map(key =>
    object(key),
  );
  objects.push(...Object.keys(runtime).map(key => object(key)), ...extra);
  const removed = [];
  const reports = [];
  const client = {
    deployment: () => release,
    list: () => objects,
    readHtml: key => ({ release, html: fs.readFileSync(path.join(dist, key)) }),
    contentType: () => 'application/octet-stream',
    readAsset: key => fs.readFileSync(path.join(dist, key)),
    remove: key => removed.push(key),
  };
  const run = (execute = false, environment = 'staging') =>
    planCleanup({
      client,
      config: { ...options({ CLEANUP_ENVIRONMENT: environment }), execute },
      sha: release.sha,
      dist,
      now,
      report: message => reports.push(message),
    });
  return { root, run, client, objects, removed, reports };
}

test('an empty listing yields no candidates', () => {
  assert.deepEqual(selectCandidates([], new Set(), '_astro/', Date.parse(cutoff)), []);
});

test('the execute plan contains exactly the old unbuilt assets inside the allowed prefix', t => {
  const candidate = object('_astro/old.css', old, 6144);
  const box = fixture(t, [
    candidate,
    object('_astro/new.js', '2026-11-26T15:00:00Z'),
    object('_astro/boundary.css', cutoff),
    ...[
      'js/old.js',
      'css/old.css',
      'images/old.jpg',
      'images/coaches/a.jpg',
      'documents/cv.pdf',
      'v2/_astro/old.css',
      '_astro-backup/old.css',
      '_astro/../documents/cv.pdf',
      '_astro/',
    ].map(key => object(key)),
  ]);
  assert.deepEqual(box.run(true), [candidate]); // also protects the old, indirectly used font in dist
  assert.deepEqual(box.removed, []);
  assert.equal(box.reports.length, 1);
});

test('dry-run with candidates issues zero delete calls and reports the evidence', t => {
  const box = fixture(t, [object('_astro/old.css', old, 6144), object('_astro/old.js', old, 2048)]);
  assert.equal(box.run().length, 2);
  assert.deepEqual(box.removed, []);
  const [summary] = box.reports;
  for (const value of [
    'dry-run',
    'staging',
    release.sha,
    'Candidates: **2**',
    'Total bytes: **8192**',
    '2 days',
    '2026-11-25T12:00:00.000Z',
    '_astro/old.css',
    '_astro/old.js',
    '6144',
    '2048',
  ]) {
    assert.ok(summary.includes(value), value);
  }
});

test('embedded iframe documents stop planning even for a relative asset without a leading slash', t => {
  const stale = object('_astro/old.png');
  const box = fixture(t, [stale]);
  const file = path.join(box.root, 'dist/index.html');
  fs.writeFileSync(file, html + `<iframe srcdoc="<img src='_astro/old.png'>"></iframe>`);
  for (const execute of [false, true])
    assert.throws(() => box.run(execute), /Cannot verify iframe\[srcdoc\] in index.html/);
  assert.deepEqual(box.reports, []);
  assert.deepEqual(box.removed, []);
  fs.writeFileSync(file, html + '<iframe srcdoc=""></iframe>');
  assert.deepEqual(box.run(), [stale]);
});

test('embedded data documents and meta refresh stop before reporting any candidate', t => {
  const box = fixture(t, [object('_astro/old.png')]);
  const file = path.join(box.root, 'dist/index.html');
  const url = 'data:text/html,' + encodeURIComponent('<img src="https://zvenfit.ru/_astro/old.png">');
  for (const [tag, error] of [
    ['<iframe src="' + url + '"></iframe>', /embedded data URL/],
    ['<object data="' + url + '"></object>', /embedded data URL/],
    ['<embed src="' + url + '">', /embedded data URL/],
    ['<meta http-equiv="Refresh" content="0; url=_astro/old.png">', /meta refresh/],
  ]) {
    fs.writeFileSync(file, html + tag);
    for (const execute of [false, true]) assert.throws(() => box.run(execute), error);
  }
  assert.deepEqual(box.reports, []);
  assert.deepEqual(box.removed, []);
});

test('local embedded documents stop planning before an SVG dependency can become a candidate', t => {
  const old = object('_astro/used.png');
  const box = fixture(t, [old, object('images/poster.svg')]);
  const dist = path.join(box.root, 'dist');
  fs.mkdirSync(path.join(dist, 'images'));
  fs.writeFileSync(
    path.join(dist, 'images/poster.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="/_astro/used.png"/></svg>',
  );
  for (const tag of [
    '<object type="image/svg+xml" data="/images/poster.svg"></object>',
    '<iframe src="images/poster.svg"></iframe>',
    '<embed src="https://storage.yandexcloud.net/zvenfit-frontend-staging/images/poster.svg">',
  ]) {
    fs.writeFileSync(path.join(dist, 'index.html'), html + tag);
    for (const execute of [false, true]) assert.throws(() => box.run(execute), /local embedded document/);
  }
  assert.deepEqual(box.reports, []);
  assert.deepEqual(box.removed, []);
  fs.writeFileSync(path.join(dist, 'index.html'), html + '<iframe src="https://other.invalid/form"></iframe>');
  assert.deepEqual(box.run(), [old]);
});

test('navigating to a same-site SVG stops before its dependent image can become a candidate', t => {
  const used = object('_astro/poster.png');
  const box = fixture(t, [used, object('images/poster.svg'), object('poster')]);
  const dist = path.join(box.root, 'dist');
  fs.mkdirSync(path.join(dist, 'images'));
  const poster = '<svg xmlns="http://www.w3.org/2000/svg"><image href="/_astro/poster.png"/></svg>';
  fs.writeFileSync(path.join(dist, 'images/poster.svg'), poster);
  fs.writeFileSync(path.join(dist, 'poster'), poster);
  const requested = [];
  box.client.contentType = key => {
    requested.push(key);
    return 'image/svg+xml; charset=UTF-8';
  };
  const index = path.join(dist, 'index.html');
  for (const tag of [
    '<a href="/images/poster.svg?download=1#photo">View</a>',
    '<area href="images/poster%2Esvg">',
    '<svg><a xlink:href="https://website.yandexcloud.net/zvenfit-frontend-staging/images/poster.svg">View</a></svg>',
    '<a href="poster.svg">View</a><base href="/images/">',
    '<form action="/poster"></form>',
  ]) {
    fs.writeFileSync(index, html + tag);
    for (const execute of [false, true]) assert.throws(() => box.run(execute), /Cannot verify .*document/);
  }
  assert.ok(requested.includes('poster'));
  assert.deepEqual(box.reports, []);
  assert.deepEqual(box.removed, []);
  fs.writeFileSync(index, html + '<img src="/images/poster.svg"><a href="https://outside.invalid/poster.svg">View</a>');
  assert.deepEqual(box.run(true), [used]);
});

test('SVG presentation attributes resolve paint, filter and marker URLs against the document base', t => {
  const paint = object('_astro/used.svg');
  const stale = object('_astro/unused.svg');
  const box = fixture(t, [paint, stale]);
  const dist = path.join(box.root, 'dist');
  const index = path.join(dist, 'index.html');
  for (const [base, attrs] of [
    ['', 'fill="url(_astro/used.svg#brand)"'],
    ['<base href="/_astro/">', 'stroke="URL(&quot;used.svg#ink&quot;) red"'],
    ['', 'filter="var(--effect, url(_astro/used.svg#blur))"'],
    ['', 'marker-end="url(_astro/used.svg#end)"'],
    ['', String.raw`fill="u\72l('_astro/used.svg#brand')"`],
  ]) {
    fs.writeFileSync(index, base + html + '<svg><path ' + attrs + '></path></svg>');
    for (const execute of [false, true])
      assert.throws(() => box.run(execute), /missing referenced asset _astro\/used.svg/);
  }
  assert.deepEqual(box.reports, []);
  fs.writeFileSync(path.join(dist, paint.Key), '');
  assert.deepEqual(box.run(true), [stale]);
  fs.unlinkSync(path.join(dist, paint.Key));
  fs.writeFileSync(
    index,
    '<base href="/_astro/">' +
      html +
      '<svg><path fill="url(#local)" stroke="url(https://outside.invalid/used.svg#color)"/></svg>',
  );
  assert.deepEqual(box.run(true), [stale, paint]);
  assert.deepEqual(box.removed, []);
});

test('active data imports in CSS and JavaScript stop both plans, including transitive imports', t => {
  const used = object('_astro/poster.png');
  const box = fixture(t, [used, object('js/entry.js'), object('css/theme.css')]);
  const dist = path.join(box.root, 'dist');
  fs.mkdirSync(path.join(dist, 'css'));
  const css =
    'data:text/css;base64,' +
    Buffer.from('g{background:url(https://staging.zvenfit.ru/_astro/poster.png)}').toString('base64');
  const js = 'data:text/javascript,' + encodeURIComponent('fetch("https://staging.zvenfit.ru/_astro/poster.png")');
  for (const [tag, stylesheet = '', module = ''] of [
    [`<style>@import url("${css}");</style>`],
    [`<script type="module">import "${js}"</script>`],
    ['<link rel="stylesheet" href="/css/theme.css">', `@import "${css}";`],
    ['<script type="module" src="/js/entry.js"></script>', '', `import("${js}");`],
  ]) {
    fs.writeFileSync(path.join(dist, 'css/theme.css'), stylesheet);
    fs.writeFileSync(path.join(dist, 'js/entry.js'), module);
    fs.writeFileSync(path.join(dist, 'index.html'), html + tag);
    for (const execute of [false, true]) assert.throws(() => box.run(execute), /Cannot verify data: .*dependency/);
  }
  assert.deepEqual(box.reports, []);
  assert.deepEqual(box.removed, []);
  fs.writeFileSync(path.join(dist, 'js/entry.js'), '');
  fs.writeFileSync(path.join(dist, 'css/theme.css'), 'g {background:url(data:image/png;base64,iVBORw0KGgo=)}');
  fs.writeFileSync(path.join(dist, 'index.html'), html + '<link rel="stylesheet" href="/css/theme.css">');
  assert.deepEqual(box.run(true), [used]);
});

test('javascript navigation URLs stop both plans even with HTML entities and mixed case', t => {
  const box = fixture(t, [object('_astro/used.png')]);
  for (const tag of [
    `<a href="javascript:void fetch('/_astro/used.png')">Open</a>`,
    `<a href="JaVa&#9;ScRiPt:void fetch('/_astro/used.png')">Open</a>`,
    `<svg><a xlink:href="javascript:void fetch('/_astro/used.png')"></a></svg>`,
  ]) {
    fs.writeFileSync(path.join(box.root, 'dist/index.html'), html + tag);
    for (const execute of [false, true]) assert.throws(() => box.run(execute), /javascript: URL/);
  }
  assert.deepEqual(box.reports, []);
  assert.deepEqual(box.removed, []);
});

test('active document URL schemes stop planning while an inline image stays usable', t => {
  const stale = object('_astro/used.png');
  const box = fixture(t, [stale]);
  const file = path.join(box.root, 'dist/index.html');
  for (const [tag, error] of [
    ['<a href="data:text/html,document">Open</a>', /data: URL/],
    ['<a href="vbscript:example">Open</a>', /vbscript: URL/],
    ['<base href="vbscript:example">', /document base/],
    ['<base href="data:text/html,document">', /document base/],
  ]) {
    fs.writeFileSync(file, tag + html);
    for (const execute of [false, true]) assert.throws(() => box.run(execute), error);
  }
  assert.deepEqual(box.reports, []);
  fs.writeFileSync(file, html + '<img src="data:image/png;base64,iVBORw0KGgo=">');
  assert.deepEqual(box.run(true), [stale]);
  assert.deepEqual(box.removed, []);
});

test('staging verifies relative dependencies on the slashless and directory routes of each index', t => {
  const used = object('_astro/used.png');
  const stale = object('_astro/stale.png');
  const key = 'contacts/platforms/index.html';
  const box = fixture(t, [used, stale, object(key)]);
  const dist = path.join(box.root, 'dist');
  fs.mkdirSync(path.dirname(path.join(dist, key)), { recursive: true });
  fs.writeFileSync(path.join(dist, key), '<img src="../_astro/used.png">');
  for (const execute of [false, true])
    assert.throws(() => box.run(execute), /missing referenced asset _astro\/used.png/);
  assert.deepEqual(box.reports, []);
  fs.writeFileSync(path.join(dist, used.Key), '');
  assert.deepEqual(box.run(true), [stale]);
  assert.deepEqual(box.removed, []);
});

test('404 dependencies must be independent of the arbitrary missing URL, including scripts and styles', t => {
  const used = object('_astro/nested/used.png');
  const box = fixture(t, [used]);
  const dist = path.join(box.root, 'dist');
  const file = path.join(dist, '404.html');
  for (const fragment of [
    '<img src="used.png">',
    '<style>.error { background: url(../../../used.png) }</style>',
    '<base href="./nested/"><img src="used.png">',
    '<script type="module">import "./entry.js";</script>',
    '<script>fetch("used.png")</script>',
    '<script type="importmap">{"imports":{"widget":"./entry.js"}}</script>',
    '<script type="importmap">{"scopes":{"/offer/":{"widget":"/_astro/used.js"}}}</script>',
    '<base href="https:#top"><img src="used.png">',
    '<img src="used.png"><base href="/">',
  ]) {
    fs.writeFileSync(file, fragment);
    for (const execute of [false, true]) assert.throws(() => box.run(execute), /404/);
  }
  fs.writeFileSync(path.join(dist, '_astro/app.js'), 'fetch("../nested/used.png")');
  fs.writeFileSync(file, '<script src="/_astro/app.js"></script>');
  assert.throws(() => box.run(true), /404/);
  assert.deepEqual(box.reports, []);
  fs.writeFileSync(path.join(dist, '_astro/app.js'), '');
  fs.writeFileSync(file, '<base href="/images/"><img src="used.png"><a href="#top">Top</a>');
  assert.deepEqual(box.run(true), [used]);
  assert.deepEqual(box.removed, []);
});

test('production HTTP links use the CDN redirect for the same host and default port', t => {
  const stale = object('_astro/old.pdf');
  const box = fixture(t, [stale]);
  const file = path.join(box.root, 'dist/index.html');
  fs.writeFileSync(file, html + '<a href="http://zvenfit.ru:80/_astro/old.pdf">Schedule</a>');
  for (const execute of [false, true]) {
    assert.throws(() => box.run(execute, 'production'), /missing referenced asset _astro\/old.pdf/);
  }
  assert.deepEqual(box.run(false, 'staging'), [stale]);
  fs.writeFileSync(file, html + '<a href="http://zvenfit.ru:8000/_astro/old.pdf">Other origin</a>');
  assert.deepEqual(box.run(false, 'production'), [stale]);
});

test('a live-only reference on another HTML page stops execute before any delete', t => {
  const box = fixture(t, [object('_astro/old.js')]);
  box.client.readHtml = key => ({
    release,
    html: Buffer.from(key === '404.html' ? '<img srcset="/_astro/app.js, &#47;_astro/old.js">' : html),
  });
  assert.throws(() => box.run(true), /Live HTML differs from dist: 404\.html/);
  assert.deepEqual(box.removed, []);
});

test('live-only relative CSS on the home page stops planning and deletion', t => {
  const box = fixture(t, [object('_astro/hero-old.png')]);
  const read = box.client.readHtml;
  box.client.readHtml = key =>
    key === 'index.html'
      ? { release, html: Buffer.from(html + '<style>.hero{background:url(_astro/hero-old.png)}</style>') }
      : read(key);
  for (const execute of [false, true])
    assert.throws(() => box.run(execute), /Live HTML differs from dist: index\.html/);
  assert.deepEqual(box.reports, []);
  assert.deepEqual(box.removed, []);
});

test('identical pages resolve inline CSS against the document base and protect the whole key', t => {
  const box = fixture(t, [object('_astro/(old),file.png')]);
  const file = path.join(box.root, 'dist/index.html');
  for (const use of [
    '<style>.hero{background:url("(old),file.png")}</style>',
    `<div style='background:url("(old),file.png")'></div>`,
    '<script src="(old),file.png"></script>',
  ]) {
    fs.writeFileSync(file, '<head><base href="/_astro/"></head>' + html + use);
    assert.throws(() => box.run(true), /Incomplete dist: missing referenced asset _astro\/\(old\),file\.png/);
  }
  assert.deepEqual(box.removed, []);
});

test('quoted CSS imports and image-set URLs must exist in the rebuilt site', t => {
  const box = fixture(t, [object('_astro/old.css')]);
  for (const rule of ['@import "_astro/old.css" screen;', '.hero{background-image:image-set("_astro/old.css" 1x)}']) {
    fs.writeFileSync(path.join(box.root, 'dist/index.html'), html + '<style>' + rule + '</style>');
    for (const execute of [false, true]) {
      assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset _astro/old.css' });
    }
  }
  assert.deepEqual(box.reports, []);
});

test('absolute storage URLs protect only the selected site bucket', t => {
  const candidate = object('_astro/old.css');
  const box = fixture(t, [candidate]);
  const file = path.join(box.root, 'dist/index.html');
  const filename = '_astro/old.css';
  for (const base of [
    'https://storage.yandexcloud.net/zvenfit-frontend-staging/',
    'https://zvenfit-frontend-staging.storage.yandexcloud.net/',
    'https://zvenfit-frontend-staging.website.yandexcloud.net/',
  ]) {
    fs.writeFileSync(file, html + `<link href="${base}${filename}">`);
    assert.throws(() => box.run(true), { message: 'Incomplete dist: missing referenced asset ' + filename });
  }
  fs.writeFileSync(file, html + `<img src="https://storage.yandexcloud.net/another-site/${filename}">`);
  assert.deepEqual(box.run(true), [candidate]);
});

test('both website endpoints protect production assets over HTTP and HTTPS', t => {
  const used = object('_astro/used.png');
  const box = fixture(t, [used]);
  const file = path.join(box.root, 'dist/index.html');
  for (const protocol of ['http:', 'https:']) {
    for (const hostAndPath of [
      'zvenfit-frontend.website.yandexcloud.net/',
      'website.yandexcloud.net/zvenfit-frontend/',
    ]) {
      fs.writeFileSync(file, html + `<a href="${protocol}//${hostAndPath}${used.Key}">Image</a>`);
      for (const execute of [false, true]) {
        assert.throws(() => box.run(execute, 'production'), /missing referenced asset _astro\/used.png/);
      }
    }
  }
  assert.deepEqual(box.reports, []);
  fs.writeFileSync(file, html + '<a href="https://website.yandexcloud.net/another-bucket/_astro/used.png">Image</a>');
  assert.deepEqual(box.run(true, 'production'), [used]);
  assert.deepEqual(box.removed, []);
});

test('emitted CSS resolves relative dependencies against the stylesheet directory', t => {
  const image = object('_astro/nested/old.png');
  const css = object('_astro/nested/nested.css');
  const stale = object('_astro/unused.js');
  const box = fixture(t, [image, css, stale]);
  const assets = path.join(box.root, 'dist/_astro');
  fs.mkdirSync(path.join(assets, 'nested'));
  fs.writeFileSync(path.join(assets, 'live.css'), '@import "nested/nested.css";');
  fs.writeFileSync(path.join(assets, 'nested/nested.css'), '.hero{background:url(old.png)}');
  for (const execute of [false, true]) {
    assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + image.Key });
  }
  fs.writeFileSync(path.join(assets, 'nested/old.png'), '');
  assert.deepEqual(box.run(true), [stale]);
});

test('metadata and inline JSON preserve the origin and bucket of an asset URL', t => {
  const candidate = object('_astro/share.png');
  const box = fixture(t, [candidate]);
  const file = path.join(box.root, 'dist/index.html');
  const documents = url => [
    `<meta property="og:image" content="${url}">`,
    `<script type="application/ld+json">{"image":"${url}"}</script>`,
  ];
  for (const markup of documents('https://storage.yandexcloud.net/zvenfit/v2/_astro/share.png')) {
    fs.writeFileSync(file, html + markup);
    assert.deepEqual(box.run(true), [candidate]);
  }
  for (const markup of documents('https://storage.yandexcloud.net/zvenfit-frontend-staging/_astro/share.png')) {
    fs.writeFileSync(file, html + markup);
    assert.throws(() => box.run(true), { message: 'Incomplete dist: missing referenced asset ' + candidate.Key });
  }
});

test('classic JavaScript asset URLs must exist in the build before cleanup can proceed', t => {
  const used = object('_astro/archived-picture.png');
  const stale = object('_astro/unused.png');
  const box = fixture(t, [used, stale]);
  const dist = path.join(box.root, 'dist');
  const source = path.join(dist, '_astro/app.js');
  const src = 'new Image().src = "/_astro/archived-picture.png";';
  for (const js of [
    src,
    'fetch(`/_astro/archived-picture.png?v=2`)',
    String.raw`fetch("\x2f_astro/archived-picture.png")`,
  ]) {
    fs.writeFileSync(source, js);
    for (const execute of [false, true])
      assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + used.Key });
  }
  fs.writeFileSync(
    source,
    '/* "/_astro/archived-picture.png" */ fetch("https://another.invalid/_astro/archived-picture.png")',
  );
  assert.deepEqual(box.run(true), [used, stale]);
  fs.writeFileSync(path.join(dist, 'index.html'), html + '<script>' + src + '</script>');
  assert.throws(() => box.run(true), /Incomplete dist: missing referenced asset/);
  fs.writeFileSync(path.join(dist, used.Key), '');
  assert.deepEqual(box.run(true), [stale]);
  fs.writeFileSync(source, 'fetch(`/_astro/${name}.png`)');
  assert.throws(() => box.run(true), /Cannot verify a computed asset URL/);
});

test('inline and emitted templates resolve location.origin before checking the asset path', t => {
  const used = object('_astro/old.png');
  const box = fixture(t, [used]);
  const dist = path.join(box.root, 'dist');
  const script = path.join(dist, '_astro/app.js');
  const index = path.join(dist, 'index.html');
  for (const js of [
    'fetch(`${location.origin}/_astro/old.png`)',
    'fetch(`${window.location.origin}/_astro/old.png?v=${v}`)',
  ]) {
    for (const inline of [false, true]) {
      fs.writeFileSync(index, html + (inline ? '<script>' + js + '</script>' : ''));
      fs.writeFileSync(script, inline ? '' : js);
      for (const execute of [false, true])
        assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + used.Key });
    }
  }
  fs.writeFileSync(path.join(dist, used.Key), '');
  assert.deepEqual(box.run(true), []);
  fs.writeFileSync(index, html + '<script>fetch(`${originFromConfig}/_astro/old.png`)</script>');
  assert.throws(() => box.run(), /Cannot verify a computed asset URL/);
  fs.unlinkSync(path.join(dist, used.Key));
  fs.writeFileSync(index, html + '<script>fetch(`https://another.invalid/${version}/_astro/old.png`)</script>');
  assert.deepEqual(box.run(), [used]);
});

test('constant concatenations protect the complete key without treating pieces as object names', t => {
  const used = object('_astro/old.png');
  const stale = object('_astro/old');
  const box = fixture(t, [used, stale]);
  const dist = path.join(box.root, 'dist');
  const inline = path.join(dist, 'index.html');
  const emitted = path.join(dist, '_astro/app.js');
  for (const source of ['fetch("/" + "_astro" + "/old.png")', 'fetch(("/_astro/old" + (".p" + "ng")))']) {
    for (const inHtml of [false, true]) {
      fs.writeFileSync(inline, html + (inHtml ? '<script>' + source + '</script>' : ''));
      fs.writeFileSync(emitted, inHtml ? '' : source);
      for (const execute of [false, true])
        assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + used.Key });
      fs.writeFileSync(path.join(dist, used.Key), '');
      assert.deepEqual(box.run(), [stale]);
      fs.unlinkSync(path.join(dist, used.Key));
    }
  }
  fs.writeFileSync(inline, html + '<script>fetch("https://outside.invalid" + "/_astro/old.png")</script>');
  assert.deepEqual(box.run(true), [stale, used]);
});

test('service worker container aliases verify the entry and stop unresolved local requests', t => {
  const image = object('_astro/sw-image.png');
  const box = fixture(t, [image, object('worker.js')]);
  const dist = path.join(box.root, 'dist');
  const code = path.join(dist, 'index.html');
  const worker = path.join(dist, 'worker.js');
  for (const source of [
    'const sw = navigator.serviceWorker; sw.register("/worker.js")',
    'const sw = navigator.serviceWorker; const method = "register"; sw[method]("/worker.js")',
    'const sw = navigator.serviceWorker; sw["reg" + "ister"].call(sw,"/worker.js")',
    'const {serviceWorker: sw} = navigator; const alias = sw; alias.register("/worker.js")',
    'function start(container) { container.register("/worker.js") } start(navigator.serviceWorker)',
    'const sw = navigator.serviceWorker; const start = sw.register.bind(sw, "/worker.js"); start()',
    'const sw = navigator.serviceWorker; if (typeof sw.register === "function") sw.register.call(sw, "/worker.js")',
    'const sw = navigator.serviceWorker; sw.register.apply(sw, ["/worker.js"])',
    'const sw = navigator.serviceWorker; sw.register.bind(sw)("/worker.js")',
  ]) {
    fs.writeFileSync(code, html + '<script>' + source + '</script>');
    fs.writeFileSync(worker, 'self.onmessage = e => fetch("/" + e.data)');
    for (const execute of [false, true]) assert.throws(() => box.run(execute), /Cannot verify a computed asset URL/);
    fs.writeFileSync(worker, 'fetch("/_astro/sw-image.png")');
    assert.throws(() => box.run(), { message: 'Incomplete dist: missing referenced asset ' + image.Key });
    fs.writeFileSync(worker, '');
    assert.deepEqual(box.run(true), [image]);
  }
  fs.writeFileSync(code, html + '<script>const sw = navigator.serviceWorker; sw[window.method]("/worker.js")</script>');
  assert.throws(() => box.run(), /Cannot verify a computed service worker property/);
  fs.writeFileSync(code, html + '<script>const sw = navigator.serviceWorker; sw.register(window.workerPath)</script>');
  assert.throws(() => box.run(), /Cannot verify a computed asset URL/);
  fs.writeFileSync(
    code,
    html + '<script>const registry = {register(label) {}}; registry.register("local label")</script>',
  );
  assert.deepEqual(box.run(), [image]);
});

test('registration methods that escape without a known URL stop both plans across script tags', t => {
  const used = object('_astro/sw-image.png');
  const box = fixture(t, [used, object('worker.js')]);
  const dist = path.join(box.root, 'dist');
  const worker = 'self.onmessage = e => fetch("/" + e.data)';
  fs.writeFileSync(path.join(dist, 'worker.js'), worker);
  for (const capture of [
    'window.start = navigator.serviceWorker.register.bind(navigator.serviceWorker)',
    'const start = navigator.serviceWorker.register.bind(navigator.serviceWorker)',
    'const {register:start} = navigator.serviceWorker',
  ]) {
    fs.writeFileSync(
      path.join(dist, 'index.html'),
      html + '<script>' + capture + '</script><script>start("/worker.js")</script>',
    );
    for (const execute of [false, true])
      assert.throws(() => box.run(execute), /Cannot verify an indirect service worker registration/);
  }
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    html +
      '<script>const sw = navigator.serviceWorker; window.start = sw.register.bind(sw, "/worker.js")</script><script>window.start()</script>',
  );
  assert.throws(() => box.run(), /Cannot verify a computed asset URL/);
  fs.writeFileSync(path.join(dist, 'worker.js'), '');
  assert.deepEqual(box.run(true), [used]);
});

test('parser-loaded code uses the base in force at each tag', t => {
  const old = object('_astro/old.png');
  const box = fixture(t, [old, ...['early.js', 'later/early.js', 'later/after.css'].map(k => object(k))]);
  const dist = path.join(box.root, 'dist');
  fs.mkdirSync(path.join(dist, 'later'));
  for (const k of ['early.js', 'later/early.js', 'later/after.css']) fs.writeFileSync(path.join(dist, k), '');
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    '<head><script src="early.js"></script><base href="/later/"><link rel="stylesheet" href="after.css"></head>' + html,
  );
  const read = box.client.readAsset;
  const seen = new Set();
  box.client.readAsset = key => {
    seen.add(key);
    return key === 'early.js' ? Buffer.from('fetch("/_astro/old.png")') : read(key);
  };
  for (const execute of [false, true])
    assert.throws(() => box.run(execute), { message: 'Live code differs from dist: early.js' });
  fs.writeFileSync(path.join(dist, 'early.js'), 'fetch("/_astro/old.png")');
  assert.throws(() => box.run(), { message: 'Incomplete dist: missing referenced asset ' + old.Key });
  fs.writeFileSync(path.join(dist, old.Key), '');
  assert.deepEqual(box.run(true), []);
  assert.ok(seen.has('early.js') && seen.has('later/after.css'));
  assert.equal(seen.has('later/early.js'), false);
});
test('navigation before a late base also protects the destination after parsing', t => {
  const used = object('_astro/document.pdf');
  const box = fixture(t, [used]);
  fs.writeFileSync(
    path.join(box.root, 'dist/index.html'),
    html + '<a href="document.pdf">Open</a><base href="/_astro/">',
  );
  assert.throws(() => box.run(), { message: 'Incomplete dist: missing referenced asset ' + used.Key });
  fs.writeFileSync(path.join(box.root, 'dist', used.Key), '');
  assert.deepEqual(box.run(true), []);
});

test('submit overrides and inline event handlers use the effective document base', t => {
  const used = object('_astro/old.png');
  const box = fixture(t, [used]);
  const dist = path.join(box.root, 'dist');
  for (const tag of [
    '<form><button formaction="old.png">Open</button></form>',
    '<form><input type="submit" formaction="old.png"></form>',
    '<button onclick="location.href=&#39;old.png&#39;">Open</button>',
  ]) {
    for (const tags of [tag + '<base href="/_astro/">', '<base href="/_astro/">' + tag]) {
      fs.writeFileSync(path.join(dist, 'index.html'), html + tags);
      for (const execute of [false, true])
        assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + used.Key });
      fs.writeFileSync(path.join(dist, used.Key), '');
      assert.deepEqual(box.run(true), []);
      fs.unlinkSync(path.join(dist, used.Key));
    }
  }
});

test('a relative script URL under an asset base and a stylesheet outside _astro protect live images', t => {
  const image = object('_astro/old.png');
  const box = fixture(t, [image]);
  const dist = path.join(box.root, 'dist');
  fs.writeFileSync(path.join(dist, 'index.html'), '<head><base href="/_astro/"></head>' + html);
  const app = path.join(dist, '_astro/app.js');
  fs.writeFileSync(app, 'addEventListener("click", () => fetch("old.png"));');
  for (const execute of [false, true])
    assert.throws(() => box.run(execute), /missing referenced asset _astro\/old\.png/);
  fs.writeFileSync(app, 'addEventListener("click", () => {});');
  assert.deepEqual(box.run(true), [image]);
  fs.writeFileSync(path.join(dist, 'index.html'), html + '<link href="/css/live.css" rel="stylesheet">');
  fs.mkdirSync(path.join(dist, 'css'));
  fs.writeFileSync(path.join(dist, 'css/live.css'), 'body { background-image: url(../_astro/old.png); }');
  box.objects.push(object('css/live.css'));
  for (const execute of [false, true])
    assert.throws(() => box.run(execute), /missing referenced asset _astro\/old\.png/);
  fs.writeFileSync(path.join(dist, image.Key), '');
  assert.deepEqual(box.run(true), []);
});

test('checks literals in scripts outside _astro and resolves import.meta.url against the module', t => {
  const used = object('_astro/old.png');
  const box = fixture(t, [used]);
  const dist = path.join(box.root, 'dist');
  fs.mkdirSync(path.join(dist, 'js'), { recursive: true });
  const config = path.join(dist, 'js/runtime.js');
  fs.writeFileSync(path.join(dist, 'index.html'), html + '<script src="/js/runtime.js"></script>');
  box.objects.push(object('js/runtime.js'));
  fs.writeFileSync(config, 'window.picture="/%5Fastro/old.png";');
  assert.throws(() => box.run(true), /missing referenced asset _astro\/old\.png/);
  fs.writeFileSync(config, 'fetch(new URL("old.png", "https://staging.zvenfit.ru/_astro/"));');
  assert.throws(() => box.run(true), { message: 'Incomplete dist: missing referenced asset ' + used.Key });
  fs.writeFileSync(config, 'fetch(new URL("/_astro/old.png", "https://other.invalid/"));');
  assert.deepEqual(box.run(true), [used]);
  fs.writeFileSync(config, '');
  fs.writeFileSync(path.join(dist, '_astro/app.js'), 'const picture = new URL("./old.png", import.meta.url);');
  assert.throws(() => box.run(true), /missing referenced asset _astro\/old\.png/);
  fs.writeFileSync(path.join(dist, used.Key), '');
  assert.deepEqual(box.run(true), []);
});

test('literal resources used relative to a worker URL remain protected', t => {
  const image = object('_astro/worker/old.png');
  const library = object('_astro/worker/old.js');
  const box = fixture(t, [image, library, object('_astro/worker/live.js')]);
  const dist = path.join(box.root, 'dist');
  fs.mkdirSync(path.join(dist, '_astro/worker'));
  fs.writeFileSync(path.join(dist, 'index.html'), html + '<script>new Worker("/_astro/worker/live.js")</script>');
  const worker = path.join(dist, '_astro/worker/live.js');
  for (const [asset, sources] of [
    [image, ['fetch("./old.png");', 'fetch(`./old.png?v=${Date.now()}`);']],
    [library, ['importScripts("./old.js");', 'importScripts(`./old.js#${version}`);']],
  ]) {
    for (const source of sources) {
      fs.writeFileSync(worker, source);
      for (const execute of [false, true])
        assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + asset.Key });
    }
    fs.writeFileSync(path.join(dist, asset.Key), '');
  }
  assert.deepEqual(box.run(true), []);
});

test('linked same-bucket scripts and styles must match dist before planning', t => {
  const stale = object('_astro/retained.png');
  const box = fixture(t, [stale, object('css/live.css'), object('js/module')]);
  const dist = path.join(box.root, 'dist');
  const read = box.client.readAsset;
  for (const [key, tag, live] of [
    [
      'css/live.css',
      '<link rel="alternate stylesheet" href="/css/live.css">',
      'a { background: url(/_astro/retained.png) }',
    ],
    [
      'js/module',
      '<script src="https://storage.yandexcloud.net/zvenfit-frontend-staging/js/module"></script>',
      'fetch("/_astro/retained.png")',
    ],
  ]) {
    fs.writeFileSync(path.join(dist, 'index.html'), html + tag);
    fs.mkdirSync(path.dirname(path.join(dist, key)), { recursive: true });
    box.client.readAsset = name => (name === key ? Buffer.from(live) : read(name));
    for (const execute of [false, true])
      assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + key });
    fs.writeFileSync(path.join(dist, key), '');
    for (const execute of [false, true])
      assert.throws(() => box.run(execute), { message: 'Live code differs from dist: ' + key });
    fs.writeFileSync(path.join(dist, key), live);
    assert.throws(() => box.run(), /missing referenced asset _astro\/retained.png/);
    fs.writeFileSync(path.join(dist, key), '');
    box.client.readAsset = read;
    assert.deepEqual(box.run(), [stale]);
  }
  assert.deepEqual(box.removed, []);
});

test('preloaded styles and scripts must match their live bytes before cleanup', t => {
  const image = object('_astro/preload.png');
  const box = fixture(t, [image, object('theme.css'), object('extra.js')]);
  const dist = path.join(box.root, 'dist');
  const read = box.client.readAsset;
  for (const [destination, key, source] of [
    ['style', 'theme.css', 'body { background: url(/_astro/preload.png) }'],
    ['script', 'extra.js', 'fetch("/_astro/preload.png")'],
  ]) {
    const onload = destination === 'style' ? ` onload="this.rel='stylesheet'"` : '';
    const preload = `<link rel="preload" as="${destination}" href="/${key}"${onload}>`;
    fs.writeFileSync(path.join(dist, 'index.html'), html + preload);
    fs.writeFileSync(path.join(dist, key), '');
    box.client.readAsset = name => (name === key ? Buffer.from(source) : read(name));
    for (const execute of [false, true])
      assert.throws(() => box.run(execute), { message: 'Live code differs from dist: ' + key });
    fs.writeFileSync(path.join(dist, key), source);
    assert.throws(() => box.run(), { message: 'Incomplete dist: missing referenced asset ' + image.Key });
    fs.writeFileSync(path.join(dist, key), '');
    box.client.readAsset = read;
    assert.deepEqual(box.run(), [image]);
  }
});

test('import map exact, scoped and package URLs resolve per page through external modules', t => {
  const used = object('_astro/lib/widget.js');
  const stale = object('_astro/lib/retired.js');
  const box = fixture(t, [used, stale, object('js/entry.mjs')]);
  const dist = path.join(box.root, 'dist');
  fs.mkdirSync(path.join(dist, 'js'), { recursive: true });
  fs.mkdirSync(path.join(dist, '_astro/lib'));
  const entry = path.join(dist, 'js/entry.mjs');
  const map = imports => '<script type="importmap">' + JSON.stringify(imports) + '</script>';
  for (const [mapping, code] of [
    [{ imports: { widget: './lib/widget.js' } }, 'import "widget"'],
    [{ imports: { 'widgets/': './lib/' } }, 'import "widgets/widget.js"'],
    [
      { imports: { widget: 'https://external.invalid/widget.js' }, scopes: { '/js/': { widget: './lib/widget.js' } } },
      'import("widget")',
    ],
  ]) {
    fs.writeFileSync(entry, code);
    fs.writeFileSync(
      path.join(dist, 'index.html'),
      '<base href="/_astro/">' + map(mapping) + html + '<script type="module" src="/js/entry.mjs"></script>',
    );
    for (const execute of [false, true])
      assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + used.Key });
    fs.writeFileSync(path.join(dist, used.Key), '');
    assert.deepEqual(box.run(true), [stale]);
    fs.unlinkSync(path.join(dist, used.Key));
  }
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    '<base href="/_astro/">' +
      map({ imports: { widget: './lib/widget.js' } }) +
      html +
      '<script type="module">import "widget"</script>',
  );
  assert.throws(() => box.run(), /missing referenced asset _astro\/lib\/widget.js/);
  assert.deepEqual(box.removed, []);
});

test('a shared module uses each importing page’s own maps and the first definition of each name', t => {
  const other = object('_astro/other.js');
  const box = fixture(t, [other]);
  const dist = path.join(box.root, 'dist');
  const tag = (alias, file) =>
    '<script type="importmap">' + JSON.stringify({ imports: { [alias]: file } }) + '</script>';
  const entry = '<script type="module" src="/_astro/app.js"></script>';
  fs.writeFileSync(path.join(dist, '_astro/app.js'), 'import "widget/extra.js"');
  fs.writeFileSync(path.join(dist, 'index.html'), tag('widget/', 'https://outside.invalid/') + entry);
  fs.writeFileSync(
    path.join(dist, '404.html'),
    tag('widget/extra.js', '/_astro/other.js') + tag('widget/extra.js', 'https://outside.invalid/other.js') + entry,
  );
  assert.throws(() => box.run(), { message: 'Incomplete dist: missing referenced asset ' + other.Key });
  fs.writeFileSync(path.join(dist, other.Key), '');
  assert.deepEqual(box.run(true), []);
});

test('an unknown worker-relative request filename stops both plans', t => {
  const image = object('_astro/worker/old.png');
  const box = fixture(t, [image, object('_astro/worker/app.js')]);
  const dist = path.join(box.root, 'dist');
  fs.mkdirSync(path.join(dist, '_astro/worker'));
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    html + '<script>new Worker("/_astro/worker/app.js").postMessage("old")</script>',
  );
  const worker = path.join(dist, '_astro/worker/app.js');
  for (const request of [
    'fetch(`./${e.data}.png`)',
    'self.importScripts(`${e.data}.js`)',
    'fetch("./" + e.data + ".png")',
    'fetch(e.data)',
    'new XMLHttpRequest().open("GET", e.data)',
  ]) {
    fs.writeFileSync(worker, 'self.onmessage = e => ' + request);
    for (const execute of [false, true]) assert.throws(() => box.run(execute), /Cannot verify a computed asset URL/);
  }
  fs.writeFileSync(worker, 'const xhr = new XMLHttpRequest(); xhr.open("GET","./old.png"); xhr.send()');
  assert.throws(() => box.run(), { message: 'Incomplete dist: missing referenced asset ' + image.Key });
  fs.writeFileSync(worker, 'self.indexedDB.open("cache", 2); fetch(new Request("https://another.invalid/a"))');
  assert.deepEqual(box.run(), [image]);
  const shared = 'js/shared.js';
  fs.mkdirSync(path.join(dist, 'js'), { recursive: true });
  fs.writeFileSync(path.join(dist, shared), 'self.onmessage = e => fetch("./old.png")');
  box.objects.push(object(shared));
  fs.writeFileSync(worker, 'importScripts("/js/shared.js")');
  assert.throws(() => box.run(true), { message: 'Incomplete dist: missing referenced asset ' + image.Key });
  fs.writeFileSync(worker, 'self.onmessage = e => fetch(`https://static.example/img/${e.data}.png`)');
  assert.deepEqual(box.run(true), [image]);
  assert.deepEqual(box.removed, []);
});

test('module imports in emitted JS and inline modules protect old chunks', t => {
  const chunk = object('_astro/old.js');
  const stale = object('_astro/stale.js');
  const box = fixture(t, [chunk, stale]);
  const dist = path.join(box.root, 'dist');
  const app = path.join(dist, '_astro/app.js');
  fs.writeFileSync(
    path.join(dist, 'index.html'),
    '<link href="/_astro/live.css"><script type="module" src="/_astro/app.js"></script>',
  );
  for (const source of ['import "./old.js";', 'export * from "./old.js";', 'import("./old.js")']) {
    fs.writeFileSync(app, source);
    for (const execute of [false, true])
      assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + chunk.Key });
  }
  fs.writeFileSync(app, 'import("./" + location.hash.slice(1))');
  assert.throws(() => box.run(true), /Cannot verify a computed module import/);
  fs.writeFileSync(app, '');
  fs.writeFileSync(path.join(dist, 'index.html'), html + '<script type="module">import "./_astro/old.js";</script>');
  assert.throws(() => box.run(true), { message: 'Incomplete dist: missing referenced asset ' + chunk.Key });
  fs.writeFileSync(path.join(dist, 'index.html'), html + '<script>import("/_astro/old.js")</script>');
  for (const execute of [false, true])
    assert.throws(() => box.run(execute), { message: 'Incomplete dist: missing referenced asset ' + chunk.Key });
  fs.writeFileSync(path.join(dist, chunk.Key), '');
  assert.deepEqual(box.run(true), [stale]);
});

test('a missing live reference also stops execute', t => {
  const box = fixture(t, [object('_astro/old.js')]);
  box.client.readHtml = () => ({ release, html: Buffer.from('<link href="/_astro/live.css">') });
  assert.throws(() => box.run(true), /Live HTML differs from dist: index\.html/);
  assert.deepEqual(box.removed, []);
});

test('a missing direct or indirect deployed asset blocks dry-run and execute', t => {
  const box = fixture(t, [object('_astro/stale.js')]);
  for (const key of ['_astro/app.js', '_astro/font.woff2']) {
    box.client.list = () => box.objects.filter(object => object.Key !== key);
    for (const execute of [false, true]) {
      assert.throws(() => box.run(execute), { message: `Incomplete deployment: missing bucket object ${key}` });
    }
  }
  assert.deepEqual(box.reports, []);
  assert.deepEqual(box.removed, []);
});

test('an empty bucket cannot pass the live HTML guard', t => {
  const box = fixture(t);
  box.client.list = () => [];
  assert.throws(() => box.run(true), /Live HTML differs.*pages/);
  assert.deepEqual(box.removed, []);
});

test('unknown release, different checkout and mixed HTML deployments fail closed', t => {
  assert.throws(() => deployment({}), /release metadata/);
  const box = fixture(t, [object('_astro/old.js')]);
  box.client.deployment = () => ({ ...release, sha: 'b'.repeat(40) });
  assert.throws(() => box.run(true), /checkout SHA/);
  box.client.deployment = () => release;
  box.client.readHtml = () => ({ release: { ...release, version: '176' }, html });
  assert.throws(() => box.run(true), /Mixed deployment/);
  assert.deepEqual(box.removed, []);
});

test('a recent HTML upload blocks execution even when the unused asset itself is old', t => {
  const box = fixture(t, [object('_astro/old.css')]);
  box.objects.find(o => o.Key === '404.html').LastModified = '2026-11-26T12:00:00Z';
  assert.equal(box.run().length, 1);
  assert.throws(() => box.run(true), /Rollback window is still open/);
  assert.deepEqual(box.removed, []);
});

test('the CLI accepts only the site buckets, current prefix, boolean mode and justified retention', () => {
  const env = { CLEANUP_ENVIRONMENT: 'production' };
  assert.deepEqual(options(env), {
    environment: 'production',
    bucket: 'zvenfit-frontend',
    prefix: '_astro/',
    execute: false,
    days: 2,
  });
  for (const prefix of ['', '_astro', '_astro/,js/', '/', '*', 'v2/', 'css/', 'images/', 'documents/']) {
    assert.throws(() => options({ ...env, CLEANUP_PREFIXES: prefix }), /prefix/);
  }
  for (const days of ['-1', '0', '1', '1.5', 'NaN', '']) {
    assert.throws(() => options({ ...env, CLEANUP_MIN_AGE_DAYS: days }), /min_age_days/);
  }
  assert.throws(() => options({ ...env, CLEANUP_EXECUTE: 'yes' }), /execute/);
  assert.throws(() => options({ CLEANUP_ENVIRONMENT: 'zvenfit/v2' }), /staging or production/);
});

test('cleanup is manual, uses the release lock and rebuilds the revision stamped on deployed HTML', () => {
  const workflow = name => fs.readFileSync(path.join(__dirname, '../../.github/workflows', name + '.yml'), 'utf8');
  const lock = /\nconcurrency:\n  group: deploy\n  cancel-in-progress: false\n  queue: max\n/;
  for (const name of ['main', 'staging', 'cleanup-assets']) assert.match(workflow(name), lock);
  const checklist = fs.readFileSync(path.join(__dirname, '../../docs/launch-checklist.md'), 'utf8');
  for (const name of ['main', 'staging', 'cleanup-assets']) {
    assert.ok(checklist.includes('**' + workflow(name).match(/^name: (.+)$/m)[1] + '**'));
  }
  assert.match(checklist, /очередь `deploy` с `queue: max`/);
  assert.match(checklist, /до 100 ожидающих/);
  assert.match(checklist, /отменяет вновь поступивший запуск/);
  assert.match(checklist, /более поздний успешный релиз этот коммит/);
  assert.match(checklist, /новый\s+ручной запуск \*\*Release\*\* для текущего `main` через staging и E2E/);
  const cleanupWorkflow = workflow('cleanup-assets');
  assert.deepEqual(
    [
      ...cleanupWorkflow
        .split('\non:\n')[1]
        .split('\nconcurrency:')[0]
        .matchAll(/^  (\w+):$/gm),
    ].map(m => m[1]),
    ['workflow_dispatch'],
  );
  assert.match(cleanupWorkflow, /execute:\n(?: {8}.*\n)*? {8}default: false/);
  assert.match(cleanupWorkflow, /prefixes:\n(?: {8}.*\n)*? {8}default: '_astro\/'/);
  assert.match(cleanupWorkflow, /min_age_days:\n(?: {8}.*\n)*? {8}default: 2\n/);
  assert.match(cleanupWorkflow, /timeout-minutes: (?:[1-9]|1\d|20)\n/);
  assert.match(
    cleanupWorkflow,
    /\n    environment:\n      name: \$\{\{ inputs.environment \}\}\n      deployment: false\n/,
  );
  assert.match(cleanupWorkflow, /CLEANUP_EXECUTE: \$\{\{ inputs.execute \}\}\n        run: \|/);
  assert.ok(
    cleanupWorkflow.includes(
      'CLEANUP_JOB_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}/job/${{ job.check_run_id }}',
    ),
  );
  assert.match(cleanupWorkflow, /id-token: write/);
  assert.match(cleanupWorkflow, /steps.live.outputs.sha/);
  assert.match(cleanupWorkflow, /git worktree add --detach "\$RUNNER_TEMP\/deployed" "\$DEPLOYED_SHA"/);
  assert.match(
    workflow('_deploy-environment'),
    /--metadata "deployed-sha=\$\{GITHUB_SHA\},asset-version=\$\{GITHUB_RUN_NUMBER\},runtime-config-sha256=\$\{config_digest\}"/,
  );
});

function cleanupStep(name) {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/cleanup-assets.yml'), 'utf8');
  return workflow
    .split(`      - name: ${name}\n`)[1]
    .split('\n      - ')[0]
    .split('        run: |\n')[1]
    .replace(/^          /gm, '');
}

test('re-running an older dispatch can rebuild a newer deployed SHA on main', t => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/cleanup-assets.yml'), 'utf8');
  const checkout = workflow.split('      - uses: actions/checkout@')[1].split('      - uses:')[0];
  assert.match(checkout, /^          ref: \$\{\{ github\.sha \}\}$/m);
  assert.match(checkout, /^          fetch-depth: 0$/m);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-rerun-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '--quiet', '-b', 'main');
  const commit = title => {
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '--quiet',
      '--allow-empty',
      '--no-gpg-sign',
      '-m',
      title,
    );
    return git('rev-parse', 'HEAD');
  };
  const dispatchSha = commit('dispatch');
  const liveSha = commit('deployed later');
  git('update-ref', 'refs/remotes/origin/main', liveSha);
  git('checkout', '--quiet', '--detach', dispatchSha);
  const unrelated = commit('outside main');
  git('checkout', '--quiet', '--detach', dispatchSha);
  assert.match(workflow, /- name: Require current main for execution\n        if: inputs.execute\n/);
  assert.ok(workflow.indexOf('Require current main') < workflow.indexOf('Authenticate with the selected'));
  const preflight = sha =>
    spawnSync('bash', ['-ec', cleanupStep('Require current main for execution')], {
      cwd: dir,
      env: { PATH: process.env.PATH, GITHUB_SHA: sha },
      encoding: 'utf8',
    });
  assert.equal(preflight(dispatchSha).status, 1);
  assert.equal(preflight(liveSha).status, 0);
  const prepare = sha =>
    spawnSync('bash', ['-e', '-o', 'pipefail', '-c', cleanupStep('Prepare the deployed checkout')], {
      cwd: dir,
      env: { PATH: dir + path.delimiter + process.env.PATH, RUNNER_TEMP: dir, DEPLOYED_SHA: sha },
      encoding: 'utf8',
    });
  assert.equal(prepare(unrelated).status, 1);
  const result = prepare(liveSha);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git('rev-parse', 'HEAD'), dispatchSha);
  assert.equal(git('-C', path.join(dir, 'deployed'), 'rev-parse', 'HEAD'), liveSha);
});

test('historical npm and build guards receive only archived source, public settings and a dist mount', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-build-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args]);
  git('init', '--quiet');
  fs.writeFileSync(path.join(dir, 'tracked'), 'committed');
  git('add', 'tracked');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--quiet',
    '--no-gpg-sign',
    '-m',
    'fixture',
  );
  fs.writeFileSync(path.join(dir, 'runner-only'), 'private fixture');
  // Capture exactly what crosses the Docker boundary, including the archive on stdin.
  fs.writeFileSync(
    path.join(dir, 'docker'),
    [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      "fs.writeFileSync('argv', JSON.stringify(process.argv.slice(2)));",
      "fs.writeFileSync('source.tar', fs.readFileSync(0));",
    ].join('\n'),
    { mode: 0o755 },
  );
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/cleanup-assets.yml'), 'utf8');
  const rebuild = cleanupStep('Rebuild and check the deployed site');
  assert.match(rebuild, /node scripts\/cleanup-bucket-assets\.cjs --rebuild "\$RUNNER_TEMP\/deployed"/);
  assert.doesNotMatch(workflow, /working-directory:.*deployed|cd "\$RUNNER_TEMP\/deployed"/);
  assert.deepEqual(
    workflow.match(/^\s*(?:run: )?npm .+$/gm).map(line => line.trim()),
    ['run: npm ci --ignore-scripts'],
  );
  execFileSync('bash', [path.join(__dirname, '../rebuild-cleanup-site.sh'), dir], {
    cwd: dir,
    env: {
      PATH: dir + path.delimiter + process.env.PATH,
      NODE_ENV: 'staging',
      YC_IAM_TOKEN: 'fixture',
      AWS_SESSION_TOKEN: 'fixture',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture',
    },
  });
  assert.equal(execFileSync('tar', ['-tf', 'source.tar'], { cwd: dir, encoding: 'utf8' }).trim(), 'tracked');
  const argv = JSON.parse(fs.readFileSync(path.join(dir, 'argv')));
  const image = argv.findIndex(arg => /^ubuntu:24\.04@sha256:[0-9a-f]{64}$/.test(arg));
  assert.ok(image > 0);
  const options = argv.slice(0, image);
  assert.deepEqual(options, [
    'run',
    '--rm',
    '-i',
    '--user',
    process.getuid() + ':' + process.getgid(),
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--mount',
    'type=bind,source=' + path.resolve(process.execPath, '../..') + ',target=/opt/node,readonly',
    '--mount',
    'type=bind,source=' + dir + '/dist,target=/output',
    '--env',
    'HOME=/tmp',
    '--env',
    'PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin',
    '--env',
    'BUILD_MODE=staging',
    '--env',
    'ASSET_VERSION',
    '--env',
    'Y_MAPS_API_KEY',
    '--env',
    'LEAD_API_URL',
    '--env',
    'SCHEDULE_API_URL',
    '--env',
    'TRAFFIC_API_URL',
  ]);
  assert.deepEqual(argv.slice(image + 1, -1), ['bash', '-euo', 'pipefail', '-c']);
  assert.match(argv.at(-1), /npm ci [^\n]+\n\s+export NODE_ENV="\$BUILD_MODE"\n\s+npm run build/);
  for (const check of ['routes', 'build', 'staging-build'])
    assert.ok(argv.at(-1).includes('node scripts/check-' + check + '.cjs'));
});

test('recovery selects a build containing the exact deleted key before choosing the environment workflow', t => {
  const root = path.join(__dirname, '../..');
  const runbook = fs.readFileSync(path.join(root, 'knowledge-base/staging-runbook.md'), 'utf8');
  const recovery = runbook.split('**Recovery.**')[1].split('\n## ')[0];
  const current = fixture(t);
  const previous = fixture(t);
  const key = '_astro/older file.png';
  fs.writeFileSync(path.join(previous.root, 'dist', key), '');
  const check = recovery.split('```bash\n')[1].split('\n```')[0];
  const containsKey = build => spawnSync('bash', ['-eu', '-c', check], { env: { build, key } }).status;
  assert.equal(containsKey(current.root), 1);
  assert.equal(containsKey(previous.root), 0);
  assert.match(recovery, /exact object\s+key from the confirmed deletion log/);
  const [staging, production] = recovery.split('- **Staging only.**')[1].split('- **Production.**');
  const workflowName = file =>
    fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8').match(/^name: (.+)$/m)[1];
  assert.ok(staging.includes(`**${workflowName('staging.yml')}**`));
  assert.doesNotMatch(staging, /\*\*Release\*\*/);
  assert.match(staging, /older SHA[\s\S]*exact SHA/);
  assert.ok(production.includes(`**${workflowName('main.yml')}**`));
  assert.match(production, /skip_staging` unchecked/);
});

test('historical staging recovery coordinates an idle deploy group before rerunning and checks release status afterwards', () => {
  const runbook = fs.readFileSync(path.join(__dirname, '../../knowledge-base/staging-runbook.md'), 'utf8');
  const staging = runbook.split('**Recovery.**')[1].split('- **Staging only.**')[1].split('- **Production.**')[0];
  const [before, after] = staging.split('**Re-run all jobs**');
  assert.match(before, /queue: max/);
  assert.match(before, /single/);
  assert.match(before, /owner/);
  assert.match(before, /no active or (?:queued|pending)/);
  for (const workflow of ['Release', 'Deploy to Staging', 'Clean up stale site assets'])
    assert.ok(before.includes(workflow));
  assert.match(after, /check .*Release.*cancel/i);
});

test('production recovery checks the actual candidate against the historical key and bytes', t => {
  const runbook = fs.readFileSync(path.join(__dirname, '../../knowledge-base/staging-runbook.md'), 'utf8');
  const procedure = runbook.split('**Recovery.**')[1].split('- **Production.**')[1].split('Both workflows')[0];
  const check = procedure
    .split('```bash\n')[1]
    .split(/\n\s*```/)[0]
    .trim();
  const build = fixture(t).root;
  const candidate = fixture(t).root;
  const { builtSiteStylesheets, minifyBuiltSiteCss } = require('../lib/site-css.cjs');
  const key = '_astro/zvenfit.webflow.previous.css';
  const other = '_astro/zvenfit.webflow.later.css';
  const original = '.hero { color: green }';
  function emit(checkout, filename, css) {
    const sourcePath = path.join(checkout, 'zvenfit.webflow.css');
    const assetsDir = path.join(checkout, 'dist/_astro');
    fs.writeFileSync(sourcePath, css);
    for (const previous of builtSiteStylesheets(assetsDir)) fs.unlinkSync(path.join(assetsDir, previous));
    fs.writeFileSync(path.join(checkout, 'dist', filename), css);
    minifyBuiltSiteCss({ assetsDir, sourcePath });
  }
  emit(build, key, original);
  emit(candidate, other, '.hero { color: blue }');
  const compare = () => spawnSync('bash', ['-eu', '-c', check], { env: { build, candidate, key } }).status;
  assert.notEqual(compare(), 0);
  fs.copyFileSync(path.join(build, 'dist', key), path.join(candidate, 'dist', key));
  minifyBuiltSiteCss({
    assetsDir: path.join(candidate, 'dist/_astro'),
    sourcePath: path.join(candidate, 'zvenfit.webflow.css'),
  });
  assert.notEqual(compare(), 0); // the build hook rewrites an extra copy using current source bytes
  emit(candidate, key, original);
  assert.equal(builtSiteStylesheets(path.join(candidate, 'dist/_astro')).length, 1);
  assert.equal(compare(), 0);
});

function dispatchFixture(t, extra = [object('_astro/stale.js')]) {
  const { root, objects } = fixture(t, extra);
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '--allow-empty',
    '--no-gpg-sign',
    '--quiet',
    '-m',
    'fixture',
  );
  const sha = git('rev-parse', 'HEAD');
  fs.writeFileSync(
    path.join(root, 'listing'),
    JSON.stringify({ Contents: objects.map(o => ({ ...o, LastModified: '2000-01-01T00:00:00Z' })) }),
  );
  fs.writeFileSync(
    path.join(root, 'metadata'),
    JSON.stringify({ Metadata: { 'deployed-sha': sha, 'asset-version': '175', 'runtime-config-sha256': digest } }),
  );
  fs.writeFileSync(
    path.join(root, 'aws'),
    `#!/usr/bin/env bash
set -eu
echo "$2" >> calls
[[ "$1" == s3api && "$3" == --bucket && "$4" == zvenfit-frontend-staging ]]
case "$2" in
  head-object) cat metadata ;;
  list-objects-v2)
    node -e 'const fs = require("node:fs"); const data = JSON.parse(fs.readFileSync("listing"));
      const removed = fs.existsSync("removed") ? fs.readFileSync("removed", "utf8").split("\\n") : [];
      console.log(JSON.stringify({Contents: data.Contents.filter(o => !removed.includes(o.Key))}));' ;;
  get-object)
    while [[ "$1" != --key ]]; do shift; done
    cp "dist/$2" "$3"
    cat metadata ;;
  delete-object)
    while [[ "$1" != --key ]]; do shift; done
    if [[ "$2" == "\${STUB_CANCEL_ON:-}" ]]; then kill -TERM "$PPID"; exit 1; fi
    echo "$2" >> removed ;;
  *) exit 64 ;;
esac
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(root, 'gh'),
    `#!/usr/bin/env bash
set -eu
echo main >> gh-calls
[[ "$*" == 'api repos/zvenfit/zvenfit-frontend/git/ref/heads/main --jq .object.sha' ]]
[[ "$STUB_MAIN_SHA" != unavailable ]]
echo "$STUB_MAIN_SHA"
`,
    { mode: 0o755 },
  );
  const summary = path.join(root, 'summary');
  const script = path.join(__dirname, '../cleanup-bucket-assets.cjs');
  const local = {
    PATH: root + path.delimiter + process.env.PATH,
    CLEANUP_ENVIRONMENT: 'staging',
    CLEANUP_JOB_URL: 'https://github.com/zvenfit/zvenfit-frontend/actions/runs/123/job/789',
    GITHUB_STEP_SUMMARY: summary,
  };
  const dispatch = {
    ...local,
    CLEANUP_EXECUTE: 'true',
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'zvenfit/zvenfit-frontend',
    GITHUB_SHA: sha,
    STUB_MAIN_SHA: sha,
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_WORKFLOW_REF: 'zvenfit/zvenfit-frontend/.github/workflows/cleanup-assets.yml@refs/heads/main',
    GITHUB_JOB: 'cleanup',
    RUNNER_TEMP: path.dirname(root),
  };
  fs.symlinkSync(path.resolve(__dirname, '..'), path.join(root, 'scripts'), 'dir');
  const shell = ['-e', '-o', 'pipefail', '-c', cleanupStep('Verify live HTML and process candidates')];
  return { root, sha, summary, script, local, dispatch, shell };
}

test('the rebuild reads the deployed values of all four inputs after rotation', t => {
  const { root, script, local } = dispatchFixture(t);
  const metadata = path.join(root, 'metadata');
  const checkout = path.join(path.dirname(root), 'source');
  execFileSync('git', ['clone', '--quiet', root, checkout]);
  const expected = {
    LEAD_API_URL: 'https://deployed.invalid/lead',
    SCHEDULE_API_URL: 'https://deployed.invalid/schedule',
    TRAFFIC_API_URL: 'https://deployed.invalid/traffic',
    Y_MAPS_API_KEY: 'deployed-key',
  };
  const observed = path.join(root, 'fixture-inputs.json');
  fs.writeFileSync(
    path.join(root, 'docker'),
    [
      '#!/usr/bin/env node',
      'const fs = require("node:fs"); fs.readFileSync(0);',
      'const names = ' + JSON.stringify(Object.keys(expected)) + ';',
      'fs.writeFileSync(process.env.FIXTURE_INPUTS, JSON.stringify(Object.fromEntries(names.map(k => [k,process.env[k]]))));',
    ].join('\n'),
    { mode: 0o755 },
  );
  const rebuild = () => {
    const output = execFileSync(process.execPath, [script, '--rebuild', checkout], {
      cwd: root,
      env: { ...local, FIXTURE_INPUTS: observed, Y_MAPS_API_KEY: 'new-value', LEAD_API_URL: 'https://current.invalid' },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    assert.equal(output, '');
    fs.rmdirSync(path.join(checkout, 'dist')); // the inert Docker command leaves an empty mount point
    return JSON.parse(fs.readFileSync(observed));
  };
  assert.deepEqual(rebuild(), expected);
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/cleanup-assets.yml'), 'utf8');
  assert.doesNotMatch(
    workflow,
    /vars\.Y_MAPS_API_KEY|yc serverless function get|https:\/\/staging\.zvenfit\.ru\/api\//,
  );

  const map = path.join(root, 'dist/js/maps-config.js');
  fs.writeFileSync(map, 'window.ZVENFIT_MAPS = {"apiKey":""};\n');
  assert.throws(rebuild, /configs differ from the release metadata/);
  // Old SHA/version-only stamps can still reconstruct a dry-run, including an empty maps key.
  const stamp = JSON.parse(fs.readFileSync(metadata));
  delete stamp.Metadata['runtime-config-sha256'];
  fs.writeFileSync(metadata, JSON.stringify(stamp));
  assert.deepEqual(rebuild(), { ...expected, Y_MAPS_API_KEY: '' });
  fs.writeFileSync(path.join(root, 'dist/js/traffic-config.js'), 'window.ZVENFIT_TRAFFIC_API = getUrl();\n');
  assert.throws(rebuild, /Invalid public runtime config: js\/traffic-config.js/);
  assert.ok(!fs.existsSync(path.join(root, 'removed')));
});

test('planning verifies rebuilt configs and matching stamps on every page, preserving legacy dry-run', t => {
  const stale = object('_astro/stale.png');
  const box = fixture(t, [stale]);
  const legacy = { sha: release.sha, version: release.version };
  const read = box.client.readHtml;
  box.client.readHtml = key => ({ ...read(key), release: key === '404.html' ? legacy : release });
  for (const execute of [false, true]) assert.throws(() => box.run(execute), /Mixed deployment on 404.html/);
  box.client.readHtml = read;
  fs.writeFileSync(path.join(box.root, 'dist/js/maps-config.js'), 'window.ZVENFIT_MAPS = {"apiKey":"new"};\n');
  for (const execute of [false, true])
    assert.throws(() => box.run(execute), /configs differ from the release metadata/);
  box.client.deployment = () => legacy;
  box.client.readHtml = key => ({ ...read(key), release: legacy });
  assert.throws(() => box.run(true), /Missing runtime config digest/);
  assert.deepEqual(box.reports, []);
  assert.deepEqual(box.run(), [stale]);
  assert.deepEqual(box.removed, []);
});

test('the CLI only reads and the dispatch step deletes exactly the verified candidates on execute', t => {
  const { root, sha, summary, script, local, dispatch, shell } = dispatchFixture(t);
  function refused(target, env, error) {
    const result = spawnSync(process.execPath, [script, target], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, error);
  }
  // Even a shell with a copy of the job environment cannot pass a local dist for execute.
  refused(root, { ...local, CLEANUP_EXECUTE: 'true' }, /Local cleanup is dry-run only/);
  refused(root, dispatch, /Local cleanup is dry-run only/);
  refused('--workflow', { ...local, CLEANUP_EXECUTE: 'true' }, /requires the manual cleanup job/);
  refused('--workflow', dispatch, /requires the manual cleanup job/);
  assert.equal(fs.existsSync(path.join(root, 'calls')), false);

  const cli = (...args) =>
    execFileSync(process.execPath, [script, ...args], { cwd: root, env: local, encoding: 'utf8' });
  assert.equal(cli('--deployment'), `sha=${sha}\nversion=175\n`);
  cli(root);
  assert.deepEqual(fs.readFileSync(path.join(root, 'calls'), 'utf8').trim().split('\n'), [
    'head-object',
    'head-object',
    'list-objects-v2',
    ...Object.keys(runtime).map(() => 'get-object'),
    'get-object',
    'get-object',
    'get-object',
  ]);
  assert.match(fs.readFileSync(summary, 'utf8'), /<code>_astro\/stale\.js<\/code>/);

  // Importing the planner with the dispatch environment still only computes keys.
  const readOnly = execFileSync(
    process.execPath,
    ['-e', 'const plan = require(process.argv[1]).planForWorkflow(); console.log(JSON.stringify(plan));', script],
    { cwd: root, env: dispatch, encoding: 'utf8' },
  );
  assert.deepEqual(JSON.parse(readOnly.trim().split('\n').at(-1)), {
    bucket: 'zvenfit-frontend-staging',
    execute: true,
    keys: ['_astro/stale.js'],
  });
  assert.equal(fs.existsSync(path.join(root, 'removed')), false);

  for (const change of [
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_JOB: 'quality' },
    { GITHUB_WORKFLOW_REF: dispatch.GITHUB_WORKFLOW_REF.replace('main', 'other') },
    { RUNNER_TEMP: '' },
  ]) {
    const rejected = spawnSync('bash', shell, { cwd: root, env: { ...dispatch, ...change }, encoding: 'utf8' });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /requires the manual cleanup job/);
  }
  execFileSync('bash', shell, { cwd: root, env: { ...dispatch, CLEANUP_EXECUTE: 'false' } });
  assert.equal(fs.existsSync(path.join(root, 'removed')), false);
  execFileSync('bash', shell, { cwd: root, env: dispatch });
  assert.deepEqual(fs.readFileSync(path.join(root, 'removed'), 'utf8').trim().split('\n'), ['_astro/stale.js']);
  assert.match(fs.readFileSync(summary, 'utf8'), /Confirmed deletions: 1 of 1/);
});

test('a stale dispatch can repeat a dry-run but only the current main policy can delete', t => {
  const { root, dispatch, shell, summary } = dispatchFixture(t);
  const futureMain = 'b'.repeat(40);
  const run = overrides =>
    spawnSync('bash', shell, { cwd: root, env: { ...dispatch, ...overrides }, encoding: 'utf8' });
  const dry = run({ STUB_MAIN_SHA: 'unavailable', CLEANUP_EXECUTE: 'false' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(fs.readFileSync(summary, 'utf8'), /_astro\/stale\.js/);
  assert.ok(!fs.existsSync(path.join(root, 'gh-calls')));
  for (const head of [futureMain, 'unavailable', 'invalid']) {
    const result = run({ STUB_MAIN_SHA: head });
    assert.notEqual(result.status, 0);
    assert.ok(!fs.existsSync(path.join(root, 'removed')));
  }
  assert.equal(fs.readFileSync(path.join(root, 'gh-calls'), 'utf8'), 'main\nmain\nmain\n');
  // The current policy may clean a site which is still serving the previous release.
  const current = run({ GITHUB_SHA: futureMain, STUB_MAIN_SHA: futureMain });
  assert.equal(current.status, 0, current.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'removed'), 'utf8'), '_astro/stale.js\n');
});

test('an interrupted execute preserves the last confirmed count and key before starting the next delete', t => {
  const keys = ['_astro/first.js', '_astro/second.js', '_astro/third.js'];
  const { root, dispatch, shell, summary } = dispatchFixture(
    t,
    keys.map(key => object(key)),
  );
  const interrupted = spawnSync('bash', shell, {
    cwd: root,
    env: { ...dispatch, STUB_CANCEL_ON: keys[1] },
    encoding: 'utf8',
  });
  assert.ok(interrupted.signal === 'SIGTERM' || interrupted.status === 143, interrupted.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'removed'), 'utf8'), keys[0] + '\n');
  assert.match(interrupted.stdout, /Confirmed deletion 1\/3: "_astro\/first.js"/);
  assert.doesNotMatch(interrupted.stdout, /Confirmed deletion 2\/3/);
  assert.deepEqual(fs.readFileSync(summary, 'utf8').match(/Confirmed deletions: .*/g), [
    'Confirmed deletions: 1 of 3.',
  ]);
  const remaining = execFileSync('bash', shell, {
    cwd: root,
    env: { ...dispatch, CLEANUP_EXECUTE: 'false' },
    encoding: 'utf8',
  });
  assert.match(remaining, /Candidates: \*\*2\*\*/);
  assert.ok(!remaining.includes(keys[0]));
  assert.ok(remaining.includes(keys[1]) && remaining.includes(keys[2]));
});

test('a candidate table over the UTF-8 summary limit remains complete in the linked attempt log', t => {
  const objects = Array.from({ length: 9000 }, (_, i) =>
    object('_astro/' + 'я'.repeat(30) + String(i).padStart(5, '0') + '.css', old, 2),
  );
  const { root, dispatch, shell, summary } = dispatchFixture(t, objects);
  const output = execFileSync('bash', shell, {
    cwd: root,
    env: { ...dispatch, CLEANUP_EXECUTE: 'false' },
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.ok(output.length < 1024 * 1024 && Buffer.byteLength(output) > 1024 * 1024);
  const listed = [...output.matchAll(/<code>([^<]+)<\/code>/g)].map(m => m[1]);
  assert.deepEqual(
    listed,
    objects.map(o => o.Key),
  );
  const compact = fs.readFileSync(summary, 'utf8');
  assert.ok(Buffer.byteLength(compact) < 1024 * 1024 - 128);
  assert.match(compact, /Candidates: \*\*9000\*\* · Total bytes: \*\*18000\*\*/);
  assert.match(compact, /LastModified strictly before/);
  assert.ok(compact.includes('[job log](' + dispatch.CLEANUP_JOB_URL + ')'));
  assert.equal(fs.existsSync(path.join(root, 'removed')), false);
});

test('concurrent ephemeral sessions use a bucket prefix for reads and grant delete only for execute', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-session-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, 'curl'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const argument = name => process.argv[process.argv.indexOf(name) + 1];
const request = JSON.parse(fs.readFileSync(argument('--data-binary').slice(1), 'utf8'));
fs.writeFileSync(process.env.POLICY_CAPTURE, request.policy);
fs.writeFileSync(argument('--output'), JSON.stringify({accessKeyId:'fixture',secret:'fixture',sessionToken:'fixture'}));
process.stdout.write('200');`,
    { mode: 0o755 },
  );
  const sessions = [
    ['cleanup-plan', 'zvenfit-frontend'],
    ['cleanup-execute', 'zvenfit-frontend-staging'],
  ];
  await Promise.all(
    sessions.map(async ([mode, bucket]) => {
      const capture = path.join(dir, mode + '.json');
      await promisify(execFile)('bash', [path.join(__dirname, '../issue-ephemeral-storage-key.sh')], {
        cwd: dir,
        env: {
          PATH: dir + path.delimiter + process.env.PATH,
          YC_IAM_TOKEN: 'fixture',
          YC_DEPLOY_SERVICE_ACCOUNT_ID: 'fixture',
          STORAGE_SESSION_MODE: mode,
          OBJECT_STORAGE_BUCKET: bucket,
          TMPDIR: dir,
          GITHUB_ENV: path.join(dir, mode + '.env'),
          POLICY_CAPTURE: capture,
        },
      });
      const { Statement } = JSON.parse(fs.readFileSync(capture, 'utf8'));
      const arn = 'arn:aws:s3:::' + bucket;
      const grant = (action, resource) => ({ Effect: 'Allow', Principal: '*', Action: [action], Resource: [resource] });
      const expected = [grant('s3:ListBucket', arn), grant('s3:GetObject', arn + '/*')];
      if (mode === 'cleanup-execute') expected.push(grant('s3:DeleteObject', arn + '/_astro/*'));
      assert.deepEqual(Statement, expected);
    }),
  );
});
