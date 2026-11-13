'use strict';

// One-off converter for release A: turns the legacy pages of public/ into
// Astro sources. It reads the pages from an explicit legacy SHA (`--ref`),
// never from the working tree, so hotfixes to the frozen public/ tree are
// picked up only by re-running it against the new base.
//
//   node scripts/migrate/html-to-astro.cjs --ref <40-hex> --page /offer/ [--page /privacy/]
//   node scripts/migrate/html-to-astro.cjs --ref <40-hex> --all [--force]
//
// A regular page becomes src/pages/**/index.astro (404.html becomes 404.astro).
// Its body is transferred as it is: known shared blocks (menu, footer with its
// map iframes and app-badge markers, GTM, the app sections of the build
// markers, the site's own scripts) become component calls and hashed imports,
// curly braces are escaped so Astro does not read them as expressions, every
// <script> gets is:inline, and remaining HTML comments are emitted through
// set:html because the compiler drops comments passed as component children.
// A trainer page (/trenery/trener-*/) becomes an entry of the `trainers`
// collection, src/content/trainers/<slug>.json, rendered by one template.
//
// The converter fails with the first difference when a shared block does not
// match its component contract. Pages listed in manual.json are refused unless
// --force is given; with --force the blocks named in the entry's `keep` list
// stay in the page as markup instead of becoming components.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const blocks = require('./shared-blocks.cjs');
const { extractTrainer } = require('./trainer-page.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'src', 'pages');
const DEFAULT_CONTENT = path.join(ROOT, 'src', 'content', 'trainers');
const DEFAULT_MANUAL = path.join(__dirname, 'manual.json');
const SITE_URL = 'https://zvenfit.ru';
const WEBFLOW_SITE_ID = '697f30b67cb029a39716bd07';
const TRAINER_PAGE_RE = /^\/trenery\/(trener-[a-z0-9-]+)\/$/;

const JQUERY_TAG =
  '<script src="https://storage.yandexcloud.net/zvenfit/v2/js/jquery-3.5.1.min.js" type="text/javascript" defer></script>';
const WEBFLOW_TAG_RE = /^\n {2}<script src="\/js\/webflow\.js" type="text\/javascript"( defer)?><\/script>/;
const GTM_HEAD_RE =
  /(<!--( {1,2})Google Tag Manager\2-->\n {2})?(<script>\(function\(w,d,s,l,i\)[\s\S]*?googletagmanager\.com\/gtm\.js[\s\S]*?<\/script>)(\n {2}<!--( {1,2})End Google Tag Manager\5-->)?/;
const GTM_BODY_RE =
  /(<!--( {1,2})Google Tag Manager \(noscript\)\2-->\n {2})?(<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-5532ZMV5" height="0" width="0" style="display:none;visibility:hidden"(?: title="([^"]*)")?><\/iframe><\/noscript>)(\n {2}<!--( {1,2})End Google Tag Manager \(noscript\)\6-->)?/;
const PLACEHOLDER = index => `\u0000${index}\u0000`;

// Build markers of the legacy pipeline and what replaces them. `indent` is the
// leading whitespace of the snippet the legacy build pasted in place of the
// marker, and every snippet ended with a newline.
const SECTION_MARKERS = [
  { marker: '<!-- ZvenFit: app-download-platforms-section -->', component: 'AppDownloadPlatforms', indent: '  ' },
  { marker: '<!-- ZvenFit: app-download-promo-section -->', component: 'AppDownloadPromo', indent: '  ' },
];
const BADGE_MARKERS = [blocks.BADGES_DESKTOP, blocks.BADGES_MOBILE];
const BADGE_INDENT = '    ';

// The site's own classic scripts: imported with ?url and served hashed from
// /_astro/. The runtime configs stay endpoints on their legacy paths.
const OWN_SCRIPTS = new Map([
  ['/js/accordion-horizontal.js', 'scripts/accordion-horizontal.js'],
  ['/js/coaches-show-more.js', 'scripts/coaches-show-more.js'],
  ['/js/lead-form.js', 'scripts/lead-form.js'],
  ['/js/schedule.js', 'scripts/schedule.js'],
  ['/js/vendor/imask-7.6.1.min.js', 'vendor/imask-7.6.1.min.js'],
]);
const CONFIG_SCRIPTS = new Set(['/js/lead-config.js', '/js/schedule-config.js']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return String.fromCodePoint(code);
    }
    if (body in ENTITIES) {
      return ENTITIES[body];
    }
    throw new Error(`html-to-astro: unknown entity ${match}`);
  });
}

