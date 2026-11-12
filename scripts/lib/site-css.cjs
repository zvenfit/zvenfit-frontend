'use strict';

// The site stylesheet leaves the Astro build exactly as the legacy build made
// it: clean-css level 2 over the source (scripts/build-static.cjs,
// minifySiteCss). Vite's own minifier is switched off in astro.config.mjs,
// because Astro builds with the `esnext` target and lightningcss then rewrites
// `(max-width: 767px)` into the range form `(width<=767px)`. Safari before 16.4
// and Chrome before 104 drop such a query entirely, so every breakpoint of the
// site would stop applying there. Every other stylesheet is emitted as its
// source, which is what the legacy build did by copying public/css.

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const CleanCSS = require('clean-css');

const SITE_STYLESHEET = 'zvenfit.webflow.css';
const BUILT_SITE_STYLESHEET = /^zvenfit\.webflow\.[A-Za-z0-9_-]+\.css$/;
const MEDIA_RANGE_QUERY = /@media[^{]*[<>][^{]*/g;

function minifySiteCss(source) {
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

// Media queries written in the range syntax of Media Queries Level 4.
function mediaRangeQueries(css) {
  return [...new Set((css.match(MEDIA_RANGE_QUERY) || []).map(query => query.trim()))];
}

// Replaces the unminified copy that Vite emitted with the legacy minification.
// Anything other than the source bytes or the finished result means that the
// build changed the stylesheet on its own, and that must not pass silently.
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
    if (built !== source) {
      throw new Error(
        `site-css: ${name} is neither a copy of ${path.basename(sourcePath)} nor its clean-css output; ` +
          'keep vite.build.cssMinify false and leave build.cssTarget unset in astro.config.mjs',
      );
    }
    fs.writeFileSync(file, minified, 'utf8');
    written.push(name);
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
        for (const name of written) {
          logger.info(`${name}: minified with clean-css level 2, as the legacy build`);
        }
      },
    },
  };
}

module.exports = {
  BUILT_SITE_STYLESHEET,
  SITE_STYLESHEET,
  builtSiteStylesheets,
  mediaRangeQueries,
  minifyBuiltSiteCss,
  minifySiteCss,
  siteCssIntegration,
};
