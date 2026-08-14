'use strict';

const fs = require('node:fs');
const path = require('node:path');

const distDir = path.resolve(__dirname, '../dist');
const htmlFiles = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFiles.push(absolutePath);
    }
  }
}

walk(distDir);

if (htmlFiles.length === 0) {
  throw new Error('check-staging-build: no HTML files found');
}

for (const htmlPath of htmlFiles) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const relativePath = path.relative(distDir, htmlPath);

  if (!html.includes('<meta name="robots" content="noindex, nofollow">')) {
    throw new Error(`check-staging-build: ${relativePath} is missing noindex, nofollow`);
  }
  if (
    html.includes('ZvenFit: VK + Yandex Metrika') ||
    html.includes('mc.yandex.ru/metrika') ||
    html.includes('top-fwz1.mail.ru') ||
    html.includes('googletagmanager.com') ||
    html.includes('GTM-')
  ) {
    throw new Error(`check-staging-build: ${relativePath} contains production analytics`);
  }
}

const robots = fs.readFileSync(path.join(distDir, 'robots.txt'), 'utf8');
if (robots !== 'User-agent: *\nDisallow: /\n') {
  throw new Error('check-staging-build: robots.txt must disallow every crawler');
}

const leadConfig = fs.readFileSync(path.join(distDir, 'js/lead-config.js'), 'utf8');
const scheduleConfig = fs.readFileSync(path.join(distDir, 'js/schedule-config.js'), 'utf8');

if (!leadConfig.includes('https://staging.zvenfit.ru/api/lead')) {
  throw new Error('check-staging-build: lead API must use the authenticated same-origin gateway');
}
if (!scheduleConfig.includes('https://staging.zvenfit.ru/api/schedule')) {
  throw new Error('check-staging-build: schedule API must use the authenticated same-origin gateway');
}

console.log(`check-staging-build: ${htmlFiles.length} protected HTML file(s) verified`);
console.log('check-staging-build: production analytics disabled and same-origin APIs verified');