// The Astro compiler treats Unicode space separators (U+00A0 and friends) as
// plain whitespace and rewrites them as U+0020, so they must travel as entities.
const UNICODE_SPACE_RE = /[\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g;

function escapeBraces(text) {
  return text
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(UNICODE_SPACE_RE, char => (char === '\u00a0' ? '&nbsp;' : `&#x${char.codePointAt(0).toString(16)};`));
}

// Escapes braces and Unicode spaces everywhere except inside <script>/<style>
// raw text, which the Astro compiler already treats literally.
function escapeBracesOutsideRawText(html) {
  return html
    .split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/)
    .map((segment, index) => (index % 2 === 1 ? segment : escapeBraces(segment)))
    .join('');
}

function markScriptsInline(html) {
  return html.replace(/<script\b(?![^>]*\bis:inline\b)/g, '<script is:inline');
}

function wrapComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, comment => `<Fragment set:html={${JSON.stringify(comment)}} />`);
}

// Webflow serialised `viewBox` in lower case on most inline SVGs. An HTML parser
// restores the case inside SVG, so the DOM is the same either way, but Astro's
// SVG typings (astro check) accept only the spelling of the specification.
function normalizeSvgAttributes(html) {
  return html.replace(/<svg\b[^>]*>/g, tag => tag.replace(/ viewbox=/g, ' viewBox='));
}

function applySlashPrefix(html) {
  return html.replace(/(<([a-zA-Z][\w-]*)([^>]*)>)\/\/([^<]+?)(<\/\2>)/g, (match, _open, tag, attrs, text, close) => {
    let newAttrs;
    if (/class="([^"]*)"/.test(attrs)) {
      newAttrs = attrs.replace(/class="([^"]*)"/, (_, classes) =>
        classes.split(/\s+/).includes('slash-prefix') ? `class="${classes}"` : `class="${classes} slash-prefix"`,
      );
    } else {
      newAttrs = `${attrs} class="slash-prefix"`;
    }
    return `<${tag}${newAttrs}>${text}${close}`;
  });
}

function gitShow(ref, relativePath) {
  try {
    return execFileSync('git', ['show', `${ref}:${relativePath}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`html-to-astro: cannot read ${relativePath} at ${ref}: ${error.message.split('\n')[0]}`);
  }
}

function listLegacyPages(ref) {
  const output = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, 'public/'], { cwd: ROOT, encoding: 'utf8' });
  return output
    .split('\n')
    .filter(file => file.endsWith('.html'))
    .map(file => file.replace(/^public\//, ''))
    .sort();
}

function pagePathFor(relativePath) {
  if (relativePath === 'index.html') {
    return '/';
  }
  if (relativePath.endsWith('/index.html')) {
    return `/${relativePath.slice(0, -'index.html'.length)}`;
  }
  return `/${relativePath}`;
}

function relativePathFor(pagePath) {
  if (pagePath === '/') {
    return 'index.html';
  }
  if (pagePath.endsWith('/')) {
    return `${pagePath.slice(1)}index.html`;
  }
  return pagePath.slice(1);
}

function outputFileFor(pagePath, outDir) {
  if (pagePath === '/') {
    return path.join(outDir, 'index.astro');
  }
  if (pagePath.endsWith('/')) {
    return path.join(outDir, pagePath.slice(1), 'index.astro');
  }
  return path.join(outDir, pagePath.slice(1).replace(/\.html$/, '.astro'));
}

function readSitemapEntries(ref) {
  const xml = gitShow(ref, 'public/sitemap.xml');
  const entries = new Map();
  for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const block = match[1];
    const field = name => block.match(new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`))?.[1];
    const loc = field('loc');
    if (!loc) {
      continue;
    }
    entries.set(loc, { updated: field('lastmod'), changefreq: field('changefreq'), priority: field('priority') });
  }
  return entries;
}

