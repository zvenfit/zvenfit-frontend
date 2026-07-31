'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const CleanCSS = require('clean-css');

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
const appDownloadPromoMarker = '<!-- ZvenFit: app-download-promo-section -->';
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
const appDownloadPromoSnippetPath = path.join(
  __dirname,
  'snippets',
  'app-download-promo-section.html',
);
const appLinksConfigPath = path.join(__dirname, 'app-links.config.json');
const structuredDataConfigPath = path.join(__dirname, 'structured-data.config.json');
const mapsConfigPath = path.join(__dirname, 'maps.config.json');
const structuredDataMarker = '<!-- ZvenFit: structured-data -->';
const openGraphMarker = '<!-- ZvenFit: open-graph -->';
const SITE_CSS_SOURCE = 'zvenfit.webflow.css';
const SITE_CSS_MIN = 'zvenfit.webflow.min.css';
const CACHE_BUST_SCRIPTS = [
  'utm-attribution.js',
  'lead-form.js',
  'lead-config.js',
  'schedule.js',
  'schedule-config.js',
  'accordion-horizontal.js',
  'maps-config.js',
  'yandex-map.js',
];

const MAP_IFRAME_RE =
  /<div class="code-embed-4 w-embed w-iframe"><iframe[^>]*map-widget[^>]*>\s*<\/iframe><\/div>/g;

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

function getMapsConfig() {
  return JSON.parse(fs.readFileSync(mapsConfigPath, 'utf8'));
}

function getYandexMapUrl(location) {
  return (
    location.sameAs?.find((url) => url.includes('yandex.ru/maps')) ||
    `https://yandex.ru/maps/?ll=${location.longitude}%2C${location.latitude}&z=16&pt=${location.longitude},${location.latitude},pm2rdm`
  );
}

const ALTAY_URL_RE = /https:\/\/avatars\.mds\.yandex\.net\/get-altay\/[^"'\\)\s]+/g;
const MAX_YANDEX_ORG_PHOTOS = 12;

function normalizeAltayPhotoUrl(url) {
  return String(url || '')
    .replace(/\)$/, '')
    .replace(/\{size\}/gi, 'L')
    .replace(/\/%s$/i, '/L')
    .replace(/\/(S|M|L[^/]*|XXL[^/]*|h\d+|orig)\)?$/i, '/L');
}

