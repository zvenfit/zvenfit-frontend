'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const CleanCSS = require('clean-css');

const {
  CLEAN_CSS_VERSION,
  assertMinifierVersion,
  builtSiteStylesheets,
  mediaRangeQueries,
  minifyBuiltSiteCss,
  minifySiteCss,
  siteCssIntegration,
} = require('../lib/site-css.cjs');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'src/styles/zvenfit.webflow.css'), 'utf8');
const SAMPLE = '.menu { display: flex; }\n@media screen and (max-width: 767px) {\n  .menu { display: none; }\n}\n';

function assetsFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-css-'));
  const assetsDir = path.join(dir, '_astro');
  fs.mkdirSync(assetsDir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(assetsDir, name), content);
  }
  const sourcePath = path.join(dir, 'zvenfit.webflow.css');
  fs.writeFileSync(sourcePath, SAMPLE);
  return { assetsDir, dir, sourcePath };
}

test('the site stylesheet is minified as the legacy build did and keeps classic media queries', () => {
  const minified = minifySiteCss(SOURCE);
  assert.equal(minified, new CleanCSS({ level: 2 }).minify(SOURCE).styles);
  assert.ok(minified.length < SOURCE.length);
  assert.ok((minified.match(/@media/g) || []).length >= 30);
  assert.deepEqual(mediaRangeQueries(minified), []);
  assert.match(minified, /@media screen and \(max-width:767px\)/);
});