function detectGtmStyle(block) {
  if (!block) {
    return false;
  }
  if (/<!-- {2}Google Tag Manager/.test(block)) {
    return 'commented';
  }
  if (/<!-- Google Tag Manager/.test(block)) {
    return 'single-space';
  }
  return 'bare';
}

// --- head -----------------------------------------------------------------

// Indentation is not part of the contract: whitespace between head nodes does
// not reach the parity comparison.
const HEAD_SKELETON = [
  { re: /^\s*<meta charset="utf-8">$/, key: 'charset' },
  { re: /^\s*<meta (http-equiv)="(X-Content-Type-Options)" content="([^"]*)">$/, key: 'headStart', optional: true },
  { re: /^\s*<meta (name)="(referrer)" content="([^"]*)">$/, key: 'headStart', optional: true },
  { re: /^\s*<title>(.*)<\/title>$/, key: 'title' },
  { re: /^\s*<meta name="description" content="(.*)">$/, key: 'description' },
  { re: /^\s*<meta name="robots" content="(.*)">$/, key: 'robots', optional: true },
  { re: /^\s*<meta content="width=device-width, initial-scale=1" name="viewport">$/, key: 'viewport' },
  { re: /^\s*<link rel="canonical" href="(.*)">$/, key: 'canonical' },
  { re: /^\s*<link href="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/css\/normalize\.min\.css" rel="stylesheet" type="text\/css">$/, key: 'normalize' },
  { re: /^\s*<link href="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/css\/webflow\.min\.css" rel="stylesheet" type="text\/css">$/, key: 'webflowCss' },
  { re: /^\s*<link href="\/css\/zvenfit\.webflow\.css" rel="stylesheet" type="text\/css">$/, key: 'siteCss' },
  { re: /^\s*<link href="(\/css\/[^"]+\.css)" rel="stylesheet" type="text\/css">$/, key: 'pageCss', optional: true },
  { re: /^\s*<link rel="preconnect" href="https:\/\/storage\.yandexcloud\.net">$/, key: 'preconnectStorage' },
  { re: /^\s*<link href="https:\/\/fonts\.bunny\.net" rel="preconnect" crossorigin="anonymous">$/, key: 'preconnectFonts' },
  { re: /^\s*<script type="text\/javascript">!function\(o,c\)\{var n=c\.documentElement,t=" w-mod-";n\.className\+=t\+"js",\("ontouchstart"in o\|\|o\.DocumentTouch&&c instanceof DocumentTouch\)&&\(n\.className\+=t\+"touch"\)\}\(window,document\);<\/script>$/, key: 'bootstrap' },
  { re: /^\s*<link href="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/images\/favicon\.png" rel="shortcut icon" type="image\/x-icon">$/, key: 'favicon' },
  { re: /^\s*<link href="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/images\/webclip\.png" rel="apple-touch-icon">$/, key: 'webclip' },
];

function parseHead(headInner, pagePath) {
  const gtm = headInner.match(GTM_HEAD_RE);
  const gtmStyle = detectGtmStyle(gtm?.[0]);
  const withoutGtm = gtm ? headInner.replace(GTM_HEAD_RE, '') : headInner;
  const lines = withoutGtm.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n').filter(line => line.trim() !== '');
  const head = { gtm: gtmStyle, extras: [], headStart: [] };
  let cursor = 0;
  for (const slot of HEAD_SKELETON) {
    const line = lines[cursor];
    const match = line === undefined ? null : line.match(slot.re);
    if (!match) {
      if (slot.optional) {
        continue;
      }
      throw new Error(`html-to-astro: ${pagePath} head line ${cursor + 1} does not match the shared skeleton (${slot.key}): ${JSON.stringify(line)}`);
    }
    if (slot.key === 'headStart') {
      head.headStart.push({ attribute: match[1], name: match[2], content: match[3] });
    } else {
      head[slot.key] = match[1];
    }
    cursor += 1;
  }
  for (const line of lines.slice(cursor)) {
    const own = line.match(/^\s*<meta property="(og:image|twitter:image)" content="([^"]*)">$/);
    if (!own) {
      throw new Error(`html-to-astro: ${pagePath} has an unsupported head line: ${JSON.stringify(line)}; add the page to manual.json`);
    }
    head.extras.push({ property: own[1], content: own[2] });
  }
  return head;
}

