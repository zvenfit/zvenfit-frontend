'use strict';

// Content contract of the built site (dist/). Runs after `npm run build` in the
// quality job and in the deploy before the first upload. The parity profile
// selects the page set: `a1` (branch A1 only) covers the three legal pages,
// `a` and `b` cover the whole site. The mode is detected from robots.txt:
// staging is byte-exact "Disallow: /", everything else is production-like.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { LEGACY_DUPLICATES, readProfileArgument } = require('./lib/parity-profile.cjs');
const { astroPageToRoute } = require('./check-routes.cjs');
const { builtSiteStylesheets, mediaRangeQueries, minifySiteCss } = require('./lib/site-css.cjs');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const stylesDir = path.join(rootDir, 'src', 'styles');
const vendorDir = path.join(rootDir, 'src', 'vendor');
const cdnWebflowPrefix = 'https://storage.yandexcloud.net/zvenfit/v2/js/webflow.js?v=';
const STAGING_ROBOTS = 'User-agent: *\nDisallow: /\n';
const HASH = '[A-Za-z0-9_-]+';
const WEBFLOW_PAGE_ID_PATTERN = /^[0-9a-f]{24}$/;
const MIN_W_NODE_CSS_COVERAGE = 0.9;
// Licence texts of the vendored code in src/vendor. MIT asks for the notice in
// every copy and the minified imask carries no banner, so the build serves the
// text where the legacy site did: /js/vendor/<name> (src/pages/js/vendor/).
const VENDOR_LICENCES = ['imask-7.6.1.LICENSE.txt'];

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
  return files.sort();
}

function hashedAsset(name) {
  const [stem, extension] = [name.replace(/\.[a-z]+$/, ''), name.match(/\.([a-z]+)$/)[1]];
  return new RegExp(`/_astro/${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${HASH}\\.${extension}`);
}

function extractAttribute(source, attributeName) {
  const match = source.match(new RegExp(`\\b${attributeName}=(['"])(.*?)\\1`, 'i'));
  return match?.[2] || null;
}