function fetchYandexOrgPhotosFromPage(orgId) {
  if (!orgId) {
    return [];
  }

  try {
    const pageUrl = `https://yandex.ru/maps/org/zvenfit/${orgId}/`;
    const result = spawnSync(
      'curl',
      ['-sSL', '-L', pageUrl, '-A', 'Mozilla/5.0', '-m', '25'],
      { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 },
    );

    if (result.status !== 0 || !result.stdout) {
      return [];
    }

    const seen = new Set();
    const photos = [];

    for (const match of result.stdout.matchAll(ALTAY_URL_RE)) {
      const normalized = normalizeAltayPhotoUrl(match[0]);
      if (seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      photos.push(normalized);

      if (photos.length >= MAX_YANDEX_ORG_PHOTOS) {
        break;
      }
    }

    return photos;
  } catch {
    return [];
  }
}

function buildMapsRuntimeConfig(structuredDataConfig, mapsConfig) {
  const locations = {};

  for (const [key, location] of Object.entries(structuredDataConfig.locations)) {
    const pinOverride = mapsConfig.locationPins?.[key];
    const orgId = mapsConfig.locationOrganizations?.[key] || '';
    const yandexPhotos = fetchYandexOrgPhotosFromPage(orgId);
    const photos = yandexPhotos.length
      ? yandexPhotos
      : mapsConfig.locationPhotos?.[key] || [];
    locations[key] = {
      name: location.name,
      streetAddress: location.streetAddress,
      addressLocality: location.addressLocality,
      telephone: location.telephone,
      latitude: location.latitude,
      longitude: location.longitude,
      mapUrl: getYandexMapUrl(location),
      yandexOrganizationId: orgId,
      pinIcon: pinOverride?.pinIcon || mapsConfig.pinIcon,
      pinIconSize: pinOverride?.pinIconSize || mapsConfig.pinIconSize,
      pinIconOffset: pinOverride?.pinIconOffset || mapsConfig.pinIconOffset,
      photos,
    };
  }

  return {
    apiKey: process.env.Y_MAPS_API_KEY || '',
    pinIcon: mapsConfig.pinIcon,
    pinIconSize: mapsConfig.pinIconSize,
    pinIconOffset: mapsConfig.pinIconOffset,
    locationPins: mapsConfig.locationPins || {},
    locationOrganizations: mapsConfig.locationOrganizations || {},
    locationPhotos: mapsConfig.locationPhotos || {},
    defaultSet: mapsConfig.defaultSet,
    sets: mapsConfig.sets,
    locations,
  };
}

function getMapSet(pagePath, mapsConfig) {
  return mapsConfig.pageSets[pagePath] || mapsConfig.defaultSet;
}

function replaceMapEmbeds(html, pagePath, mapsConfig) {
  if (!html.includes('map-widget')) {
    return html;
  }

  const mapSet = getMapSet(pagePath, mapsConfig);

  return html.replace(
    MAP_IFRAME_RE,
    `<div class="zvenfit-map code-embed-4" data-map-set="${mapSet}" role="region" aria-label="Карта — ZvenFit"></div>`,
  );
}

function injectMapScripts(html, assetVersion) {
  if (!html.includes('zvenfit-map') || html.includes('/js/yandex-map.js')) {
    return html;
  }

  const scripts = `<script src="/js/maps-config.js?v=${assetVersion}" defer></script>\n  <script src="/js/yandex-map.js?v=${assetVersion}" defer></script>\n  `;

  return html.replace('</body>', `${scripts}</body>`);
}

function writeMapsConfig(distDir, structuredDataConfig, mapsConfig) {
  const mapsConfigPathDist = path.join(distDir, 'js', 'maps-config.js');
  if (!fs.existsSync(mapsConfigPathDist)) {
    return;
  }

  const runtimeConfig = buildMapsRuntimeConfig(structuredDataConfig, mapsConfig);
  const template = fs.readFileSync(mapsConfigPathDist, 'utf8');
  fs.writeFileSync(
    mapsConfigPathDist,
    template.replace('__ZVENFIT_MAPS_JSON__', JSON.stringify(runtimeConfig, null, 2)),
    'utf8',
  );
}

function bustAssetUrls(html, assetVersion) {
  let nextHtml = html;
  for (const scriptName of CACHE_BUST_SCRIPTS) {
    const pattern = new RegExp(`(/js/${scriptName})(?:\\?v=[^"']*)?`, 'g');
    nextHtml = nextHtml.replace(pattern, `$1?v=${assetVersion}`);
  }

  nextHtml = nextHtml.replace(
    new RegExp(`(/css/${SITE_CSS_SOURCE.replace('.', '\\.')})(?:\\?v=[^"']*)?`, 'g'),
    `/css/${SITE_CSS_MIN}?v=${assetVersion}`,
  );

  return nextHtml;
}

function minifySiteCss() {
  const sourcePath = path.join(publicDir, 'css', SITE_CSS_SOURCE);
  const distMinPath = path.join(distDir, 'css', SITE_CSS_MIN);
  const distSourcePath = path.join(distDir, 'css', SITE_CSS_SOURCE);

  if (!fs.existsSync(sourcePath)) {
    console.warn(`build-static: missing public/css/${SITE_CSS_SOURCE}`);
    return;
  }

  const source = fs.readFileSync(sourcePath, 'utf8');
  const result = new CleanCSS({ level: 2 }).minify(source);

  if (result.errors.length > 0) {
    throw new Error(`CSS minify failed: ${result.errors.join(', ')}`);
  }

  fs.mkdirSync(path.dirname(distMinPath), { recursive: true });
  fs.writeFileSync(distMinPath, result.styles, 'utf8');

  if (fs.existsSync(distSourcePath)) {
    fs.unlinkSync(distSourcePath);
  }

  console.log(
    `build-static: css/${SITE_CSS_SOURCE} -> css/${SITE_CSS_MIN} (${source.length} -> ${result.styles.length} bytes)`,
  );
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

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function extractCanonicalUrl(html, siteUrl, pagePath) {
  const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  if (match?.[1]) {
    return match[1];
  }

  const base = siteUrl.replace(/\/$/, '');
  if (pagePath === '/') {
    return `${base}/`;
  }

  return `${base}${pagePath}`;
}

function injectOpenGraphHead(html, pagePath, config) {
  if (html.includes(openGraphMarker) || !html.includes('</head>')) {
    return html;
  }

  const siteUrl = config.siteUrl.replace(/\/$/, '');
  const meta = extractPageMeta(html);
  const pageUrl = extractCanonicalUrl(html, siteUrl, pagePath);
  const ogImage = resolveStructuredDataUrl(
    siteUrl,
    config.openGraph?.image || config.organization.logo,
  );
  const ogSiteName = config.openGraph?.siteName || config.organization.name;
  const tags = [];

  if (!html.includes('property="og:title"') && meta.title) {
    tags.push(
      `<meta property="og:title" content="${escapeHtmlAttr(meta.title)}">`,
    );
  }

  if (!html.includes('property="og:description"') && meta.description) {
    tags.push(
      `<meta property="og:description" content="${escapeHtmlAttr(meta.description)}">`,
    );
  }

  if (!html.includes('property="og:url"')) {
    tags.push(`<meta property="og:url" content="${escapeHtmlAttr(pageUrl)}">`);
  }

  if (!html.includes('property="og:type"')) {
    tags.push('<meta property="og:type" content="website">');
  }

  if (!html.includes('property="og:locale"')) {
    tags.push('<meta property="og:locale" content="ru_RU">');
  }

  if (!html.includes('property="og:site_name"') && ogSiteName) {
    tags.push(
      `<meta property="og:site_name" content="${escapeHtmlAttr(ogSiteName)}">`,
    );
  }

  if (!html.includes('property="og:image"') && ogImage) {
    tags.push(`<meta property="og:image" content="${escapeHtmlAttr(ogImage)}">`);
  }

  if (!html.includes('property="twitter:card"')) {
    tags.push('<meta property="twitter:card" content="summary">');
  }

  if (!html.includes('property="twitter:title"') && meta.title) {
    tags.push(
      `<meta property="twitter:title" content="${escapeHtmlAttr(meta.title)}">`,
    );
  }

  if (!html.includes('property="twitter:description"') && meta.description) {
    tags.push(
      `<meta property="twitter:description" content="${escapeHtmlAttr(meta.description)}">`,
    );
  }

  if (!tags.length) {
    return html;
  }

  const snippet = `${tags.join('\n  ')}\n  ${openGraphMarker}`;
  return html.replace('</head>', `${snippet}\n</head>`);
}

function getPagePath(htmlPath, baseDir) {
  const rel = path.relative(baseDir, htmlPath);
  if (rel === 'index.html') {
    return '/';
  }

  return `/${rel.replace(/index\.html$/, '').replace(/\\/g, '/')}`;
}

const FULL_GRAPH_PAGES = new Set(['/', '/contacts/platforms/']);

function extractPageMeta(html) {
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);

  return {
    title: titleMatch?.[1]?.trim() || '',
    description: descMatch?.[1]?.trim() || '',
  };
}

function resolveStructuredDataUrl(siteUrl, pathOrUrl) {
  if (!pathOrUrl) {
    return undefined;
  }

  if (pathOrUrl.startsWith('http')) {
    return pathOrUrl;
  }

  return `${siteUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

function buildOpeningHours(location) {
  if (!location.openingHours?.length) {
    return {};
  }

  return {
    openingHoursSpecification: location.openingHours.map((spec) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: spec.dayOfWeek,
      opens: spec.opens,
      closes: spec.closes,
    })),
  };
}

function buildOrganizationNode(config, siteUrl, { full = false } = {}) {
  const node = {
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: config.organization.name,
    url: `${siteUrl}/`,
  };

  const logoUrl = resolveStructuredDataUrl(siteUrl, config.organization.logo);
  if (logoUrl) {
    node.logo = logoUrl;
  }

  if (full) {
    node.subOrganization = Object.values(config.locations).map((location) => ({
      '@id': `${siteUrl}/#${location.id}`,
    }));

    if (config.organization.sameAs?.length) {
      node.sameAs = config.organization.sameAs;
    }
  }

  return node;
}

