'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

function loadEnvFile(filename) {
  const filepath = path.join(rootDir, filename);
  if (!fs.existsSync(filepath)) {
    return;
  }

  const content = fs.readFileSync(filepath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

if (!fs.existsSync(publicDir)) {
  console.error('build-static: missing directory public/');
  process.exit(1);
}

const nodeEnv = process.env.NODE_ENV || 'production';
if (nodeEnv === 'development') {
  loadEnvFile('.env.development');
}

const isDev = nodeEnv === 'development';
const leadApiUrl =
  process.env.LEAD_API_URL || (isDev ? 'http://localhost:3000' : '');

const analyticsMarker = '<!-- ZvenFit: VK + Yandex Metrika -->';
const analyticsSnippetPath = path.join(__dirname, 'snippets', 'analytics-head.html');

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

function injectAnalyticsHead(html) {
  if (html.includes(analyticsMarker) || !html.includes('</head>')) {
    return html;
  }

  const snippet = fs.readFileSync(analyticsSnippetPath, 'utf8');
  return html.replace('</head>', `${snippet}</head>`);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.cpSync(publicDir, distDir, { recursive: true });

let analyticsInjected = 0;
for (const htmlPath of walkHtmlFiles(distDir)) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const nextHtml = injectAnalyticsHead(html);
  if (nextHtml !== html) {
    fs.writeFileSync(htmlPath, nextHtml, 'utf8');
    analyticsInjected += 1;
  }
}

if (analyticsInjected > 0) {
  console.log(`build-static: injected VK + Yandex Metrika into ${analyticsInjected} HTML file(s)`);
}

const leadConfigPath = path.join(distDir, 'js', 'lead-config.js');

if (fs.existsSync(leadConfigPath)) {
  const leadConfig = fs.readFileSync(leadConfigPath, 'utf8');
  fs.writeFileSync(
    leadConfigPath,
    leadConfig.replaceAll('__LEAD_API_URL__', leadApiUrl),
    'utf8',
  );
}

if (!leadApiUrl) {
  console.warn('build-static: LEAD_API_URL is empty — lead form will fail until it is set');
} else {
  console.log(`build-static: LEAD_API_URL=${leadApiUrl} (NODE_ENV=${nodeEnv})`);
}

console.log('build-static: copied public/ -> dist/');