// --- document frame -----------------------------------------------------------

function readDocument(ref, relativePath) {
  const pagePath = pagePathFor(relativePath);
  const source = gitShow(ref, `public/${relativePath}`);
  const prologue = source.match(/^<!DOCTYPE html>([\s\S]*?)\n<html([^>]*)>\n<head>\n([\s\S]*?)<\/head>\n<body class="body">([\s\S]*)<\/body>\n<\/html>\s*$/);
  if (!prologue) {
    throw new Error(`html-to-astro: ${pagePath} does not have the expected document frame`);
  }
  const [, webflowComments, htmlAttributes, headInner, bodyInner] = prologue;
  if (!/^(?:<!--[\s\S]*?-->)+$/.test(webflowComments) && webflowComments !== '') {
    throw new Error(`html-to-astro: ${pagePath} has unexpected content between the doctype and <html>`);
  }
  const htmlAttrs = {};
  for (const match of htmlAttributes.matchAll(/\s([a-z-]+)="([^"]*)"/g)) {
    htmlAttrs[match[1]] = match[2];
  }
  const knownHtmlAttrs = new Set(['lang', 'data-wf-page', 'data-wf-site', 'data-zvenfit-page']);
  for (const name of Object.keys(htmlAttrs)) {
    if (!knownHtmlAttrs.has(name)) {
      throw new Error(`html-to-astro: ${pagePath} has an unsupported <html> attribute ${name}`);
    }
  }
  if (htmlAttrs.lang !== 'ru') {
    throw new Error(`html-to-astro: ${pagePath} must declare lang="ru"`);
  }
  return { pagePath, source, webflowComments, htmlAttrs, head: parseHead(headInner, pagePath), bodyInner };
}

function logoMarkup() {
  const pair = fs.readFileSync(path.join(ROOT, 'src', 'components', 'logo-embeds.html'), 'utf8');
  const full = pair.match(/<div class="code-embed-6 w-embed">(<svg[\s\S]*<\/svg>)<\/div>$/)?.[1];
  if (!pair.startsWith('<div class="code-embed-5 w-embed">') || !full) {
    throw new Error('html-to-astro: cannot read the logo markup from src/components/logo-embeds.html');
  }
  return { pair, full };
}

function sitemapLine(entry) {
  return `export const sitemap = { updated: '${entry.updated}', changefreq: '${entry.changefreq}', priority: '${entry.priority}' };`;
}

function identifierFor(file) {
  return path.posix
    .basename(file)
    .replace(/\.(?:min\.)?(?:js|css)$/, '')
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
    .replace(/^[0-9]/, digit => `_${digit}`);
}

// --- page conversion --------------------------------------------------------

