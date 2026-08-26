'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');
const localWebflowPath = '/js/webflow.js';
const cdnWebflowPrefix = 'https://storage.yandexcloud.net/zvenfit/v2/js/webflow.js?v=';

function walkHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }

  return files;
}

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  throw new Error('check-build: dist/index.html is missing');
}

if (fs.existsSync(path.join(distDir, 'js', 'webflow.js'))) {
  throw new Error('check-build: dist/js/webflow.js must be served from the assets CDN');
}

const mapsConfigPath = path.join(distDir, 'js', 'maps-config.js');
if (!fs.existsSync(mapsConfigPath)) {
  throw new Error('check-build: dist/js/maps-config.js is missing');
}

const mapsConfigSource = fs.readFileSync(mapsConfigPath, 'utf8');
if (mapsConfigSource.includes('__ZVENFIT_MAPS_JSON__')) {
  throw new Error('check-build: maps-config.js still contains its build placeholder');
}

const mapsSandbox = { window: {} };
vm.runInNewContext(mapsConfigSource, mapsSandbox, { filename: mapsConfigPath });
if (!mapsSandbox.window.ZVENFIT_MAPS?.sets || !mapsSandbox.window.ZVENFIT_MAPS?.locations) {
  throw new Error('check-build: maps-config.js does not expose the expected runtime config');
}

let checkedPages = 0;
for (const publicHtmlPath of walkHtmlFiles(publicDir)) {
  const sourceHtml = fs.readFileSync(publicHtmlPath, 'utf8');
  if (!sourceHtml.includes(localWebflowPath)) {
    continue;
  }

  const relativePath = path.relative(publicDir, publicHtmlPath);
  const distHtmlPath = path.join(distDir, relativePath);
  const builtHtml = fs.readFileSync(distHtmlPath, 'utf8');

  if (builtHtml.includes(`src="${localWebflowPath}`)) {
    throw new Error(`check-build: ${relativePath} still references local webflow.js`);
  }
  if (!builtHtml.includes(`src="${cdnWebflowPrefix}`)) {
    throw new Error(`check-build: ${relativePath} is missing the versioned CDN webflow.js`);
  }

  checkedPages += 1;
}

if (checkedPages === 0) {
  throw new Error('check-build: no source pages reference webflow.js');
}

const leadFormPath = path.join(distDir, 'forma-dlya-zayavki', 'index.html');
const leadFormHtml = fs.readFileSync(leadFormPath, 'utf8');
const leadFormIds = Array.from(leadFormHtml.matchAll(/\sid="([^"]+)"/g), match => match[1]);
const duplicateLeadFormIds = leadFormIds.filter((id, index) => leadFormIds.indexOf(id) !== index);

if (duplicateLeadFormIds.length > 0) {
  throw new Error(`check-build: lead form contains duplicate ids: ${duplicateLeadFormIds.join(', ')}`);
}
if (!leadFormHtml.includes('method="post"')) {
  throw new Error('check-build: lead form must use method="post"');
}
if (!leadFormHtml.includes('<select id="service"') || leadFormHtml.includes('custom-select')) {
  throw new Error('check-build: lead form must use the native service select');
}
if (!leadFormHtml.includes('role="alert"') || !leadFormHtml.includes('aria-live="assertive"')) {
  throw new Error('check-build: lead form error feedback must be announced to assistive technology');
}

const clubCardPath = path.join(distDir, 'klubnaya-karta', 'index.html');
if (!fs.existsSync(clubCardPath)) {
  throw new Error('check-build: club card page is missing');
}