function buildLocationNode(location, siteUrl) {
  return {
    '@type': 'HealthClub',
    '@id': `${siteUrl}/#${location.id}`,
    name: location.name,
    ...(location.alternateName ? { alternateName: location.alternateName } : {}),
    description: location.description,
    ...(location.url ? { url: resolveStructuredDataUrl(siteUrl, location.url) } : {}),
    telephone: location.telephone,
    email: location.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: location.streetAddress,
      addressLocality: location.addressLocality,
      addressRegion: location.addressRegion,
      addressCountry: location.addressCountry,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: location.latitude,
      longitude: location.longitude,
    },
    ...buildOpeningHours(location),
    ...(location.sameAs?.length ? { sameAs: location.sameAs } : {}),
    parentOrganization: { '@id': `${siteUrl}/#organization` },
  };
}

function getBreadcrumbLabel(segment, config) {
  if (config.trainers?.[segment]) {
    return config.trainers[segment].name;
  }

  return config.breadcrumbLabels?.[segment] || segment.replace(/-/g, ' ');
}

function buildBreadcrumbList(pagePath, siteUrl, config) {
  if (pagePath === '/') {
    return null;
  }

  const skipSegments = new Set(config.breadcrumbSkipSegments || []);
  const segments = pagePath
    .replace(/^\/|\/$/g, '')
    .split('/')
    .filter(Boolean)
    .filter((segment) => !skipSegments.has(segment));
  const items = [
    {
      '@type': 'ListItem',
      position: 1,
      name: config.breadcrumbLabels?.home || 'Главная',
      item: `${siteUrl}/`,
    },
  ];

  let currentPath = '';
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    currentPath += `/${segment}`;
    const crumbPath = `${currentPath}/`;
    const isLast = index === segments.length - 1;

    items.push({
      '@type': 'ListItem',
      position: index + 2,
      name: getBreadcrumbLabel(segment, config),
      ...(isLast ? {} : { item: `${siteUrl}${crumbPath}` }),
    });
  }

  return {
    '@type': 'BreadcrumbList',
    '@id': `${siteUrl}${pagePath}#breadcrumb`,
    itemListElement: items,
  };
}