function convertPage({ ref, relativePath, sitemapEntries, logo, templates, keep = [] }) {
  const { pagePath, source, webflowComments, htmlAttrs, head, bodyInner } = readDocument(ref, relativePath);
  const unknownKeep = keep.filter(name => !['menu', 'footer'].includes(name));
  if (unknownKeep.length > 0) {
    throw new Error(`html-to-astro: ${pagePath} manual.json keeps unknown blocks: ${unknownKeep.join(', ')}`);
  }
  const components = new Set();
  const assetImports = new Map();
  const placeholders = [];
  const placeholder = markup => {
    placeholders.push(markup);
    return PLACEHOLDER(placeholders.length - 1);
  };
  const component = (name, markup) => {
    components.add(name);
    return placeholder(markup);
  };

  const jqueryIndex = bodyInner.indexOf(JQUERY_TAG);
  if (jqueryIndex === -1) {
    throw new Error(`html-to-astro: ${pagePath} has no jQuery script tag`);
  }
  let content = bodyInner.slice(0, jqueryIndex);
  let tail = bodyInner.slice(jqueryIndex + JQUERY_TAG.length);
  const webflow = tail.match(WEBFLOW_TAG_RE);
  if (!webflow) {
    throw new Error(`html-to-astro: ${pagePath} does not load /js/webflow.js right after jQuery`);
  }
  const webflowDefer = Boolean(webflow[1]);
  tail = tail.slice(webflow[0].length);

  const replaceGtm = html =>
    html.replace(GTM_BODY_RE, (block, _open, _pad, _noscript, title) => {
      const frameTitle = title === undefined ? '' : ` frameTitle=${JSON.stringify(decodeEntities(title))}`;
      return component('Analytics', `<Analytics placement="body" gtm=${JSON.stringify(detectGtmStyle(block))}${frameTitle} />`);
    });
  content = replaceGtm(content);
  tail = replaceGtm(tail);

  const menu = content.match(/<section class="menu[^"]*"[^>]*>[\s\S]*?<\/section>/);
  if (menu && !keep.includes('menu')) {
    content = content.replace(menu[0], component('Menu', blocks.convertMenu(menu[0], { pagePath, logo, decode: decodeEntities })));
  }
  const footer = content.match(blocks.FOOTER_RE);
  if (footer && !keep.includes('footer')) {
    content = content.replace(footer[0], component('Footer', blocks.convertFooter(footer[0], { pagePath, templates })));
  }

  // A footer the page keeps as markup still gets its map iframes and badge
  // markers replaced, as the legacy build did; the section markers of the app
  // blocks stand in the page content of any page.
  const hasMaps = source.includes('map-widget');
  const convertMarkers = html => {
    let next = html;
    if (keep.includes('footer')) {
      next = next.replace(blocks.MAP_IFRAME_RE, () => component('MapRegion', '<MapRegion />'));
      for (const marker of BADGE_MARKERS.filter(item => next.includes(item))) {
        next = next.split(marker).join(component('AppDownloadBadges', `${BADGE_INDENT}<AppDownloadBadges />\n`));
      }
    }
    for (const { marker, component: name, indent } of SECTION_MARKERS.filter(item => next.includes(item.marker))) {
      next = next.split(marker).join(component(name, `${indent}<${name} />\n`));
    }
    return next;
  };
  const convertScripts = html =>
    html.replace(/<script src="(\/(?:js|css)\/[^"]*)"([^>]*)><\/script>/g, (tag, src, attributes) => {
      if (CONFIG_SCRIPTS.has(src)) {
        return placeholder(`<script is:inline src="${src}"${attributes}></script>`);
      }
      const file = OWN_SCRIPTS.get(src);
      if (!file) {
        throw new Error(`html-to-astro: ${pagePath} loads ${src}, which is neither a known own script nor a runtime config`);
      }
      const identifier = identifierFor(file);
      assetImports.set(identifier, file);
      return placeholder(`<script is:inline src={${identifier}}${attributes}></script>`);
    });
  content = convertScripts(convertMarkers(content));
  tail = convertScripts(convertMarkers(tail));

  for (const [name, html] of [['content', content], ['tail', tail]]) {
    if (/map-widget/.test(html)) {
      throw new Error(`html-to-astro: ${pagePath} ${name} still contains a map iframe outside the footer`);
    }
    if (/<!-- ZvenFit:/.test(html)) {
      throw new Error(`html-to-astro: ${pagePath} ${name} contains a build marker the converter does not handle`);
    }
    if (/(?:src|href)="\/(?:js|css)\//.test(html)) {
      throw new Error(`html-to-astro: ${pagePath} ${name} still references a legacy /js or /css path`);
    }
  }

  const finish = html => {
    const prepared = wrapComments(markScriptsInline(escapeBracesOutsideRawText(normalizeSvgAttributes(applySlashPrefix(html)))));
    return prepared.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)]);
  };
  const slotContent = finish(content);
  const slotTail = finish(tail);

  const props = [`title=${JSON.stringify(decodeEntities(head.title))}`, `description=${JSON.stringify(decodeEntities(head.description))}`];
  if (head.canonical !== `${SITE_URL}${pagePath}`) {
    props.push(`canonical=${JSON.stringify(head.canonical)}`);
  }
  if (head.robots !== undefined) {
    props.push(`robots=${JSON.stringify(head.robots)}`);
  }
  if (htmlAttrs['data-wf-page']) {
    props.push(`wfPage=${JSON.stringify(htmlAttrs['data-wf-page'])}`);
  }
  if (htmlAttrs['data-wf-site']) {
    props.push(`wfSite=${JSON.stringify(htmlAttrs['data-wf-site'])}`);
  }
  if (htmlAttrs['data-zvenfit-page']) {
    props.push(`zvenfitPage=${JSON.stringify(htmlAttrs['data-zvenfit-page'])}`);
  }
  if (webflowComments) {
    props.push(`webflowComments=${JSON.stringify(webflowComments)}`);
  }
  if (head.gtm !== 'commented') {
    props.push(`gtm=${JSON.stringify(head.gtm)}`);
  }
  if (hasMaps) {
    props.push('hasMaps');
  }
  if (pagePath === '/404.html') {
    props.push('trackViews={false}');
  }
  const ownImage = head.extras.find(extra => extra.property === 'og:image');
  if (ownImage) {
    props.push(`ogImage=${JSON.stringify(ownImage.content)}`);
  }
  if (head.extras.length > 0) {
    props.push(`openGraphSkip={${JSON.stringify(head.extras.map(extra => extra.property))}}`);
  }

  const depth = pagePath === '/' || !pagePath.endsWith('/') ? 1 : pagePath.split('/').length - 1;
  const up = '../'.repeat(depth);
  const imports = [...components].sort().map(name => `import ${name} from '${up}components/${name}.astro';`);
  imports.push(`import Base from '${up}layouts/Base.astro';`);
  const urlImports = [...assetImports].sort(([a], [b]) => a.localeCompare(b)).map(([identifier, file]) => `import ${identifier} from '${up}${file}?url';`);
  const headSlot = [];
  for (const meta of head.headStart) {
    headSlot.push(`<meta slot="head-start" ${meta.attribute}=${JSON.stringify(meta.name)} content=${JSON.stringify(meta.content)} />`);
  }
  if (head.pageCss) {
    const file = path.posix.basename(head.pageCss);
    const identifier = identifierFor(file);
    urlImports.push(`import ${identifier} from '${up}styles/${file}?url';`);
    headSlot.push(`<link slot="styles" href={${identifier}} rel="stylesheet" type="text/css" />`);
  }
  for (const extra of head.extras) {
    headSlot.push(`<meta slot="head" property=${JSON.stringify(extra.property)} content=${JSON.stringify(extra.content)} />`);
  }

  const frontmatter = [...imports, ...urlImports];
  const sitemapEntry = sitemapEntries.get(`${SITE_URL}${pagePath}`);
  if (sitemapEntry) {
    frontmatter.push('', sitemapLine(sitemapEntry));
  } else if (pagePath !== '/404.html') {
    throw new Error(`html-to-astro: ${pagePath} is missing from the legacy sitemap`);
  }

  const output = [
    '---',
    ...frontmatter,
    '---',
    `<Base ${props.join(' ')}>${headSlot.join('')}${slotContent}<Fragment slot="scripts">${slotTail}</Fragment></Base>`,
    '',
  ].join('\n');

  return { pagePath, output, webflowDefer, hasMaps, gtm: head.gtm, kept: keep };
}

