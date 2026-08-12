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

console.log(`check-build: versioned CDN webflow.js verified in ${checkedPages} HTML file(s)`);
console.log('check-build: generated Yandex Maps runtime config verified');
