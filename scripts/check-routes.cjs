'use strict';

// Guard that runs against the exact dist/ that is about to be uploaded.
// It proves the artifact is complete before the first `aws s3 sync`:
// the HTML route set equals the source route set, the indexable routes
// equal sitemap.xml, every runtime config and crawl file exists, and every
// local /js, /css and /_astro reference resolves inside dist/. An empty or
// partial build must never reach the bucket.
//
// Sources: `--source astro` (src/pages plus the trainer collection) for the
// deploy profiles `a` and `b`, `--source public` for `legacy`. The partial
// parity profile `--profile a1` is allowed only inside branch A1 and must never
// be passed by a deploy workflow: the deploy test asserts the guard runs with
// the defaults from scripts/deploy.config.json.

const fs = require('node:fs');
const path = require('node:path');

const { getProfile } = require('./lib/parity-profile.cjs');

const ROOT_DIR = path.join(__dirname, '..');
const DEPLOY_CONFIG_PATH = path.join(__dirname, 'deploy.config.json');
const STRUCTURED_DATA_PATH = path.join(__dirname, 'structured-data.config.json');

const REQUIRED_FILES = [
  'robots.txt',
  'sitemap.xml',
  'js/lead-config.js',
  'js/schedule-config.js',
  'js/traffic-config.js',
  'js/maps-config.js',
];
const NOT_INDEXABLE = new Set(['404.html']);
const SOURCES_BY_PROFILE = { legacy: 'public', a: 'astro', b: 'astro' };

function walkFiles(dir, predicate, files = [], base = dir) {
  if (!fs.existsSync(dir)) {
    return files;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, files, base);
    } else if (entry.isFile() && predicate(entry.name)) {
      files.push(path.relative(base, fullPath).split(path.sep).join('/'));
    }
  }
  return files;
}

function listHtml(dir) {
  return walkFiles(dir, name => name.endsWith('.html')).sort();
}

function routeToUrl(siteUrl, relativePath) {
  if (relativePath === 'index.html') {
    return `${siteUrl}/`;
  }
  if (relativePath.endsWith('/index.html')) {
    return `${siteUrl}/${relativePath.slice(0, -'index.html'.length)}`;
  }
  return `${siteUrl}/${relativePath}`;
}

function readSitemapLocations(sitemapPath) {
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  return Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g), match => match[1]).sort();
}

function readLocalReferences(html) {
  const references = new Set();
  for (const match of html.matchAll(/\b(?:src|href)=["'](\/(?:js|css|_astro)\/[^"'?#]+)/g)) {
    references.add(match[1]);
  }
  return references;
}

function diffSets(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter(item => !actualSet.has(item)),
    unexpected: actual.filter(item => !expectedSet.has(item)),
  };
}

function readProfile(configPath = DEPLOY_CONFIG_PATH) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!SOURCES_BY_PROFILE[config.profile]) {
    throw new Error(`check-routes: unknown deploy profile "${config.profile}" in ${configPath}`);
  }
  return config.profile;
}

function expectedRoutesFromPublic(publicDir) {
  const routes = listHtml(publicDir);
  if (routes.length === 0) {
    throw new Error(`check-routes: no HTML pages found in ${publicDir}`);
  }
  return routes;
}

// src/pages/offer/index.astro -> offer/index.html, src/pages/404.astro -> 404.html,
// src/pages/foo.astro -> foo/index.html (build.format "directory"). Files and
// directories starting with "_" are private and dynamic routes ([slug].astro)
// come from the trainer collection instead.
function astroPageToRoute(relativePath) {
  const stem = relativePath.replace(/\.astro$/, '');
  if (stem === 'index') {
    return 'index.html';
  }
  if (stem === '404') {
    return '404.html';
  }
  return `${stem.replace(/\/index$/, '')}/index.html`;
}

function expectedRoutesFromAstro(pagesDir, contentDir) {
  const pages = walkFiles(pagesDir, name => name.endsWith('.astro')).filter(
    file => !file.split('/').some(segment => segment.startsWith('_')) && !/\[[^\]]+\]/.test(file),
  );
  const routes = pages.map(astroPageToRoute);
  const trainersDir = path.join(contentDir, 'trainers');
  if (fs.existsSync(trainersDir)) {
    for (const entry of fs.readdirSync(trainersDir).filter(name => name.endsWith('.json')).sort()) {
      routes.push(`trenery/${entry.replace(/\.json$/, '')}/index.html`);
    }
  }
  if (routes.length === 0) {
    throw new Error(`check-routes: no Astro pages found in ${pagesDir}`);
  }
  const duplicates = routes.filter((route, index) => routes.indexOf(route) !== index);
  if (duplicates.length > 0) {
    throw new Error(`check-routes: Astro sources produce the same route twice: ${duplicates.join(', ')}`);
  }
  return routes.sort();
}