// --- trainer conversion -------------------------------------------------------

// Fragments rendered through set:html keep their legacy bytes, entities included.
const keepHtml = fragment => fragment;

function convertTrainer({ ref, relativePath, sitemapEntries, profiles }) {
  const { pagePath, source, htmlAttrs, head } = readDocument(ref, relativePath);
  const slug = pagePath.match(TRAINER_PAGE_RE)[1];
  const page = extractTrainer({ slug, source, text: decodeEntities, html: keepHtml });
  const fail = message => {
    throw new Error(`html-to-astro: ${pagePath} ${message}`);
  };
  if (htmlAttrs['data-wf-site'] !== WEBFLOW_SITE_ID || htmlAttrs['data-zvenfit-page']) {
    fail('carries <html> attributes the trainer template does not render');
  }
  if (head.canonical !== `${SITE_URL}${pagePath}` || head.robots !== undefined || head.pageCss || head.extras.length || head.headStart.length) {
    fail('has head tags the trainer template does not render');
  }
  if (head.gtm !== page.bodyGtm) {
    fail(`mixes GTM comment styles: ${head.gtm} in the head, ${page.bodyGtm} in the body`);
  }
  const profile = profiles?.[slug];
  if (!profile?.name || !profile.jobTitle || !profile.location) {
    fail('has no name, jobTitle and location in the trainers block of scripts/structured-data.config.json at the same ref');
  }
  const sitemapEntry = sitemapEntries.get(`${SITE_URL}${pagePath}`);
  if (!sitemapEntry) {
    fail('is missing from the legacy sitemap');
  }

  const legacy = { markup: page.markup };
  if (page.webflowComments) {
    legacy.webflowComments = page.webflowComments;
  }
  if (page.bodyGtm === 'bare') {
    legacy.gtm = 'bare';
  }
  if (page.ctaSpace === ' ') {
    legacy.ctaRegularSpace = true;
  }
  if (page.certificateIndent !== undefined && page.certificateIndent !== 6) {
    legacy.certificateIndent = page.certificateIndent;
  }
  if (page.certificateLinkRel) {
    legacy.certificateLinkRel = page.certificateLinkRel;
  }
  if (page.backFallbackPath !== '/') {
    legacy.backFallbackPath = page.backFallbackPath;
  }

  const entry = {
    wfPage: page.wfPage,
    name: profile.name,
    nameDative: page.nameDative,
    jobTitle: profile.jobTitle,
    location: profile.location,
    headingHtml: page.heading,
    roleHtml: page.role,
    ...(page.photoClass ? { photoClass: page.photoClass } : {}),
    groups: page.groups,
    ...(page.certificates
      ? {
          certificates: page.certificates.map(({ title, description, href, wNode, plainDescription }) => ({
            title,
            descriptionHtml: description,
            href,
            ...(wNode ? { wNode } : {}),
            ...(plainDescription ? { plainDescription } : {}),
          })),
        }
      : {}),
    ...(page.certificatesSectionEmpty ? { certificatesSectionEmpty: true } : {}),
    nextSlug: page.nextSlug,
    updated: sitemapEntry.updated,
    sitemap: { changefreq: sitemapEntry.changefreq, priority: sitemapEntry.priority },
    meta: { title: decodeEntities(head.title), description: decodeEntities(head.description) },
    legacy,
  };
  // Non-breaking spaces stay visible in the JSON source.
  const output = `${JSON.stringify(entry, null, 2).replace(/\u00a0/g, '\\u00a0')}\n`;
  return { pagePath, slug, entry, output, gtm: head.gtm };
}

