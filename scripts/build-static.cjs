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

const analyticsMarker = '<!-- ZvenFit: VK + Yandex Metrika -->';
const analyticsSnippetPath = path.join(__dirname, 'snippets', 'analytics-head.html');
const utmMarker = '<!-- ZvenFit: UTM attribution -->';
const utmSnippetPath = path.join(__dirname, 'snippets', 'utm-head.html');
const appDownloadDesktopMarker = '<!-- ZvenFit: app-download-links-desktop -->';
const appDownloadMobileMarker = '<!-- ZvenFit: app-download-links-mobile -->';
const appDownloadPlatformsMarker = '<!-- ZvenFit: app-download-platforms-section -->';
const appDownloadBadgesSnippetPath = path.join(
  __dirname,
  'snippets',
  'app-download-badges.html',
);
const appDownloadPlatformsSnippetPath = path.join(
  __dirname,
  'snippets',
  'app-download-platforms-section.html',
);
const appLinksConfigPath = path.join(__dirname, 'app-links.config.json');
const CACHE_BUST_SCRIPTS = [
  'utm-attribution.js',
  'lead-form.js',
  'lead-config.js',
  'accordion-horizontal.js',
];

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

function getAppLinksConfig() {
  return JSON.parse(fs.readFileSync(appLinksConfigPath, 'utf8'));
}

function bustAssetUrls(html, assetVersion) {
  let nextHtml = html;
  for (const scriptName of CACHE_BUST_SCRIPTS) {
    const pattern = new RegExp(`(/js/${scriptName})(?:\\?v=[^"']*)?`, 'g');
    nextHtml = nextHtml.replace(pattern, `$1?v=${assetVersion}`);
  }
  return nextHtml;
}

function injectUtmHead(html, assetVersion) {
  if (html.includes(utmMarker) || !html.includes('</head>')) {
    return html;
  }

  const snippet = fs
    .readFileSync(utmSnippetPath, 'utf8')
    .replaceAll('__ASSET_VERSION__', assetVersion);
  return html.replace('</head>', `${snippet}</head>`);
}

function injectAnalyticsHead(html) {
  if (html.includes(analyticsMarker) || !html.includes('</head>')) {
    return html;
  }

  const snippet = fs.readFileSync(analyticsSnippetPath, 'utf8');
  return html.replace('</head>', `${snippet}</head>`);
}

function injectHeadSnippets(html, assetVersion) {
  return injectUtmHead(injectAnalyticsHead(html), assetVersion);
}

function applySlashPrefix(html) {
  return html.replace(
    /(<([a-zA-Z][\w-]*)([^>]*)>)\/\/([^<]+?)(<\/\2>)/g,
    (match, _open, tag, attrs, text, close) => {
      let newAttrs;
      if (/class="([^"]*)"/.test(attrs)) {
        newAttrs = attrs.replace(/class="([^"]*)"/, (_, classes) => {
          if (classes.split(/\s+/).includes('slash-prefix')) {
            return `class="${classes}"`;
          }
          return `class="${classes} slash-prefix"`;
        });
      } else {
        newAttrs = `${attrs} class="slash-prefix"`;
      }
      return `<${tag}${newAttrs}>${text}${close}`;
    },
  );
}

function loadAppLinksSnippet(snippetPath, appLinksConfig) {
  return applySlashPrefix(
    fs
      .readFileSync(snippetPath, 'utf8')
      .replaceAll('__APP_STORE_URL__', appLinksConfig.appStore)
      .replaceAll('__RU_STORE_URL__', appLinksConfig.ruStore)
      .replaceAll('__APK_URL__', appLinksConfig.apk)
      .replaceAll('__APP_STORE_BADGE_URL__', appLinksConfig.appStoreBadge)
      .replaceAll('__RU_STORE_BADGE_URL__', appLinksConfig.ruStoreBadge)
      .replaceAll('__APK_BADGE_URL__', appLinksConfig.apkBadge),
  );
}

function injectAppDownloadLinks(html, appLinksConfig, { skipFooterAppBlock = false } = {}) {
  let nextHtml = html;
  const badgesSnippet = loadAppLinksSnippet(appDownloadBadgesSnippetPath, appLinksConfig);

  if (!skipFooterAppBlock) {
    if (nextHtml.includes(appDownloadDesktopMarker)) {
      nextHtml = nextHtml.replace(appDownloadDesktopMarker, badgesSnippet);
    }

    if (nextHtml.includes(appDownloadMobileMarker)) {
      nextHtml = nextHtml.replace(appDownloadMobileMarker, badgesSnippet);
    }
  } else {
    nextHtml = nextHtml.replaceAll(appDownloadDesktopMarker, '');
    nextHtml = nextHtml.replaceAll(appDownloadMobileMarker, '');
  }

  if (nextHtml.includes(appDownloadPlatformsMarker)) {
    nextHtml = nextHtml.replace(
      appDownloadPlatformsMarker,
      loadAppLinksSnippet(appDownloadPlatformsSnippetPath, appLinksConfig),
    );
  }

  return nextHtml;
}

function runBuild() {
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
  const assetVersion = process.env.ASSET_VERSION || '2';
  const appLinksConfig = getAppLinksConfig();

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.cpSync(publicDir, distDir, { recursive: true });

  let headSnippetsInjected = 0;
  let appDownloadLinksInjected = 0;
  for (const htmlPath of walkHtmlFiles(distDir)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const skipFooterAppBlock = htmlPath.includes(
      `${path.sep}contacts${path.sep}platforms${path.sep}`,
    );
    const withHeadSnippets = injectHeadSnippets(html, assetVersion);
    const nextHtml = bustAssetUrls(
      applySlashPrefix(
        injectAppDownloadLinks(withHeadSnippets, appLinksConfig, { skipFooterAppBlock }),
      ),
      assetVersion,
    );

    if (nextHtml !== html) {
      fs.writeFileSync(htmlPath, nextHtml, 'utf8');
    }

    if (withHeadSnippets !== html) {
      headSnippetsInjected += 1;
    }

    if (
      nextHtml.includes('class="app-download-block"') ||
      nextHtml.includes('class="app-badges"')
    ) {
      appDownloadLinksInjected += 1;
    }
  }

  if (headSnippetsInjected > 0) {
    console.log(
      `build-static: injected analytics + UTM attribution into ${headSnippetsInjected} HTML file(s)`,
    );
  }

  if (appDownloadLinksInjected > 0) {
    console.log(
      `build-static: injected app download links into ${appDownloadLinksInjected} HTML file(s)`,
    );
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

  console.log(`build-static: ASSET_VERSION=${assetVersion}`);
  console.log('build-static: copied public/ -> dist/');
}

module.exports = { runBuild, applySlashPrefix };

if (require.main === module) {
  runBuild();
}