test('the source has no byte order mark: clean-css would drop the font import behind it', () => {
  assert.notEqual(SOURCE.charCodeAt(0), 0xfeff);
  assert.match(minifySiteCss(SOURCE), /^@import url\(/);
});

test('the minifier version is pinned, because the built file name does not follow its output', () => {
  assert.equal(require('clean-css/package.json').version, CLEAN_CSS_VERSION);
  assert.doesNotThrow(() => assertMinifierVersion());
  assert.throws(() => assertMinifierVersion('5.3.4'), /clean-css 5\.3\.4 is installed, 5\.3\.3 is expected/);
});

// Vacuous once A2b deletes the legacy build; until then it keeps both pipelines aligned.
test('the legacy build still minifies with the same options while it exists', () => {
  const legacy = path.join(ROOT, 'scripts/build-static.cjs');
  if (fs.existsSync(legacy)) {
    assert.ok(fs.readFileSync(legacy, 'utf8').includes('new CleanCSS({ level: 2 }).minify(source)'));
  }
});

test('the Astro config keeps Vite away from the stylesheets', () => {
  const config = fs.readFileSync(path.join(ROOT, 'astro.config.mjs'), 'utf8');
  assert.match(config, /cssMinify:\s*false/);
  assert.match(config, /integrations:\s*\[[^\]]*siteCss\.siteCssIntegration\(\)/);
  // A CSS target, or a browser build target it falls back to, makes Astro run lightningcss on its own.
  assert.doesNotMatch(config, /\bcssTarget\b|\btarget\s*:/);
});

test('range media queries are recognised in @media and @import, in any letter case', () => {
  assert.deepEqual(mediaRangeQueries('@media screen and (width<=767px){.a{color:red}}'), ['@media screen and (width<=767px)']);
  assert.deepEqual(mediaRangeQueries('@media (400px<=width<=700px){.a{color:red}}@media (width>=992px){.b{color:red}}'), ['@media (400px<=width<=700px)', '@media (width>=992px)']);
  assert.deepEqual(mediaRangeQueries('@MEDIA (width>=992px){.a{color:red}}'), ['@media (width>=992px)']);
  assert.deepEqual(mediaRangeQueries('@import url("print.css") screen and (width<=767px);.a{color:red}'), ['@import url("") screen and (width<=767px)']);
});

test('classic queries, comments, strings and child combinators are not mistaken for range queries', () => {
  assert.deepEqual(mediaRangeQueries('@media screen and (max-width:767px){.a>.b{color:red}}@media (prefers-reduced-motion:reduce){.c{color:red}}'), []);
  assert.deepEqual(mediaRangeQueries('/* @media fallback for widths < 768 */ .a{color:red}'), []);
  assert.deepEqual(mediaRangeQueries('.a{content:"@media"}.b>.c{color:red}'), []);
  assert.deepEqual(mediaRangeQueries("@media /* a > b */ screen{.a{content:'>'}}"), []);
  assert.deepEqual(mediaRangeQueries('@supports (display:grid){.a>.b{color:red}}'), []);
});

test('the built site stylesheet becomes the minification of the source, other files stay', () => {
  const minified = minifySiteCss(SAMPLE);
  const { assetsDir, sourcePath } = assetsFixture({
    'zvenfit.webflow.Ab12Cd34.css': SAMPLE,
    'klubnaya-karta.v1.Ef56Gh78.css': SAMPLE,
    'analytics.Ij90Kl12.js': 'track();',
  });
  assert.deepEqual(builtSiteStylesheets(assetsDir), ['zvenfit.webflow.Ab12Cd34.css']);
  assert.deepEqual(minifyBuiltSiteCss({ assetsDir, sourcePath }), [{ name: 'zvenfit.webflow.Ab12Cd34.css', emittedAsSource: true }]);
  assert.equal(fs.readFileSync(path.join(assetsDir, 'zvenfit.webflow.Ab12Cd34.css'), 'utf8'), minified);
  assert.equal(fs.readFileSync(path.join(assetsDir, 'klubnaya-karta.v1.Ef56Gh78.css'), 'utf8'), SAMPLE);
  assert.equal(fs.readFileSync(path.join(assetsDir, 'analytics.Ij90Kl12.js'), 'utf8'), 'track();');
  assert.deepEqual(minifyBuiltSiteCss({ assetsDir, sourcePath }), [], 'a finished file is left alone');
  assert.equal(fs.readFileSync(path.join(assetsDir, 'zvenfit.webflow.Ab12Cd34.css'), 'utf8'), minified);
  assert.deepEqual(builtSiteStylesheets(path.join(assetsDir, 'missing')), []);
});

test('whatever Vite emitted, the result comes from the source file', () => {
  // Vite hoists @import and @charset even with its minifier off, and a re-enabled
  // minifier would emit range queries: neither may reach the built file.
  const processed = '.menu{display:flex}@media screen and (width<=767px){.menu{display:none}}';
  const { assetsDir, sourcePath } = assetsFixture({ 'zvenfit.webflow.Ab12Cd34.css': processed });
  assert.deepEqual(minifyBuiltSiteCss({ assetsDir, sourcePath }), [{ name: 'zvenfit.webflow.Ab12Cd34.css', emittedAsSource: false }]);
  const built = fs.readFileSync(path.join(assetsDir, 'zvenfit.webflow.Ab12Cd34.css'), 'utf8');
  assert.equal(built, minifySiteCss(SAMPLE));
  assert.deepEqual(mediaRangeQueries(built), []);
});

test('the integration minifies in the configured assets directory and warns about a processed file', () => {
  const { assetsDir, dir, sourcePath } = assetsFixture({});
  fs.renameSync(assetsDir, path.join(dir, 'assets'));
  const built = path.join(dir, 'assets', 'zvenfit.webflow.Ab12Cd34.css');
  const integration = siteCssIntegration({ sourcePath });
  assert.equal(integration.name, 'zvenfit:site-css');
  integration.hooks['astro:config:done']({ config: { build: { assets: 'assets' } } });

  const run = content => {
    fs.writeFileSync(built, content);
    const messages = { info: [], warn: [] };
    integration.hooks['astro:build:done']({
      dir: pathToFileURL(dir + path.sep),
      logger: { info: message => messages.info.push(message), warn: message => messages.warn.push(message) },
    });
    assert.equal(fs.readFileSync(built, 'utf8'), minifySiteCss(SAMPLE));
    return messages;
  };
  const copied = run(SAMPLE);
  assert.equal(copied.info.length, 1);
  assert.match(copied.info[0], /zvenfit\.webflow\.Ab12Cd34\.css/);
  assert.deepEqual(copied.warn, []);
  const processed = run('.menu{display:flex}');
  assert.equal(processed.warn.length, 1);
  assert.match(processed.warn[0], /cssMinify/);
  assert.deepEqual(run(minifySiteCss(SAMPLE)), { info: [], warn: [] });
});