function buildWebSiteNode(config, siteUrl) {
  return {
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    url: `${siteUrl}/`,
    name: config.organization.name,
    publisher: { '@id': `${siteUrl}/#organization` },
  };
}

function buildPromoOfferNode(offer, siteUrl, pagePath, index) {
  const offerId = `${siteUrl}${pagePath}#offer-${offer.id || index}`;
  const node = {
    '@type': 'Offer',
    '@id': offerId,
    name: offer.name,
    ...(offer.description ? { description: offer.description } : {}),
    url: resolveStructuredDataUrl(siteUrl, offer.url || pagePath),
    availability: 'https://schema.org/InStock',
    seller: { '@id': `${siteUrl}/#organization` },
  };

  if (offer.price != null) {
    node.price = String(offer.price);
    node.priceCurrency = offer.priceCurrency || 'RUB';
  }

  return node;
}

function appendPromosStructuredData(pagePath, siteUrl, config, graph) {
  const promosPage = config.promosPages?.[pagePath];
  if (!promosPage?.offers?.length) {
    return null;
  }

  const offerNodes = promosPage.offers.map((offer, index) =>
    buildPromoOfferNode(offer, siteUrl, pagePath, index),
  );

  if (pagePath === '/promos/') {
    for (const offerNode of offerNodes) {
      graph.push(offerNode);
    }

    const itemList = {
      '@type': 'ItemList',
      '@id': `${siteUrl}${pagePath}#offers`,
      name: promosPage.itemListName || 'Акции ZvenFit',
      itemListElement: offerNodes.map((offerNode, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: { '@id': offerNode['@id'] },
      })),
    };
    graph.push(itemList);
    return { '@id': itemList['@id'] };
  }

  if (pagePath === '/promos/apps/') {
    graph.push(offerNodes[0]);
    return { '@id': offerNodes[0]['@id'] };
  }

  return null;
}

function buildTrialOffer(siteUrl, pagePath, config, locationKey) {
  const offer = config.trialOffer;
  if (!offer || locationKey !== 'chekhova') {
    return {};
  }

  return {
    offers: {
      '@type': 'Offer',
      name: offer.name,
      price: String(offer.price),
      priceCurrency: offer.priceCurrency || 'RUB',
      url: `${siteUrl}${pagePath}`,
      availability: 'https://schema.org/InStock',
    },
  };
}