// Every `legacy` field of the generated entries must be recorded in manual.json
// with a reason and exactly the entries that carry it.
function checkTrainerDeviations(entries, manual) {
  const recorded = manual.trainers?.legacy || {};
  const actual = new Map();
  for (const { slug, entry } of entries) {
    for (const [field, value] of Object.entries(entry.legacy)) {
      const key = field === 'markup' ? `markup=${value}` : field;
      actual.set(key, [...(actual.get(key) || []), slug]);
    }
    for (const [index, certificate] of (entry.certificates || []).entries()) {
      if (certificate.plainDescription) {
        actual.set('certificates.plainDescription', [...(actual.get('certificates.plainDescription') || []), `${slug}#${index + 1}`]);
      }
    }
    if (entry.certificatesSectionEmpty) {
      actual.set('certificatesSectionEmpty', [...(actual.get('certificatesSectionEmpty') || []), slug]);
    }
  }
  const problems = [];
  for (const [key, slugs] of actual) {
    const record = recorded[key];
    if (!record?.reason || JSON.stringify([...(record.entries || [])].sort()) !== JSON.stringify([...slugs].sort())) {
      problems.push(`${key}: ${slugs.sort().join(', ')}`);
    }
  }
  for (const key of Object.keys(recorded)) {
    if (!actual.has(key)) {
      problems.push(`${key}: recorded in manual.json but no entry carries it`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`html-to-astro: trainer deviations differ from scripts/migrate/manual.json (trainers.legacy); record each with a reason:\n  ${problems.join('\n  ')}`);
  }
}

// --- cli ------------------------------------------------------------------

function parseArguments(argv) {
  const options = { pages: [], all: false, force: false, out: DEFAULT_OUT, content: DEFAULT_CONTENT, manual: DEFAULT_MANUAL };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--ref':
        options.ref = argv[++index];
        break;
      case '--page':
        options.pages.push(argv[++index]);
        break;
      case '--all':
        options.all = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--out':
        options.out = path.resolve(ROOT, argv[++index]);
        break;
      case '--content':
        options.content = path.resolve(ROOT, argv[++index]);
        break;
      case '--manual':
        options.manual = path.resolve(ROOT, argv[++index]);
        break;
      default:
        throw new Error(`html-to-astro: unknown argument ${argument}`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(options.ref || '')) {
    throw new Error('html-to-astro: --ref must be the full 40-hex legacy base SHA');
  }
  if (!options.all && options.pages.length === 0) {
    throw new Error('html-to-astro: pass --page <path> (repeatable) or --all');
  }
  return options;
}

function run(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const manual = JSON.parse(fs.readFileSync(options.manual, 'utf8'));
  const sitemapEntries = readSitemapEntries(options.ref);
  const logo = logoMarkup();
  const templates = blocks.footerTemplates({
    classicSource: gitShow(options.ref, 'public/privacy/index.html'),
    gridSource: gitShow(options.ref, 'public/index.html'),
  });
  const profiles = JSON.parse(gitShow(options.ref, 'scripts/structured-data.config.json')).trainers;
  const relativePaths = options.all ? listLegacyPages(options.ref) : options.pages.map(relativePathFor);
  const results = [];
  const refused = [];
  for (const relativePath of relativePaths) {
    const pagePath = pagePathFor(relativePath);
    const manualEntry = manual.pages?.[pagePath];
    if (manualEntry && !options.force) {
      const message = `html-to-astro: ${pagePath} is maintained by hand (${manualEntry.reason}); pass --force to regenerate it`;
      if (!options.all) {
        throw new Error(message);
      }
      refused.push(message);
      continue;
    }
    if (TRAINER_PAGE_RE.test(pagePath)) {
      const result = convertTrainer({ ref: options.ref, relativePath, sitemapEntries, profiles });
      const outputFile = path.join(options.content, `${result.slug}.json`);
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, result.output, 'utf8');
      results.push({ ...result, outputFile });
      console.log(`html-to-astro: ${pagePath} -> ${path.relative(ROOT, outputFile)} (${result.entry.legacy.markup} markup; gtm ${result.gtm})`);
      continue;
    }
    const result = convertPage({ ref: options.ref, relativePath, sitemapEntries, logo, templates, keep: manualEntry?.keep });
    const outputFile = outputFileFor(pagePath, options.out);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, result.output, 'utf8');
    results.push({ ...result, outputFile });
    const notes = [
      result.webflowDefer ? '' : 'webflow.js without defer in legacy (deviation recorded for /offer/)',
      result.hasMaps ? 'maps' : '',
      `gtm ${result.gtm}`,
      result.kept.length ? `kept as markup: ${result.kept.join(', ')}` : '',
    ].filter(Boolean);
    console.log(`html-to-astro: ${pagePath} -> ${path.relative(ROOT, outputFile)}${notes.length ? ` (${notes.join('; ')})` : ''}`);
  }
  const trainerResults = results.filter(result => result.entry);
  if (options.all) {
    checkTrainerDeviations(trainerResults, manual);
  }
  if (refused.length > 0) {
    throw new Error(refused.join('\n'));
  }
  return results;
}

module.exports = {
  GTM_BODY_RE,
  GTM_HEAD_RE,
  applySlashPrefix,
  checkTrainerDeviations,
  convertPage,
  convertTrainer,
  decodeEntities,
  detectGtmStyle,
  escapeBracesOutsideRawText,
  identifierFor,
  logoMarkup,
  markScriptsInline,
  normalizeSvgAttributes,
  outputFileFor,
  pagePathFor,
  parseHead,
  readDocument,
  relativePathFor,
  wrapComments,
};

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