const clubCardHtml = fs.readFileSync(clubCardPath, 'utf8');
const clubCardIds = Array.from(clubCardHtml.matchAll(/\sid="([^"]+)"/g), match => match[1]);
const duplicateClubCardIds = clubCardIds.filter((id, index) => clubCardIds.indexOf(id) !== index);
const relativeHtmlLink = clubCardHtml.match(/href="(?!https?:|\/|#|mailto:|tel:)([^"]+\.html(?:#[^"]*)?)"/i);
const clubCardCtaCount = (clubCardHtml.match(/href="\/forma-dlya-zayavki\/"/g) || []).length;

if (duplicateClubCardIds.length > 0) {
  throw new Error(`check-build: club card page contains duplicate ids: ${duplicateClubCardIds.join(', ')}`);
}
if (relativeHtmlLink) {
  throw new Error(`check-build: club card page contains a relative Webflow link: ${relativeHtmlLink[1]}`);
}
if (!clubCardHtml.includes('<link rel="canonical" href="https://zvenfit.ru/klubnaya-karta/">')) {
  throw new Error('check-build: club card page canonical URL is missing');
}
if (!clubCardHtml.includes('/css/klubnaya-karta.v1.css?v=')) {
  throw new Error('check-build: club card page-scoped stylesheet is missing its cache-busting version');
}
if (!clubCardHtml.includes('data-map-set="chekhova"') || !clubCardHtml.includes('/js/yandex-map.js?v=')) {
  throw new Error('check-build: club card page map was not converted to the shared runtime map');
}
if (!clubCardHtml.includes('/js/traffic-config.js?v=') || !clubCardHtml.includes('/js/traffic-beacon.js?v=')) {
  throw new Error('check-build: club card page is missing versioned technical traffic scripts');
}
if (clubCardCtaCount < 8) {
  throw new Error(`check-build: club card page exposes only ${clubCardCtaCount} lead CTA(s)`);
}
if (!clubCardHtml.includes('<main id="main-content" tabindex="-1">')) {
  throw new Error('check-build: club card skip-link target must accept keyboard focus');
}
if ((clubCardHtml.match(/href="#contacts"/g) || []).length < 2 || clubCardHtml.includes('href="#contact"')) {
  throw new Error('check-build: club card navigation must use the shared visible contacts anchor');
}

const clubCardCssPath = path.join(distDir, 'css', 'klubnaya-karta.v1.css');
if (!fs.existsSync(clubCardCssPath)) {
  throw new Error('check-build: club card page-scoped stylesheet asset is missing');
}

const clubCardCss = fs.readFileSync(clubCardCssPath, 'utf8');
if (!clubCardCss.includes('html[data-zvenfit-page="club-card"]')) {
  throw new Error('check-build: club card stylesheet is not scoped to its page marker');
}

const gymHtml = fs.readFileSync(path.join(distDir, 'trenazhernyj-zal', 'index.html'), 'utf8');
const selfTrainingEntry = gymHtml.match(/<h3 class="text-block">Самостоятельно<\/h3>[\s\S]*?<a href="([^"]+)"/);
if (selfTrainingEntry?.[1] !== '/klubnaya-karta/') {
  throw new Error('check-build: gym self-training card must link to the club card page');
}

const logoPath = path.join(distDir, 'images', 'zvenfit-logo.svg');
if (!fs.existsSync(logoPath)) {
  throw new Error('check-build: organization logo asset is missing');
}

const logoSource = fs.readFileSync(logoPath, 'utf8');
if (!logoSource.includes('width="512"') || !logoSource.includes('height="512"')) {
  throw new Error('check-build: organization logo must expose 512x512 dimensions');
}

const homeHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
if (!homeHtml.includes('/js/traffic-config.js?v=') || !homeHtml.includes('/js/traffic-beacon.js?v=')) {
  throw new Error('check-build: home page is missing versioned technical traffic scripts');
}
const trafficConfigSource = fs.readFileSync(path.join(distDir, 'js', 'traffic-config.js'), 'utf8');
if (trafficConfigSource.includes('__TRAFFIC_API_URL__')) {
  throw new Error('check-build: traffic-config.js still contains its build placeholder');
}
const notFoundHtml = fs.readFileSync(path.join(distDir, '404.html'), 'utf8');
if (notFoundHtml.includes('/js/traffic-config.js') || notFoundHtml.includes('/js/traffic-beacon.js')) {
  throw new Error('check-build: 404 page must not emit technical page views');
}
if (!homeHtml.includes('https://zvenfit.ru/images/zvenfit-logo.svg')) {
  throw new Error('check-build: Organization JSON-LD does not reference the dedicated logo');
}

const publicCss = fs.readFileSync(path.join(publicDir, 'css', 'zvenfit.webflow.css'), 'utf8');
if (!publicCss.includes('appearance: none;') || !publicCss.includes("stroke='%23fff'")) {
  throw new Error('check-build: native lead-form select must use the branded SVG chevron');
}

const reducedMotionBlock = publicCss.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
if (!reducedMotionBlock?.[1].includes('.grain-overlay') || !reducedMotionBlock[1].includes('background-image: none')) {
  throw new Error('check-build: reduced motion must disable the animated grain background');
}

console.log(`check-build: versioned CDN webflow.js verified in ${checkedPages} HTML file(s)`);
console.log('check-build: generated Yandex Maps runtime config verified');
console.log('check-build: lead form accessibility contract verified');
console.log('check-build: club card page, CTAs, map, analytics and entry point verified');
console.log('check-build: Organization logo asset and JSON-LD reference verified');
console.log('check-build: technical traffic beacon and runtime config verified');
console.log('check-build: 404 page-view beacon exclusion verified');
console.log('check-build: branded native-select chevron verified');
console.log('check-build: reduced-motion grain fallback verified');
