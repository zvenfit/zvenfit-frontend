'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const CleanCSS = require('clean-css');

const { builtSiteStylesheets, mediaRangeQueries, minifyBuiltSiteCss, minifySiteCss, siteCssIntegration } = require('../lib/site-css.cjs');

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

test('the legacy build still minifies with the same options while it exists', () => {
  const legacy = path.join(ROOT, 'scripts/build-static.cjs');
  if (fs.existsSync(legacy)) {
    assert.ok(fs.readFileSync(legacy, 'utf8').includes('new CleanCSS({ level: 2 }).minify(source)'));
  }
});

test('range media queries are recognised, classic ones are not', () => {
  assert.deepEqual(mediaRangeQueries('@media screen and (width<=767px){.a{color:red}}'), ['@media screen and (width<=767px)']);
  assert.deepEqual(mediaRangeQueries('@media (400px<=width<=700px){.a{color:red}}@media (width>=992px){.b{color:red}}'), ['@media (400px<=width<=700px)', '@media (width>=992px)']);
  assert.deepEqual(mediaRangeQueries('@media screen and (max-width:767px){.a>.b{color:red}}@media (prefers-reduced-motion:reduce){.c{color:red}}'), []);
});

test('only the unminified copy of the site stylesheet is rewritten', () => {
  const minified = minifySiteCss(SAMPLE);
  const { assetsDir, sourcePath } = assetsFixture({
    'zvenfit.webflow.Ab12Cd34.css': SAMPLE,
    'klubnaya-karta.v1.Ef56Gh78.css': SAMPLE,
    'analytics.Ij90Kl12.js': 'track();',
  });
  assert.deepEqual(builtSiteStylesheets(assetsDir), ['zvenfit.webflow.Ab12Cd34.css']);
  assert.deepEqual(minifyBuiltSiteCss({ assetsDir, sourcePath }), ['zvenfit.webflow.Ab12Cd34.css']);
  assert.equal(fs.readFileSync(path.join(assetsDir, 'zvenfit.webflow.Ab12Cd34.css'), 'utf8'), minified);
  assert.equal(fs.readFileSync(path.join(assetsDir, 'klubnaya-karta.v1.Ef56Gh78.css'), 'utf8'), SAMPLE);
  assert.deepEqual(minifyBuiltSiteCss({ assetsDir, sourcePath }), [], 'a finished file is left alone');
  assert.equal(fs.readFileSync(path.join(assetsDir, 'zvenfit.webflow.Ab12Cd34.css'), 'utf8'), minified);
  assert.deepEqual(builtSiteStylesheets(path.join(assetsDir, 'missing')), []);
});

test('a stylesheet changed by the build itself stops the build', () => {
  const { assetsDir, sourcePath } = assetsFixture({ 'zvenfit.webflow.Ab12Cd34.css': '.menu{display:flex}@media screen and (width<=767px){.menu{display:none}}' });
  assert.throws(() => minifyBuiltSiteCss({ assetsDir, sourcePath }), /neither a copy of zvenfit\.webflow\.css nor its clean-css output/);
});

test('the integration minifies in the configured assets directory after the build', () => {
  const { assetsDir, dir, sourcePath } = assetsFixture({});
  fs.renameSync(assetsDir, path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'zvenfit.webflow.Ab12Cd34.css'), SAMPLE);
  const integration = siteCssIntegration({ sourcePath });
  const messages = [];
  assert.equal(integration.name, 'zvenfit:site-css');
  integration.hooks['astro:config:done']({ config: { build: { assets: 'assets' } } });
  integration.hooks['astro:build:done']({ dir: pathToFileURL(dir + path.sep), logger: { info: message => messages.push(message) } });
  assert.equal(fs.readFileSync(path.join(dir, 'assets', 'zvenfit.webflow.Ab12Cd34.css'), 'utf8'), minifySiteCss(SAMPLE));
  assert.equal(messages.length, 1);
  assert.match(messages[0], /zvenfit\.webflow\.Ab12Cd34\.css/);
});
