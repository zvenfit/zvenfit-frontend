'use strict';

// The site stylesheet leaves the Astro build exactly as the legacy build made
// it: clean-css level 2 over the source, as minifySiteCss of the retired
// scripts/build-static.cjs did (compare-dist holds the built bytes against the
// legacy base). Vite's own minifier is switched off in astro.config.mjs,
// because Astro builds with the `esnext` target and lightningcss then rewrites
// `(max-width: 767px)` into the range form `(width<=767px)`. Safari before 16.4
// and Chrome before 104 drop such a query entirely, so every breakpoint of the
// site would stop applying there. Every other stylesheet is emitted unminified,
// which is what the legacy build did by copying public/css.

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const CleanCSS = require('clean-css');

const SITE_STYLESHEET = 'zvenfit.webflow.css';
const BUILT_SITE_STYLESHEET = /^zvenfit\.webflow\.[A-Za-z0-9_-]+\.css$/;

// Vite names the built file after the source bytes, and the file is served as
// immutable. A clean-css release with a different output would keep the name
// and never reach visitors who already have the file. The version is pinned so
// that such a change cannot ride in with a lock file update: whoever changes
// it, or the options below, decides about the cached copies in the same step.
const CLEAN_CSS_VERSION = '5.3.3';

function assertMinifierVersion(installed = require('clean-css/package.json').version) {
  if (installed !== CLEAN_CSS_VERSION) {
    throw new Error(
      `site-css: clean-css ${installed} is installed, ${CLEAN_CSS_VERSION} is expected. Its output decides the bytes of ` +
        'an immutable file whose name does not change with the minifier; update CLEAN_CSS_VERSION together with a plan for cached copies',
    );
  }
}

function minifySiteCss(source) {
  assertMinifierVersion();
  const result = new CleanCSS({ level: 2 }).minify(source);
  if (result.errors.length > 0) {
    throw new Error(`CSS minify failed: ${result.errors.join(', ')}`);
  }
  return result.styles;
}

function builtSiteStylesheets(assetsDir) {
  if (!fs.existsSync(assetsDir)) {
    return [];
  }
  return fs
    .readdirSync(assetsDir)
    .filter(name => BUILT_SITE_STYLESHEET.test(name))
    .sort();
}

// Media queries written in the range syntax of Media Queries Level 4, in
// `@media` rules and in the media list of `@import`. Comments and strings are
// removed first, so that `/* widths < 768 */` or `content: ">"` do not count.
function mediaRangeQueries(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, match =>
    match[0] === '/' ? ' ' : '""',
  );
  const found = [];
  for (const [, name, prelude] of code.matchAll(/@(media|import)\b([^{;]*)/gi)) {
    if (/[<>]/.test(prelude)) {
      found.push(`@${name.toLowerCase()} ${prelude.replace(/\s+/g, ' ').trim()}`);
    }
  }
  return [...new Set(found)];
}

// Replaces what Vite emitted for the site stylesheet with the minification of
// its source. The emitted bytes are not trusted as input: Vite may hoist
// `@import` and `@charset` even with its minifier off, and the legacy build
// minified the source file itself.
function minifyBuiltSiteCss({ assetsDir, sourcePath }) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const minified = minifySiteCss(source);
  const written = [];
  for (const name of builtSiteStylesheets(assetsDir)) {
    const file = path.join(assetsDir, name);
    const built = fs.readFileSync(file, 'utf8');
    if (built === minified) {
      continue;
    }
    fs.writeFileSync(file, minified, 'utf8');
    written.push({ name, emittedAsSource: built === source });
  }
  return written;
}

function siteCssIntegration({ sourcePath = path.join(__dirname, '..', '..', 'src', 'styles', SITE_STYLESHEET) } = {}) {
  let assets = '_astro';
  return {
    name: 'zvenfit:site-css',
    hooks: {
      'astro:config:done': ({ config }) => {
        assets = config.build.assets;
      },
      'astro:build:done': ({ dir, logger }) => {
        const written = minifyBuiltSiteCss({ assetsDir: path.join(fileURLToPath(dir), assets), sourcePath });
        for (const { name, emittedAsSource } of written) {
          logger.info(`${name}: minified with clean-css level 2, as the legacy build`);
          if (!emittedAsSource) {
            logger.warn(
              `${name}: Vite had changed the stylesheet before this step; check vite.build.cssMinify and the build target`,
            );
          }
        }
      },
    },
  };
}

module.exports = {
  BUILT_SITE_STYLESHEET,
  CLEAN_CSS_VERSION,
  SITE_STYLESHEET,
  assertMinifierVersion,
  builtSiteStylesheets,
  mediaRangeQueries,
  minifyBuiltSiteCss,
  minifySiteCss,
  siteCssIntegration,
};