function buildWebPageNode(pagePath, siteUrl, meta, options = {}) {
  const { mainEntity, includeAbout = false } = options;

  return {
    '@type': 'WebPage',
    '@id': `${siteUrl}${pagePath}#webpage`,
    url: `${siteUrl}${pagePath}`,
    ...(meta.title ? { name: meta.title } : {}),
    ...(meta.description ? { description: meta.description } : {}),
    isPartOf: { '@id': `${siteUrl}/#website` },
    ...(includeAbout ? { about: { '@id': `${siteUrl}/#organization` } } : {}),
    ...(mainEntity ? { mainEntity } : {}),
  };
}

function buildStructuredData(pagePath, config, html) {
  if (pagePath === '/404.html') {
    return null;
  }

  const siteUrl = config.siteUrl.replace(/\/$/, '');
  const meta = extractPageMeta(html);
  const graph = [];
  const useFullGraph = FULL_GRAPH_PAGES.has(pagePath);
  let mainEntity;

  graph.push(buildOrganizationNode(config, siteUrl, { full: useFullGraph }));
  graph.push(buildWebSiteNode(config, siteUrl));

  if (useFullGraph) {
    for (const location of Object.values(config.locations)) {
      graph.push(buildLocationNode(location, siteUrl));
    }
  }

  if (pagePath === '/') {
    mainEntity = { '@id': `${siteUrl}/#organization` };
  }

  if (pagePath === '/contacts/platforms/') {
    mainEntity = Object.values(config.locations).map((location) => ({
      '@id': `${siteUrl}/#${location.id}`,
    }));
  }

  const pageConfig = config.pages?.[pagePath];
  if (pageConfig?.services?.length) {
    const locationKey = pageConfig.primaryLocation || 'chekhova';
    const location = config.locations[locationKey];

    for (const service of pageConfig.services) {
      const serviceId = `${siteUrl}${pagePath}#service`;

      graph.push({
        '@type': 'Service',
        '@id': serviceId,
        name: service.name,
        ...(service.description ? { description: service.description } : {}),
        url: `${siteUrl}${pagePath}`,
        provider: { '@id': `${siteUrl}/#${location.id}` },
        areaServed: {
          '@type': 'City',
          name: 'Звенигород',
        },
        ...buildTrialOffer(siteUrl, pagePath, config, locationKey),
      });
      mainEntity = { '@id': serviceId };
    }
  }

  const trainerMatch = pagePath.match(/^\/trenery\/(trener-[^/]+)\/$/);
  if (trainerMatch && config.trainers?.[trainerMatch[1]]) {
    const trainer = config.trainers[trainerMatch[1]];
    const locationKey = trainer.location || 'chekhova';
    const location = config.locations[locationKey];
    const personId = `${siteUrl}${pagePath}#person`;

    graph.push({
      '@type': 'Person',
      '@id': personId,
      name: trainer.name,
      jobTitle: trainer.jobTitle,
      url: `${siteUrl}${pagePath}`,
      worksFor: { '@id': `${siteUrl}/#${location.id}` },
    });
    mainEntity = { '@id': personId };
  }

  const promosMainEntity = appendPromosStructuredData(
    pagePath,
    siteUrl,
    config,
    graph,
  );
  if (promosMainEntity) {
    mainEntity = promosMainEntity;
  }

  graph.push(
    buildWebPageNode(pagePath, siteUrl, meta, {
      mainEntity,
      includeAbout: pagePath === '/contacts/platforms/',
    }),
  );

  const breadcrumb = buildBreadcrumbList(pagePath, siteUrl, config);
  if (breadcrumb) {
    graph.push(breadcrumb);
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

function injectStructuredData(html, pagePath, config) {
  if (html.includes(structuredDataMarker) || html.includes('application/ld+json')) {
    return html;
  }

  if (!html.includes('</head>')) {
    return html;
  }

  const payload = buildStructuredData(pagePath, config, html);
  if (!payload) {
    return html;
  }

  const snippet = `<script type="application/ld+json">\n${JSON.stringify(payload, null, 2)}\n</script>\n  ${structuredDataMarker}`;

  return html.replace('</head>', `${snippet}\n</head>`);
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

  if (nextHtml.includes(appDownloadPromoMarker)) {
    nextHtml = nextHtml.replace(
      appDownloadPromoMarker,
      loadAppLinksSnippet(appDownloadPromoSnippetPath, appLinksConfig),
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
  const scheduleApiUrl =
    process.env.SCHEDULE_API_URL || (isDev ? 'http://localhost:3000/schedule' : '');
  const assetVersion = process.env.ASSET_VERSION || '2';
  const appLinksConfig = getAppLinksConfig();
  const mapsConfig = getMapsConfig();
  const structuredDataConfig = JSON.parse(
    fs.readFileSync(structuredDataConfigPath, 'utf8'),
  );

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.cpSync(publicDir, distDir, { recursive: true });
  minifySiteCss();

  let headSnippetsInjected = 0;
  let openGraphInjected = 0;
  let structuredDataInjected = 0;
  let appDownloadLinksInjected = 0;
  let mapEmbedsReplaced = 0;
  for (const htmlPath of walkHtmlFiles(distDir)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const pagePath = getPagePath(htmlPath, distDir);
    const skipFooterAppBlock =
      htmlPath.includes(`${path.sep}contacts${path.sep}platforms${path.sep}`) ||
      htmlPath.includes(`${path.sep}promos${path.sep}apps${path.sep}`);
    const withMapEmbeds = replaceMapEmbeds(html, pagePath, mapsConfig);
    const withHeadSnippets = injectHeadSnippets(withMapEmbeds, assetVersion);
    const withOpenGraph = injectOpenGraphHead(
      withHeadSnippets,
      pagePath,
      structuredDataConfig,
    );
    const withStructuredData = injectStructuredData(
      withOpenGraph,
      pagePath,
      structuredDataConfig,
    );
    const withMapScripts = injectMapScripts(
      injectAppDownloadLinks(withStructuredData, appLinksConfig, { skipFooterAppBlock }),
      assetVersion,
    );
    const nextHtml = bustAssetUrls(applySlashPrefix(withMapScripts), assetVersion);

    if (nextHtml !== html) {
      fs.writeFileSync(htmlPath, nextHtml, 'utf8');
    }

    if (withMapEmbeds !== html) {
      mapEmbedsReplaced += 1;
    }

    if (withHeadSnippets !== withMapEmbeds) {
      headSnippetsInjected += 1;
    }

    if (withOpenGraph !== withHeadSnippets) {
      openGraphInjected += 1;
    }

    if (withStructuredData !== withOpenGraph) {
      structuredDataInjected += 1;
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

  if (openGraphInjected > 0) {
    console.log(
      `build-static: injected Open Graph meta into ${openGraphInjected} HTML file(s)`,
    );
  }

  if (structuredDataInjected > 0) {
    console.log(
      `build-static: injected structured data into ${structuredDataInjected} HTML file(s)`,
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

  const scheduleConfigPath = path.join(distDir, 'js', 'schedule-config.js');

  if (fs.existsSync(scheduleConfigPath)) {
    const scheduleConfig = fs.readFileSync(scheduleConfigPath, 'utf8');
    fs.writeFileSync(
      scheduleConfigPath,
      scheduleConfig.replaceAll('__SCHEDULE_API_URL__', scheduleApiUrl),
      'utf8',
    );
  }

  writeMapsConfig(distDir, structuredDataConfig, mapsConfig);

  if (mapEmbedsReplaced > 0) {
    console.log(`build-static: replaced map iframes in ${mapEmbedsReplaced} HTML file(s)`);
  }

  const yandexMapsApiKey = process.env.Y_MAPS_API_KEY || '';
  if (!yandexMapsApiKey) {
    console.warn(
      'build-static: Y_MAPS_API_KEY is empty — maps will show fallback links until it is set',
    );
  } else {
    console.log('build-static: Y_MAPS_API_KEY is set');
  }

  if (!leadApiUrl) {
    console.warn('build-static: LEAD_API_URL is empty — lead form will fail until it is set');
  } else {
    console.log(`build-static: LEAD_API_URL=${leadApiUrl} (NODE_ENV=${nodeEnv})`);
  }

  if (!scheduleApiUrl) {
    console.warn(
      'build-static: SCHEDULE_API_URL is empty — schedule page will fail until it is set',
    );
  } else {
    console.log(`build-static: SCHEDULE_API_URL=${scheduleApiUrl} (NODE_ENV=${nodeEnv})`);
  }

  console.log(`build-static: ASSET_VERSION=${assetVersion}`);
  console.log('build-static: copied public/ -> dist/');
}

module.exports = { runBuild, applySlashPrefix };

if (require.main === module) {
  runBuild();
}
