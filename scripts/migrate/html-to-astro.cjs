'use strict';

// One-off converter for release A: turns a legacy page from public/ into an
// Astro page under src/pages. It reads the page from an explicit legacy SHA
// (`--ref`), never from the working tree, so hotfixes to the frozen public/
// tree are picked up only by re-running it against the new base.
//
//   node scripts/migrate/html-to-astro.cjs --ref <40-hex> --page /offer/ [--page /privacy/]
//   node scripts/migrate/html-to-astro.cjs --ref <40-hex> --all
//
// The body is transferred as it is: known shared blocks (menu, footer with its
// map iframes and app-badge markers, GTM) become component calls, curly braces
// are escaped so Astro does not read them as expressions, every <script> gets
// is:inline, and remaining HTML comments are emitted through set:html because
// the compiler drops comments passed as component children. Pages listed in
// manual.json are refused unless --force is given. The converter fails with a
// diff when a shared block does not match the component contract.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'src', 'pages');
const DEFAULT_MANUAL = path.join(__dirname, 'manual.json');
const SITE_URL = 'https://zvenfit.ru';
const SITE_CSS = '/css/zvenfit.webflow.css';

const JQUERY_TAG =
  '<script src="https://storage.yandexcloud.net/zvenfit/v2/js/jquery-3.5.1.min.js" type="text/javascript" defer></script>';