function extractIds(source) {
  return Array.from(source.matchAll(/\bid=(['"])(.*?)\1/gi), match => match[2]);
}

// Ported from the retired check-webflow-layout.cjs: the Webflow runtime and the
// grid CSS depend on a valid data-wf-page id and on the generated w-node ids.
function analyzeWebflowPage({ cssSource, minCoverage = MIN_W_NODE_CSS_COVERAGE, relativePath, sourceHtml }) {
  const errors = [];
  const pageId = extractAttribute(sourceHtml, 'data-wf-page');
  const ids = extractIds(sourceHtml);
  const wNodeIds = ids.filter(id => id.startsWith('w-node-'));
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

  if (pageId && !WEBFLOW_PAGE_ID_PATTERN.test(pageId)) {
    errors.push(`${relativePath}: data-wf-page must be a 24-character lowercase hex id, got "${pageId}"`);
  }
  if (wNodeIds.length > 0 && !pageId) {
    errors.push(`${relativePath}: contains w-node ids but has no data-wf-page`);
  }
  if (duplicateIds.length > 0) {
    errors.push(`${relativePath}: contains duplicate ids: ${duplicateIds.join(', ')}`);
  }
  const matchedWNodeIds = wNodeIds.filter(id => cssSource.includes(`#${id}`));
  const coverage = wNodeIds.length === 0 ? 1 : matchedWNodeIds.length / wNodeIds.length;
  if (wNodeIds.length > 0 && coverage < minCoverage) {
    const missingIds = wNodeIds.filter(id => !cssSource.includes(`#${id}`));
    errors.push(
      `${relativePath}: Webflow CSS covers only ${matchedWNodeIds.length}/${wNodeIds.length} w-node ids; ` +
        `missing ${missingIds.slice(0, 5).join(', ')}${missingIds.length > 5 ? ', ...' : ''}`,
    );
  }
  return { coverage, errors, matchedWNodeCount: matchedWNodeIds.length, pageId, wNodeCount: wNodeIds.length };
}

function detectMode(dist) {
  const robots = path.join(dist, 'robots.txt');
  return fs.existsSync(robots) && fs.readFileSync(robots, 'utf8') === STAGING_ROBOTS ? 'staging' : 'production';
}

function checkPage(route, html, { mode, siteCss, errors }) {
  if (html.includes('src="/js/webflow.js')) {
    errors.push(`${route} still references local webflow.js`);
  }
  if (!html.includes(`src="${cdnWebflowPrefix}`)) {
    errors.push(`${route} is missing the versioned CDN webflow.js`);
  }
  if (/data-astro-cid-|astro-island/.test(html)) {
    errors.push(`${route} leaks Astro scoping attributes or islands into the markup`);
  }
  const beacon = html.includes('src="/js/traffic-config.js"') && hashedAsset('traffic-beacon.js').test(html);
  if (route === '404.html' && (html.includes('/js/traffic-config.js') || html.includes('traffic-beacon.'))) {
    errors.push('404 page must not emit technical page views');
  } else if (route !== '404.html' && !beacon) {
    errors.push(`${route} is missing the technical traffic config and beacon`);
  }
  if (html.includes('/js/traffic-config.js?v=') || /\/js\/[a-z]+-config\.js\?v=/.test(html)) {
    errors.push(`${route} versions a runtime config with ?v=; configs are served with no-cache`);
  }
  const eventScripts = [...html.matchAll(/<script\b[^>]*>/g)].filter(match => hashedAsset('analytics.js').test(match[0]));
  const expectedEvents = route === '404.html' ? 0 : 1;
  if (eventScripts.length !== expectedEvents) {
    errors.push(`${route} must have ${expectedEvents} hashed analytics event loader(s)`);
  } else if (expectedEvents && (!/\bdefer\b/.test(eventScripts[0][0]) || eventScripts[0].index > html.indexOf('</head>'))) {
    errors.push(`${route} analytics event loader must be deferred in head`);
  }
  if (!hashedAsset('utm-attribution.js').test(html)) {
    errors.push(`${route} is missing UTM attribution`);
  }
  if (mode === 'production') {
    for (const [label, marker] of [
      ['Yandex Metrika', 'mc.yandex.ru/metrika/tag.js'],
      ['Top.Mail.Ru', 'top-fwz1.mail.ru/js/code.js'],
      ['Google Tag Manager', 'googletagmanager.com'],
    ]) {
      if (!html.includes(marker)) {
        errors.push(`${route} is missing ${label} in a production build`);
      }
    }
  }
  errors.push(...analyzeWebflowPage({ cssSource: siteCss, relativePath: route, sourceHtml: html }).errors);
}

// The built site stylesheet must be the clean-css output of its source, the
// same bytes as the legacy build. A second guard names the failure that
// matters to visitors: range media queries are ignored by Safari before 16.4
// and Chrome before 104, which switches the whole responsive layout off.
function checkStylesheets(dist, siteCss, errors) {
  const assetsDir = path.join(dist, '_astro');
  const built = builtSiteStylesheets(assetsDir);
  if (built.length !== 1) {
    errors.push(`expected exactly one built site stylesheet in _astro/, found ${built.length}`);
  } else if (fs.readFileSync(path.join(assetsDir, built[0]), 'utf8') !== minifySiteCss(siteCss)) {
    errors.push(`${built[0]} must be the clean-css level 2 output of src/styles/zvenfit.webflow.css, as in the legacy build`);
  }
  for (const name of walkFiles(assetsDir, file => file.endsWith('.css'))) {
    const ranges = mediaRangeQueries(fs.readFileSync(path.join(assetsDir, name), 'utf8'));
    if (ranges.length > 0) {
      errors.push(`_astro/${name} uses media query range syntax (${ranges[0]}), which Safari before 16.4 and Chrome before 104 ignore`);
    }
  }
}

function checkVendorLicences(dist, errors) {
  for (const name of VENDOR_LICENCES) {
    const source = path.join(vendorDir, name);
    const served = path.join(dist, 'js', 'vendor', name);
    if (!fs.existsSync(source)) {
      errors.push(`src/vendor/${name} is missing: vendored code keeps its licence text next to it`);
    } else if (!fs.existsSync(served)) {
      errors.push(`js/vendor/${name} is missing: the licence text of vendored code must be served with the site`);
    } else if (!fs.readFileSync(served).equals(fs.readFileSync(source))) {
      errors.push(`js/vendor/${name} must carry the bytes of src/vendor/${name}`);
    }
  }
}

function checkLeadForm(dist, errors) {
  const leadFormHtml = fs.readFileSync(path.join(dist, 'forma-dlya-zayavki', 'index.html'), 'utf8');
  if (!leadFormHtml.includes('method="post"')) {
    errors.push('lead form must use method="post"');
  }
  if (!leadFormHtml.includes('<select id="service"') || leadFormHtml.includes('custom-select')) {
    errors.push('lead form must use the native service select');
  }
  if (!leadFormHtml.includes('role="alert"') || !leadFormHtml.includes('aria-live="assertive"')) {
    errors.push('lead form error feedback must be announced to assistive technology');
  }
}

function checkClubCard(dist, errors) {
  const clubCardPath = path.join(dist, 'klubnaya-karta', 'index.html');
  if (!fs.existsSync(clubCardPath)) {
    errors.push('club card page is missing');
    return;
  }
  const clubCardHtml = fs.readFileSync(clubCardPath, 'utf8');
  const relativeHtmlLink = clubCardHtml.match(/href="(?!https?:|\/|#|mailto:|tel:)([^"]+\.html(?:#[^"]*)?)"/i);
  const clubCardCtaCount = (clubCardHtml.match(/href="\/forma-dlya-zayavki\/"/g) || []).length;
  if (relativeHtmlLink) {
    errors.push(`club card page contains a relative Webflow link: ${relativeHtmlLink[1]}`);
  }
  if (!clubCardHtml.includes('<link rel="canonical" href="https://zvenfit.ru/klubnaya-karta/">')) {
    errors.push('club card page canonical URL is missing');
  }
  if (!hashedAsset('klubnaya-karta.v1.css').test(clubCardHtml)) {
    errors.push('club card page-scoped stylesheet is missing its hashed asset');
  }
  if (!clubCardHtml.includes('data-map-set="chekhova"') || !hashedAsset('yandex-map.js').test(clubCardHtml)) {
    errors.push('club card page map was not converted to the shared runtime map');
  }
  if (clubCardCtaCount < 8) {
    errors.push(`club card page exposes only ${clubCardCtaCount} lead CTA(s)`);
  }
  if (!clubCardHtml.includes('<main id="main-content" tabindex="-1">')) {
    errors.push('club card skip-link target must accept keyboard focus');
  }
  if ((clubCardHtml.match(/href="#contacts"/g) || []).length < 2 || clubCardHtml.includes('href="#contact"')) {
    errors.push('club card navigation must use the shared visible contacts anchor');
  }
  const clubCardCss = fs.readFileSync(path.join(stylesDir, 'klubnaya-karta.v1.css'), 'utf8');
  if (!clubCardCss.includes('html[data-zvenfit-page="club-card"]')) {
    errors.push('club card stylesheet is not scoped to its page marker');
  }
}

function checkFullSite(dist, errors) {
  const required = ['forma-dlya-zayavki/index.html', 'trenazhernyj-zal/index.html', 'index.html', 'gruppovye-trenirovki/index.html', 'trenazhernyj-zal/mini-gruppy/index.html'];
  const missing = required.filter(page => !fs.existsSync(path.join(dist, page)));
  if (missing.length > 0) {
    errors.push(`full-site checks need ${missing.join(', ')}`);
    return;
  }
  checkLeadForm(dist, errors);
  checkClubCard(dist, errors);
  const gymHtml = fs.readFileSync(path.join(dist, 'trenazhernyj-zal', 'index.html'), 'utf8');
  const selfTrainingEntry = gymHtml.match(/<h3 class="text-block">Самостоятельно<\/h3>[\s\S]*?<a href="([^"]+)"/);
  if (selfTrainingEntry?.[1] !== '/klubnaya-karta/') {
    errors.push('gym self-training card must link to the club card page');
  }
  const homeHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (!homeHtml.includes('https://zvenfit.ru/images/zvenfit-logo.svg')) {
    errors.push('Organization JSON-LD does not reference the dedicated logo');
  }
  for (const [page, marker] of [
    ['gruppovye-trenirovki/index.html', 'group-fitness'],
    ['trenazhernyj-zal/mini-gruppy/index.html', 'mini-groups'],
  ]) {
    if (!fs.readFileSync(path.join(dist, page), 'utf8').includes(`data-zvenfit-page="${marker}"`)) {
      errors.push(`${page} must carry the semantic page marker ${marker}`);
    }
  }
}

function checkLegacyDuplicates(errors) {
  const legacyPages = walkFiles(path.join(rootDir, 'public'), name => name.endsWith('.html'));
  const astroRoutes = walkFiles(path.join(rootDir, 'src', 'pages'), name => name.endsWith('.astro'))
    .filter(file => !file.split('/').some(segment => segment.startsWith('_')) && !/\[[^\]]+\]/.test(file))
    .map(astroPageToRoute);
  const duplicates = legacyPages.filter(page => astroRoutes.includes(page));
  if (duplicates.length > 0) {
    errors.push(`pages exist both in public/ and src/pages: ${duplicates.join(', ')}`);
  }
}

function checkBuild({ dist = distDir, profile }) {
  const errors = [];
  const pages = walkFiles(dist, name => name.endsWith('.html'));
  if (pages.length === 0) {
    throw new Error('check-build: dist has no HTML pages');
  }
  if (!profile.partial && !fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error('check-build: dist/index.html is missing');
  }
  if (profile.partial) {
    const unexpected = pages.filter(page => !profile.pages.includes(page));
    const missing = profile.pages.filter(page => !pages.includes(page));
    if (unexpected.length || missing.length) {
      throw new Error(`check-build: profile ${profile.name} expects exactly ${profile.pages.join(', ')}; missing ${missing.join(', ') || 'none'}, unexpected ${unexpected.join(', ') || 'none'}`);
    }
  }
  if (fs.existsSync(path.join(dist, 'js', 'webflow.js'))) {
    errors.push('dist/js/webflow.js must be served from the assets CDN');
  }

  const mapsConfigPath = path.join(dist, 'js', 'maps-config.js');
  if (!fs.existsSync(mapsConfigPath)) {
    errors.push('dist/js/maps-config.js is missing');
  } else {
    const mapsConfigSource = fs.readFileSync(mapsConfigPath, 'utf8');
    if (mapsConfigSource.includes('__ZVENFIT_MAPS_JSON__')) {
      errors.push('maps-config.js still contains its build placeholder');
    }
    const mapsSandbox = { window: {} };
    vm.runInNewContext(mapsConfigSource, mapsSandbox, { filename: mapsConfigPath });
    if (!mapsSandbox.window.ZVENFIT_MAPS?.sets || !mapsSandbox.window.ZVENFIT_MAPS?.locations) {
      errors.push('maps-config.js does not expose the expected runtime config');
    }
  }
  for (const [file, placeholder] of [
    ['js/traffic-config.js', '__TRAFFIC_API_URL__'],
    ['js/lead-config.js', '__LEAD_API_URL__'],
    ['js/schedule-config.js', '__SCHEDULE_API_URL__'],
  ]) {
    const source = fs.existsSync(path.join(dist, file)) ? fs.readFileSync(path.join(dist, file), 'utf8') : '';
    if (!source || source.includes(placeholder) || !/window\.ZVENFIT_[A-Z_]+ = '.+';/.test(source)) {
      errors.push(`${file} is missing or has no runtime value`);
    }
  }

  const mode = detectMode(dist);
  const siteCss = fs.readFileSync(path.join(stylesDir, 'zvenfit.webflow.css'), 'utf8');
  for (const route of pages) {
    checkPage(route, fs.readFileSync(path.join(dist, route), 'utf8'), { mode, siteCss, errors });
  }

  checkStylesheets(dist, siteCss, errors);
  checkVendorLicences(dist, errors);

  const logoPath = path.join(dist, 'images', 'zvenfit-logo.svg');
  if (!fs.existsSync(logoPath)) {
    errors.push('organization logo asset is missing');
  } else {
    const logoSource = fs.readFileSync(logoPath, 'utf8');
    if (!logoSource.includes('width="512"') || !logoSource.includes('height="512"')) {
      errors.push('organization logo must expose 512x512 dimensions');
    }
  }

  if (!siteCss.includes('appearance: none;') || !siteCss.includes("stroke='%23fff'")) {
    errors.push('native lead-form select must use the branded SVG chevron');
  }
  const reducedMotionBlock = siteCss.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
  if (!reducedMotionBlock?.[1].includes('.grain-overlay') || !reducedMotionBlock[1].includes('background-image: none')) {
    errors.push('reduced motion must disable the animated grain background');
  }
  if (!/html\[data-zvenfit-page="group-fitness"\] #reviews/.test(siteCss) || /html\[data-wf-page=[^\]]+\] #reviews/.test(siteCss)) {
    errors.push('review visibility must be scoped by the semantic page marker, not a Webflow page id');
  }

  if (!profile.partial) {
    checkFullSite(dist, errors);
  }
  if (LEGACY_DUPLICATES === 'forbidden') {
    checkLegacyDuplicates(errors);
  }

  if (errors.length > 0) {
    throw new Error(`check-build failed:\n- ${errors.join('\n- ')}`);
  }
  return { mode, pages: pages.length, profile: profile.name };
}

module.exports = { MIN_W_NODE_CSS_COVERAGE, VENDOR_LICENCES, WEBFLOW_PAGE_ID_PATTERN, analyzeWebflowPage, checkBuild, detectMode, extractAttribute, extractIds };

if (require.main === module) {
  try {
    const deployProfile = JSON.parse(fs.readFileSync(path.join(__dirname, 'deploy.config.json'), 'utf8')).profile;
    const profile = readProfileArgument(process.argv.slice(2), deployProfile === 'legacy' ? 'a' : deployProfile);
    const result = checkBuild({ profile });
    console.log(`check-build: ${result.pages} page(s) verified in ${result.mode} mode (profile ${result.profile})`);
    console.log('check-build: CDN webflow.js, hashed own assets, no-cache runtime configs and generated maps config verified');
    console.log('check-build: site stylesheet equals its legacy clean-css minification, no range media queries');
    console.log('check-build: licence texts of the vendored code served at /js/vendor/ with the source bytes');
    console.log('check-build: analytics, UTM, traffic beacon and 404 exclusion verified for the build mode');
    console.log('check-build: Webflow page ids, duplicate ids and w-node CSS coverage verified');
    console.log('check-build: branded native-select chevron, reduced-motion fallback and review scoping verified');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