function verifyDist({ distDir, expectedRoutes, siteUrl, requires404 = true }) {
  const errors = [];
  const distRoutes = listHtml(distDir);

  if (!fs.existsSync(distDir) || fs.readdirSync(distDir).length === 0) {
    errors.push('dist is empty');
    return { errors, stats: { routes: 0, indexable: 0, references: 0 } };
  }

  if (requires404 && !expectedRoutes.includes('404.html')) {
    errors.push('sources define no 404.html route');
  }

  const routeDiff = diffSets(expectedRoutes, distRoutes);
  for (const route of routeDiff.missing) {
    errors.push(`missing route ${route}`);
  }
  for (const route of routeDiff.unexpected) {
    errors.push(`unexpected route ${route}`);
  }

  const indexable = expectedRoutes.filter(route => !NOT_INDEXABLE.has(route)).map(route => routeToUrl(siteUrl, route)).sort();
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const sitemapDiff = diffSets(indexable, readSitemapLocations(sitemapPath));
    for (const url of sitemapDiff.missing) {
      errors.push(`sitemap.xml lacks ${url}`);
    }
    for (const url of sitemapDiff.unexpected) {
      errors.push(`sitemap.xml lists ${url} without a page`);
    }
  }

  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(distDir, file))) {
      errors.push(`missing required file ${file}`);
    }
  }

  let references = 0;
  for (const route of distRoutes) {
    const html = fs.readFileSync(path.join(distDir, route), 'utf8');
    for (const reference of readLocalReferences(html)) {
      references += 1;
      if (!fs.existsSync(path.join(distDir, reference.slice(1)))) {
        errors.push(`${route} references ${reference}, which is not in dist`);
      }
    }
  }

  return { errors, stats: { routes: distRoutes.length, indexable: indexable.length, references } };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith('--')) {
      options[argument.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function run(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const deployProfile = readProfile();
  const source = options.source || SOURCES_BY_PROFILE[deployProfile];
  const parity = getProfile(options.profile || (deployProfile === 'legacy' ? 'a' : deployProfile));
  const distDir = path.resolve(ROOT_DIR, options.dist || 'dist');
  const siteUrl = options.site || JSON.parse(fs.readFileSync(STRUCTURED_DATA_PATH, 'utf8')).siteUrl;

  let expectedRoutes;
  if (source === 'astro') {
    expectedRoutes = expectedRoutesFromAstro(
      path.resolve(ROOT_DIR, options.pages || 'src/pages'),
      path.resolve(ROOT_DIR, options.content || 'src/content'),
    );
  } else if (source === 'public') {
    expectedRoutes = expectedRoutesFromPublic(path.resolve(ROOT_DIR, options.public || 'public'));
  } else {
    throw new Error(`check-routes: unknown source "${source}"`);
  }

  if (parity.partial) {
    const missing = parity.pages.filter(page => !expectedRoutes.includes(page));
    if (missing.length > 0) {
      throw new Error(`check-routes: partial profile ${parity.name} expects sources for ${missing.join(', ')}`);
    }
    const extra = expectedRoutes.filter(route => !parity.pages.includes(route));
    if (extra.length > 0) {
      throw new Error(`check-routes: partial profile ${parity.name} does not cover ${extra.join(', ')}; switch to the full profile`);
    }
  }

  const { errors, stats } = verifyDist({ distDir, expectedRoutes, siteUrl, requires404: parity.requires404 });

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`check-routes: ${error}`);
    }
    throw new Error(`check-routes: ${errors.length} problem(s) in ${path.relative(ROOT_DIR, distDir) || 'dist'}; refusing to upload`);
  }

  console.log(
    `check-routes: ${stats.routes} HTML route(s), ${stats.indexable} in sitemap, ${stats.references} local reference(s) verified in ${path.relative(ROOT_DIR, distDir) || 'dist'} (source ${source}, profile ${parity.name})`,
  );
}

module.exports = {
  REQUIRED_FILES,
  SOURCES_BY_PROFILE,
  astroPageToRoute,
  expectedRoutesFromAstro,
  expectedRoutesFromPublic,
  readProfile,
  routeToUrl,
  verifyDist,
};

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