const WEBFLOW_TAG_RE = /^\n {2}<script src="\/js\/webflow\.js" type="text\/javascript"( defer)?><\/script>/;
const MAP_IFRAME_RE = /<div class="code-embed-4 w-embed w-iframe"><iframe[^>]*map-widget[^>]*>\s*<\/iframe><\/div>/g;
const GTM_HEAD_RE =
  /(<!--( {1,2})Google Tag Manager\2-->\n {2})?(<script>\(function\(w,d,s,l,i\)[\s\S]*?googletagmanager\.com\/gtm\.js[\s\S]*?<\/script>)(\n {2}<!--( {1,2})End Google Tag Manager\5-->)?/;
const GTM_BODY_RE =
  /(<!--( {1,2})Google Tag Manager \(noscript\)\2-->\n {2})?(<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html[^>]*><\/iframe><\/noscript>)(\n {2}<!--( {1,2})End Google Tag Manager \(noscript\)\5-->)?/;
const BADGES_DESKTOP = '<!-- ZvenFit: app-download-links-desktop -->';
const BADGES_MOBILE = '<!-- ZvenFit: app-download-links-mobile -->';
const PLACEHOLDER = (index) => `\u0000${index}\u0000`;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

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
    .replace(UNICODE_SPACE_RE, (char) => (char === '\u00a0' ? '&nbsp;' : `&#x${char.codePointAt(0).toString(16)};`));
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
  return html.replace(/<!--[\s\S]*?-->/g, (comment) => `<Fragment set:html={${JSON.stringify(comment)}} />`);
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
    .filter((file) => file.endsWith('.html'))
    .map((file) => file.replace(/^public\//, ''))
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
    const field = (name) => block.match(new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`))?.[1];
    const loc = field('loc');
    if (!loc) {
      continue;
    }
    entries.set(loc, { updated: field('lastmod'), changefreq: field('changefreq'), priority: field('priority') });
  }
  return entries;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : undefined;
}

function detectGtmStyle(block) {
  if (!block) {
    return false;
  }
  if (/<!--  Google Tag Manager/.test(block)) {
    return 'commented';
  }
  if (/<!-- Google Tag Manager/.test(block)) {
    return 'single-space';
  }
  return 'bare';
}

// --- head -----------------------------------------------------------------

const HEAD_SKELETON = [
  { re: /^ {2}<meta charset="utf-8">$/, key: 'charset' },
  { re: /^ {2}<title>(.*)<\/title>$/, key: 'title' },
  { re: /^ {2}<meta name="description" content="(.*)">$/, key: 'description' },
  { re: /^ {2}<meta name="robots" content="(.*)">$/, key: 'robots', optional: true },
  { re: /^ {2}<meta content="width=device-width, initial-scale=1" name="viewport">$/, key: 'viewport' },
  { re: /^ {2}<link rel="canonical" href="(.*)">$/, key: 'canonical' },
  { re: /^ {2}<link href="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/css\/normalize\.min\.css" rel="stylesheet" type="text\/css">$/, key: 'normalize' },
  { re: /^ {2}<link href="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/css\/webflow\.min\.css" rel="stylesheet" type="text\/css">$/, key: 'webflowCss' },
  { re: /^ {2}<link href="\/css\/zvenfit\.webflow\.css" rel="stylesheet" type="text\/css">$/, key: 'siteCss' },
  { re: /^ {2}<link href="(\/css\/[^"]+\.css)" rel="stylesheet" type="text\/css">$/, key: 'pageCss', optional: true },
  { re: /^ {2}<link rel="preconnect" href="https:\/\/storage\.yandexcloud\.net">$/, key: 'preconnectStorage' },
  { re: /^ {2}<link href="https:\/\/fonts\.bunny\.net" rel="preconnect" crossorigin="anonymous">$/, key: 'preconnectFonts' },
  { re: /^ {2}<script type="text\/javascript">!function\(o,c\)\{var n=c\.documentElement,t=" w-mod-";n\.className\+=t\+"js",\("ontouchstart"in o\|\|o\.DocumentTouch&&c instanceof DocumentTouch\)&&\(n\.className\+=t\+"touch"\)\}\(window,document\);<\/script>$/, key: 'bootstrap' },
  { re: /^ {2}<link href="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/images\/favicon\.png" rel="shortcut icon" type="image\/x-icon">$/, key: 'favicon' },
  { re: /^ {2}<link href="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/images\/webclip\.png" rel="apple-touch-icon">$/, key: 'webclip' },
];

function parseHead(headInner, pagePath) {
  const gtm = headInner.match(GTM_HEAD_RE);
  const gtmStyle = detectGtmStyle(gtm?.[0]);
  const withoutGtm = gtm ? headInner.replace(GTM_HEAD_RE, '') : headInner;
  const lines = withoutGtm.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n').filter((line) => line.trim() !== '');
  const head = { gtm: gtmStyle, extras: [] };
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
    head[slot.key] = match[1];
    cursor += 1;
  }
  for (const line of lines.slice(cursor)) {
    const own = line.match(/^ {2}<meta property="(og:image|twitter:image)" content="([^"]*)">$/);
    if (!own) {
      throw new Error(`html-to-astro: ${pagePath} has an unsupported head line: ${JSON.stringify(line)}; add the page to manual.json`);
    }
    head.extras.push({ property: own[1], content: own[2] });
  }
  return head;
}

// --- shared blocks ----------------------------------------------------------

const MENU3_RE =
  /^<section class="menu3">\n {4}<div class="menu_grid-4">\n {6}<a href="\/" class="link-block-4 w-inline-block"( aria-label="[^"]*")?>\n {8}(<div class="code-embed-5 w-embed"><svg[\s\S]*?<\/svg><\/div>\n {8}<div class="code-embed-6 w-embed"><svg[\s\S]*?<\/svg><\/div>|<div class="menu-txt">([^<]*)<\/div>)\n {6}<\/a>\n {6}<a( data-back="true")? href="([^"]*)"( target="[^"]*")? class="link-block-page([1-4]) w-inline-block">\n {8}<div class="menu-txt">([^<]*)<\/div>\n {6}<\/a>\n {4}<\/div>\n {2}<\/section>$/;

function logoEmbeds(ref) {
  const markup = fs.readFileSync(path.join(ROOT, 'src', 'components', 'logo-embeds.html'), 'utf8');
  if (!markup.startsWith('<div class="code-embed-5 w-embed">')) {
    throw new Error(`html-to-astro: cannot read the logo markup from src/components/logo-embeds.html (ref ${ref})`);
  }
  return markup;
}

function convertMenu(block, pagePath, logoMarkup) {
  const match = block.match(MENU3_RE);
  if (!match) {
    throw new Error(`html-to-astro: ${pagePath} menu does not match the plain menu contract; add the page to manual.json`);
  }
  const [, ariaLabel, logo, logoText, dataBack, href, target, blockNumber, label] = match;
  const props = [`variant="plain"`];
  if (logo.startsWith('<div class="code-embed-5')) {
    if (logo !== logoMarkup) {
      throw new Error(`html-to-astro: ${pagePath} logo embeds differ from LogoEmbeds.astro`);
    }
  } else {
    props.push(`logo="text"`, `logoText=${JSON.stringify(decodeEntities(logoText))}`);
  }
  if (ariaLabel) {
    props.push(`logoLabel=${JSON.stringify(decodeEntities(attribute(ariaLabel, 'aria-label')))}`);
  }
  const secondary = { label: decodeEntities(label), href };
  if (target) {
    secondary.target = attribute(target, 'target');
  }
  if (dataBack) {
    secondary.dataBack = true;
  }
  secondary.block = Number(blockNumber);
  props.push(`secondary={${JSON.stringify(secondary)}}`);
  return `<Menu ${props.join(' ')} />`;
}

// The footer contract is the legacy footer of the privacy page at the same
// ref with the current-page attributes removed; a page's expected footer is
// that template with aria-current/w--current applied to its own legal link.
const FOOTER_REFERENCE_PAGE = 'public/privacy/index.html';
const FOOTER_REFERENCE_PATH = '/privacy/';

function footerTemplate(ref) {
  const source = gitShow(ref, FOOTER_REFERENCE_PAGE);
  const match = source.match(/<section class="section-4">[\s\S]*?<\/section>\n {2}<section class="section-3">[\s\S]*?<\/section>/);
  if (!match) {
    throw new Error(`html-to-astro: cannot find the reference footer in ${FOOTER_REFERENCE_PAGE} at ${ref}`);
  }
  const template = match[0].replace(/ aria-current="page"/g, '').replace(/ w--current/g, '');
  if (!template.includes(BADGES_DESKTOP) || !template.includes(BADGES_MOBILE)) {
    throw new Error('html-to-astro: the reference footer must carry both app-badge markers');
  }
  return template;
}

function expectedFooter(template, { pagePath, badges }) {
  let expected = template.replace(
    /<a href="(\/privacy\/|\/payment-policy\/|\/offer\/)" target="_blank" class="([^"]*)">/g,
    (tag, href, classes) => (href === pagePath ? `<a href="${href}" target="_blank" aria-current="page" class="${classes} w--current">` : tag),
  );
  if (!badges) {
    expected = expected.replace(BADGES_DESKTOP, '').replace(BADGES_MOBILE, '');
  }
  return expected;
}

function firstDifference(expected, actual) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  for (let index = 0; index < Math.max(expectedLines.length, actualLines.length); index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return `line ${index + 1}\n  expected: ${JSON.stringify(expectedLines[index])}\n  actual:   ${JSON.stringify(actualLines[index])}`;
    }
  }
  return 'no textual difference';
}

function convertFooter(block, pagePath, template) {
  const badges = block.includes(BADGES_DESKTOP);
  const expected = expectedFooter(template, { pagePath, badges });
  if (block !== expected) {
    throw new Error(
      `html-to-astro: ${pagePath} footer differs from the shared Footer contract; add the page to manual.json or extend the component.\n${firstDifference(expected, block)}`,
    );
  }
  return badges ? '<Footer location="chekhova" />' : '<Footer location="chekhova" badges={false} />';
}

// --- page conversion --------------------------------------------------------

function convertPage({ ref, relativePath, sitemapEntries, logoMarkup, footerMarkup }) {
  const pagePath = pagePathFor(relativePath);
  const source = gitShow(ref, `public/${relativePath}`);
  const prologue = source.match(/^<!DOCTYPE html>([\s\S]*?)\n<html([^>]*)>\n<head>\n([\s\S]*?)<\/head>\n<body class="body">([\s\S]*)<\/body>\n<\/html>\s*$/);
  if (!prologue) {
    throw new Error(`html-to-astro: ${pagePath} does not have the expected document frame`);
  }
  const [, webflowComments, htmlAttributes, headInner, bodyInner] = prologue;
  if (!/^<!--[\s\S]*-->$/.test(webflowComments) && webflowComments !== '') {
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

  const head = parseHead(headInner, pagePath);
  const components = new Set(['Base']);
  const placeholders = [];
  const placeholder = (markup) => {
    placeholders.push(markup);
    return PLACEHOLDER(placeholders.length - 1);
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

  const replaceGtm = (html) =>
    html.replace(GTM_BODY_RE, (block) => {
      components.add('Analytics');
      return placeholder(`<Analytics placement="body" gtm=${JSON.stringify(detectGtmStyle(block))} />`);
    });
  content = replaceGtm(content);
  tail = replaceGtm(tail);

  const menu = content.match(/<section class="menu[^"]*">[\s\S]*?<\/section>/);
  if (menu) {
    components.add('Menu');
    content = content.replace(menu[0], placeholder(convertMenu(menu[0], pagePath, logoMarkup)));
  }
  const footer = content.match(/<section class="section-4">[\s\S]*?<\/section>(\n {2}<section class="section-3">[\s\S]*?<\/section>)?/);
  if (footer) {
    components.add('Footer');
    content = content.replace(footer[0], placeholder(convertFooter(footer[0], pagePath, footerMarkup)));
  }
  const hasMaps = source.includes('map-widget');
  for (const [name, html] of [['content', content], ['tail', tail]]) {
    if (/map-widget/.test(html)) {
      throw new Error(`html-to-astro: ${pagePath} ${name} still contains a map iframe outside the footer`);
    }
    if (/<!-- ZvenFit:/.test(html)) {
      throw new Error(`html-to-astro: ${pagePath} ${name} contains a build marker the converter does not handle yet`);
    }
  }

  const finish = (html) => {
    const prepared = wrapComments(markScriptsInline(escapeBracesOutsideRawText(applySlashPrefix(html))));
    return prepared.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)]);
  };
  const slotContent = finish(content);
  const slotTail = finish(tail);

  const props = [`title=${JSON.stringify(decodeEntities(head.title))}`, `description=${JSON.stringify(decodeEntities(head.description))}`];
  const canonical = head.canonical;
  if (canonical !== `${SITE_URL}${pagePath}`) {
    props.push(`canonical=${JSON.stringify(canonical)}`);
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
  const ownImage = head.extras.find((extra) => extra.property === 'og:image');
  if (ownImage) {
    props.push(`ogImage=${JSON.stringify(ownImage.content)}`);
  }
  if (head.extras.length > 0) {
    props.push(`openGraphSkip={${JSON.stringify(head.extras.map((extra) => extra.property))}}`);
  }

  const depth = pagePath === '/' || !pagePath.endsWith('/') ? 1 : pagePath.split('/').length - 1;
  const up = '../'.repeat(depth);
  const imports = [...components]
    .filter((name) => name !== 'Base')
    .sort()
    .map((name) => `import ${name} from '${up}components/${name}.astro';`);
  imports.push(`import Base from '${up}layouts/Base.astro';`);
  const styleImports = [];
  const headSlot = [];
  if (head.pageCss) {
    const file = path.posix.basename(head.pageCss);
    const identifier = file.replace(/\.css$/, '').replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase());
    styleImports.push(`import ${identifier} from '${up}styles/${file}?url';`);
    headSlot.push(`<link slot="styles" href={${identifier}} rel="stylesheet" type="text/css" />`);
  }
  for (const extra of head.extras) {
    headSlot.push(`<meta slot="head" property=${JSON.stringify(extra.property)} content=${JSON.stringify(extra.content)} />`);
  }

  const frontmatter = [...imports, ...styleImports];
  const sitemapEntry = sitemapEntries.get(`${SITE_URL}${pagePath}`);
  if (sitemapEntry) {
    frontmatter.push('', `export const sitemap = ${JSON.stringify(sitemapEntry).replace(/"([a-z]+)":/g, '$1: ').replace(/"/g, "'").replace(/,/g, ', ').replace(/\{/, '{ ').replace(/\}/, ' }')};`);
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

  return { pagePath, output, webflowDefer, hasMaps, gtm: head.gtm };
}

// --- cli ------------------------------------------------------------------

function parseArguments(argv) {
  const options = { pages: [], all: false, force: false, out: DEFAULT_OUT, manual: DEFAULT_MANUAL };
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
  const logoMarkup = logoEmbeds(options.ref);
  const footerMarkup = footerTemplate(options.ref);
  const relativePaths = options.all ? listLegacyPages(options.ref) : options.pages.map(relativePathFor);
  const results = [];
  for (const relativePath of relativePaths) {
    const pagePath = pagePathFor(relativePath);
    const manualEntry = manual.pages?.[pagePath];
    if (manualEntry && !options.force) {
      throw new Error(`html-to-astro: ${pagePath} is maintained by hand (${manualEntry.reason}); pass --force to regenerate it`);
    }
    const result = convertPage({ ref: options.ref, relativePath, sitemapEntries, logoMarkup, footerMarkup });
    const outputFile = outputFileFor(pagePath, options.out);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, result.output, 'utf8');
    results.push({ ...result, outputFile });
    const notes = [result.webflowDefer ? '' : 'webflow.js without defer in legacy (deviation recorded for /offer/)', result.hasMaps ? 'maps' : '', `gtm ${result.gtm}`].filter(Boolean);
    console.log(`html-to-astro: ${pagePath} -> ${path.relative(ROOT, outputFile)}${notes.length ? ` (${notes.join('; ')})` : ''}`);
  }
  return results;
}

module.exports = {
  GTM_BODY_RE,
  GTM_HEAD_RE,
  MENU3_RE,
  applySlashPrefix,
  convertMenu,
  convertPage,
  decodeEntities,
  detectGtmStyle,
  escapeBracesOutsideRawText,
  expectedFooter,
  footerTemplate,
  markScriptsInline,
  outputFileFor,
  pagePathFor,
  parseHead,
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
