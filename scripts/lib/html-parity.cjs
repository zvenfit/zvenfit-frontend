'use strict';

// HTML parity comparison (plan docs/astro-migration.md, section 8).
//
// Both documents are parsed with parse5 (scripting enabled, so <noscript>
// content stays raw text) and compared node by node: doctype, element names,
// every attribute name and value (class order included), text and comments.
// Whitespace is significant except where a rule says it is not:
//   W1  whitespace-only text directly inside <head>, <html> or the document;
//   W2  a whitespace-only text node that is the last child of <body>.
// The comparison of build modes (production against staging of one candidate)
// has two more rules for the whitespace around a removed analytics block:
//   M1  a whitespace-only text node after a removed node is dropped unless
//       staging carries the same text there, and only where the whitespace
//       could not render: next to text that already ends or starts with
//       whitespace, next to an element that is a block by default, or at the
//       edge of such a block (nodes that draw nothing are looked through);
//   M2  when whitespace-only text stands before the removed block as well, the
//       two neighbours are one text node on staging, and it must be exactly
//       the text before the block followed by the text after it.
// URLs of own assets are mapped through an explicit table (legacy /js and /css
// paths with ?v= versus hashed /_astro/ files, config endpoints without ?v=);
// everything else is compared literally. Inline scripts are compared byte for
// byte, JSON-LD as parsed JSON; the content fragment of <template> and the
// children of <pre> are compared like any other children. Exceptions come
// from an allow-list with expected match counts; unexpected differences are
// reported with the source location of both sides.

const parse5 = require('parse5');

const OWN_SCRIPTS = [
  'analytics.js',
  'schedule.js',
  'lead-form.js',
  'yandex-map.js',
  'utm-attribution.js',
  'traffic-beacon.js',
  'coaches-show-more.js',
  'accordion-horizontal.js',
];
const OWN_STYLES = ['zvenfit.webflow.css', 'klubnaya-karta.v1.css'];
const CONFIGS = ['lead-config.js', 'schedule-config.js', 'traffic-config.js', 'maps-config.js'];
const VENDOR_SCRIPTS = { 'imask-7.6.1.min.js': '/js/vendor/imask-7.6.1.min.js' };
const HASH = '[A-Za-z0-9_-]{6,}';
const WHITESPACE = /^[ \t\r\n]*$/;
const URL_ATTRIBUTES = new Set(['src', 'href']);
// Rule M1 decides by tag name whether whitespace can render. Elements that draw
// nothing are looked through; the others count as blocks only when the default
// style sheet makes them blocks. A page that turns a block into inline content
// with CSS is outside what a comparison of markup can see.
const UNRENDERED = new Set(['script', 'style', 'noscript', 'link', 'meta', 'title', 'base', 'template']);
const DEFAULT_BLOCKS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr',
  'html', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

// Maps an asset URL of either side to a canonical token and records the file
// behind it, so compare-dist can verify existence and bytes afterwards.
function normalizeAssetUrl(value, side, assets) {
  const legacyScript = value.match(/^\/js\/([a-z0-9.-]+\.js)(?:\?v=[^"']*)?$/);
  if (side === 'base' && legacyScript && OWN_SCRIPTS.includes(legacyScript[1])) {
    assets.base.scripts.set(legacyScript[1], `js/${legacyScript[1]}`);
    return `@asset:js/${legacyScript[1]}`;
  }
  const legacyVendor = Object.entries(VENDOR_SCRIPTS).find(([, path]) => value.replace(/\?v=.*$/, '') === path);
  if (side === 'base' && legacyVendor) {
    assets.base.scripts.set(legacyVendor[0], legacyVendor[1].slice(1));
    return `@asset:vendor/${legacyVendor[0]}`;
  }
  const legacyMinCss = value.match(/^\/css\/zvenfit\.webflow\.min\.css(?:\?v=[^"']*)?$/);
  if (side === 'base' && legacyMinCss) {
    assets.base.styles.set('zvenfit.webflow.css', 'css/zvenfit.webflow.min.css');
    return '@asset:css/zvenfit.webflow.css';
  }
  const legacyCss = value.match(/^\/css\/([a-z0-9.-]+\.css)(?:\?v=[^"']*)?$/);
  if (side === 'base' && legacyCss && OWN_STYLES.includes(legacyCss[1])) {
    assets.base.styles.set(legacyCss[1], `css/${legacyCss[1]}`);
    return `@asset:css/${legacyCss[1]}`;
  }
  const config = value.match(/^\/js\/([a-z]+-config\.js)(?:\?v=[^"']*)?$/);
  if (config && CONFIGS.includes(config[1])) {
    if (side === 'candidate' && value.includes('?')) {
      throw new Error(`candidate references ${value}: config endpoints must not carry a query`);
    }
    return `@config:${config[1]}`;
  }
  const hashed = value.match(new RegExp(`^/_astro/([a-z0-9.-]+?)\\.(${HASH})\\.(js|css)$`));
  if (side === 'candidate' && hashed) {
    const name = `${hashed[1]}.${hashed[3]}`;
    if (hashed[3] === 'js' && OWN_SCRIPTS.includes(name)) {
      assets.candidate.scripts.set(name, value.slice(1));
      return `@asset:js/${name}`;
    }
    if (hashed[3] === 'js' && VENDOR_SCRIPTS[name]) {
      assets.candidate.scripts.set(name, value.slice(1));
      return `@asset:vendor/${name}`;
    }
    if (hashed[3] === 'css' && OWN_STYLES.includes(name)) {
      assets.candidate.styles.set(name, value.slice(1));
      return `@asset:css/${name}`;
    }
    throw new Error(`candidate references an unknown hashed asset ${value}`);
  }
  if (side === 'candidate' && /^\/(?:js|css)\//.test(value) && !config) {
    throw new Error(`candidate still references a legacy path ${value}`);
  }
  return value;
}

function parse(html) {
  return parse5.parse(html, { scriptingEnabled: true, sourceCodeLocationInfo: true });
}

function locationOf(node) {
  const location = node.sourceCodeLocation;
  return location ? `line ${location.startLine}` : 'unknown line';
}

function attributesOf(node, side, assets) {
  const attributes = new Map();
  for (const attribute of node.attrs || []) {
    const name = attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name;
    const normalized = URL_ATTRIBUTES.has(name) && ['script', 'link'].includes(node.tagName)
      ? normalizeAssetUrl(attribute.value, side, assets)
      : attribute.value;
    attributes.set(name, normalized);
  }
  return attributes;
}

function literalAttributesOf(node) {
  return new Map((node.attrs || []).map(attribute => [attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name, attribute.value]));
}

function textOf(node) {
  return (node.childNodes || [])
    .filter(child => child.nodeName === '#text')
    .map(child => child.value)
    .join('');
}

function describe(node) {
  switch (node.nodeName) {
    case '#text':
      return `text ${JSON.stringify(node.value.length > 80 ? `${node.value.slice(0, 80)}…` : node.value)}`;
    case '#comment':
      return `comment ${JSON.stringify(node.data)}`;
    case '#documentType':
      return `doctype ${node.name}`;
    default:
      return `<${node.tagName}${(node.attrs || []).map(a => ` ${a.name}="${a.value}"`).join('')}>`;
  }
}

function isWhitespaceText(node) {
  return node.nodeName === '#text' && WHITESPACE.test(node.value);
}

function drawsNothing(node) {
  return node.nodeName === '#comment' || UNRENDERED.has(node.nodeName);
}

function matchesSelector(node, selector, side, assets) {
  if (node.nodeName !== selector.tag) {
    return false;
  }
  const attributes = attributesOf(node, side, assets);
  for (const [name, fragment] of Object.entries(selector.attrIncludes || {})) {
    const raw = (node.attrs || []).find(a => a.name === name)?.value || '';
    if (!raw.includes(fragment) && !(attributes.get(name) || '').includes(fragment)) {
      return false;
    }
  }
  return true;
}

class Comparison {
  constructor({ route, rules, assets, modeRules, normalize = true }) {
    this.route = route;
    this.rules = rules;
    this.assets = assets;
    this.modeRules = modeRules || null;
    this.normalize = normalize;
    this.errors = [];
    this.ruleMatches = new Map(rules.map(rule => [rule.id, 0]));
    this.modeCounts = { analyticsRemoved: 0, robotsRemoved: 0, robotsInserted: 0 };
    this.nodes = 0;
  }

  fail(message, base, candidate) {
    const where = [base ? `base ${locationOf(base)}: ${describe(base)}` : 'base: (nothing)', candidate ? `candidate ${locationOf(candidate)}: ${describe(candidate)}` : 'candidate: (nothing)'];
    this.errors.push(`${this.route}: ${message}\n    ${where.join('\n    ')}`);
  }

  commentRemovalRule(node) {
    return this.rules.find(rule => rule.kind === 'comment-removed' && rule.data === node.data);
  }

  attributeRule(node, name, before, after) {
    return this.rules.find(
      rule =>
        rule.kind === 'attribute' &&
        rule.name === name &&
        (rule.before === null ? before === undefined : rule.before === before) &&
        (rule.after === null ? after === undefined : rule.after === after) &&
        matchesSelector(node, rule.selector, 'base', this.assets),
    );
  }

  compareDocuments(baseDocument, candidateDocument) {
    this.compareChildren(baseDocument, candidateDocument, 'document');
    return this;
  }

  ignorable(node, parentName, isLast) {
    if (!isWhitespaceText(node)) {
      return false;
    }
    if (parentName === 'document' || parentName === 'html' || parentName === 'head') {
      return true;
    }
    return parentName === 'body' && isLast;
  }

  // Rule M2. Returns how many analytics nodes follow the whitespace text at
  // `index` and where the comparison continues, or null when the rule does not
  // apply: the staging text must equal the text before the removed block plus
  // the whitespace-only text right after it.
  mergedAroundRemoval(baseKids, index, candidateNode) {
    const before = baseKids[index];
    if (!this.modeRules || !before || !isWhitespaceText(before) || candidateNode?.nodeName !== '#text') {
      return null;
    }
    let removed = 0;
    let last = index;
    for (let k = index + 1; k < baseKids.length; k += 1) {
      if (this.modeRules.removable(baseKids[k])) {
        removed += 1;
        last = k;
      } else if (!(isWhitespaceText(baseKids[k]) && baseKids[k + 1] && this.modeRules.removable(baseKids[k + 1]))) {
        break;
      }
    }
    if (removed === 0) {
      return null;
    }
    const trailing = baseKids[last + 1];
    const after = trailing && isWhitespaceText(trailing) ? trailing.value : '';
    if (candidateNode.value === before.value || candidateNode.value !== before.value + after) {
      return null;
    }
    return { removed, next: last + (after ? 2 : 1) };
  }

  // Rule M1. On staging the removed block leaves a gap between
  // `candidateKids[j - 1]` and `candidateKids[j]`; the whitespace that stood
  // there in production may be absent only when it could not render.
  gapCollapses(candidateKids, j, parentName) {
    const atBlockEdge = parentName === 'document' || DEFAULT_BLOCKS.has(parentName);
    let before = j - 1;
    while (before >= 0 && drawsNothing(candidateKids[before])) {
      before -= 1;
    }
    let after = j;
    while (after < candidateKids.length && drawsNothing(candidateKids[after])) {
      after += 1;
    }
    const collapses = (node, edgeOfText) => {
      if (!node) {
        return atBlockEdge;
      }
      return node.nodeName === '#text' ? edgeOfText.test(node.value) : DEFAULT_BLOCKS.has(node.nodeName);
    };
    return collapses(candidateKids[before], /[ \t\r\n]$/) || collapses(candidateKids[after], /^[ \t\r\n]/);
  }

  compareChildren(base, candidate, parentName) {
    const baseKids = base.childNodes || [];
    const candidateKids = candidate.childNodes || [];
    let i = 0;
    let j = 0;
    let justRemoved = false;
    while (i < baseKids.length || j < candidateKids.length) {
      const b = baseKids[i];
      const c = candidateKids[j];
      if (b && this.ignorable(b, parentName, i === baseKids.length - 1)) {
        i += 1;
        continue;
      }
      if (c && this.ignorable(c, parentName, j === candidateKids.length - 1)) {
        j += 1;
        continue;
      }
      const merged = this.mergedAroundRemoval(baseKids, i, c);
      if (merged) {
        this.modeCounts.analyticsRemoved += merged.removed;
        this.nodes += 1;
        justRemoved = false;
        i = merged.next;
        j += 1;
        continue;
      }
      if (b && this.modeRules?.removable(b)) {
        this.modeCounts.analyticsRemoved += 1;
        justRemoved = true;
        i += 1;
        continue;
      }
      if (b && justRemoved && isWhitespaceText(b) && !(c && c.nodeName === '#text' && c.value === b.value)) {
        if (!this.gapCollapses(candidateKids, j, parentName)) {
          this.fail(`whitespace after a removed analytics block is lost between inline content inside <${parentName}>`, b, c);
          return;
        }
        i += 1;
        continue;
      }
      if (b && this.modeRules?.robotsMeta(b)) {
        this.modeCounts.robotsRemoved += 1;
        i += 1;
        continue;
      }
      if (c && this.modeRules?.robotsMeta(c)) {
        this.modeCounts.robotsInserted += 1;
        if (!this.modeRules.stagingRobots(c)) {
          this.fail('staging robots meta must be exactly noindex, nofollow', undefined, c);
        }
        j += 1;
        continue;
      }
      justRemoved = false;
      if (b && c && this.sameNode(b, c)) {
        this.nodes += 1;
        if (b.nodeName !== '#text' && b.nodeName !== '#comment' && b.nodeName !== '#documentType') {
          this.compareElement(b, c);
        }
        i += 1;
        j += 1;
        continue;
      }
      if (b && b.nodeName === '#comment') {
        const rule = this.commentRemovalRule(b);
        if (rule) {
          this.ruleMatches.set(rule.id, this.ruleMatches.get(rule.id) + 1);
          i += 1;
          continue;
        }
      }
      this.fail(`node mismatch inside <${parentName}>`, b, c);
      return;
    }
  }

  sameNode(b, c) {
    if (b.nodeName !== c.nodeName) {
      return false;
    }
    switch (b.nodeName) {
      case '#text':
        return b.value === c.value;
      case '#comment':
        return b.data === c.data;
      case '#documentType':
        return b.name === c.name && b.publicId === c.publicId && b.systemId === c.systemId;
      default:
        return b.tagName === c.tagName && b.namespaceURI === c.namespaceURI;
    }
  }

  compareElement(b, c) {
    let baseAttributes;
    let candidateAttributes;
    try {
      baseAttributes = this.normalize ? attributesOf(b, 'base', this.assets) : literalAttributesOf(b);
      candidateAttributes = this.normalize ? attributesOf(c, 'candidate', this.assets) : literalAttributesOf(c);
    } catch (error) {
      this.fail(error.message, b, c);
      return;
    }
    for (const name of new Set([...baseAttributes.keys(), ...candidateAttributes.keys()])) {
      const before = baseAttributes.get(name);
      const after = candidateAttributes.get(name);
      if (before === after) {
        continue;
      }
      const rule = this.attributeRule(b, name, before, after);
      if (rule) {
        this.ruleMatches.set(rule.id, this.ruleMatches.get(rule.id) + 1);
        continue;
      }
      this.fail(`attribute ${name} differs: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`, b, c);
    }
    if (b.tagName === 'script' && (baseAttributes.get('type') || '').trim() === 'application/ld+json') {
      this.compareJsonLd(b, c);
      return;
    }
    // These elements hold nothing but text (scripting is on, so <noscript> is raw text too).
    if (b.tagName === 'script' || b.tagName === 'style' || b.tagName === 'noscript' || b.tagName === 'textarea') {
      if (textOf(b) !== textOf(c)) {
        this.fail(`${b.tagName} content differs`, b, c);
      }
      return;
    }
    if (b.tagName === 'template') {
      // parse5 keeps the children of <template> in its content fragment, not in childNodes.
      this.compareChildren(b.content || { childNodes: [] }, c.content || { childNodes: [] }, 'template');
      return;
    }
    this.compareChildren(b, c, b.tagName);
  }

  compareJsonLd(b, c) {
    let baseJson;
    let candidateJson;
    try {
      baseJson = JSON.parse(textOf(b));
      candidateJson = JSON.parse(textOf(c));
    } catch (error) {
      this.fail(`JSON-LD is not valid JSON: ${error.message}`, b, c);
      return;
    }
    if (JSON.stringify(baseJson) !== JSON.stringify(candidateJson)) {
      this.fail('JSON-LD graph differs', b, c);
    }
  }
}

function createAssetRegistry() {
  return {
    base: { scripts: new Map(), styles: new Map() },
    candidate: { scripts: new Map(), styles: new Map() },
  };
}

function rulesForRoute(allRules, { profile, mode, route }) {
  return allRules.filter(
    rule =>
      rule.profiles.includes(profile) &&
      rule.mode === mode &&
      (rule.routes.includes('*') || rule.routes.includes(route)) &&
      !(rule.exceptRoutes || []).includes(route),
  );
}

// Compares a base page with a candidate page in production mode.
function compareHtml({ route, baseHtml, candidateHtml, rules, assets }) {
  const comparison = new Comparison({ route, rules, assets }).compareDocuments(parse(baseHtml), parse(candidateHtml));
  for (const rule of rules) {
    const matches = comparison.ruleMatches.get(rule.id);
    if (matches !== rule.count) {
      comparison.errors.push(`${route}: allow-list rule ${rule.id} matched ${matches} time(s), expected ${rule.count}`);
    }
  }
  return { errors: comparison.errors, nodes: comparison.nodes, ruleMatches: comparison.ruleMatches };
}

const ANALYTICS_COMMENTS = [
  /^ {1,2}(?:End )?Google Tag Manager(?: \(noscript\))? {1,2}$/,
  /^ \/?Top\.Mail\.Ru counter $/,
  /^ \/?Yandex\.Metrika counter $/,
];
const ANALYTICS_SCRIPT = /googletagmanager\.com\/gtm\.js|top-fwz1\.mail\.ru\/js\/code\.js|mc\.yandex\.ru\/metrika\/tag\.js/;
const ANALYTICS_NOSCRIPT = /googletagmanager\.com\/ns\.html|top-fwz1\.mail\.ru\/counter|mc\.yandex\.ru\/watch/;

const stagingModeRules = {
  removable(node) {
    if (node.nodeName === '#comment') {
      return ANALYTICS_COMMENTS.some(pattern => pattern.test(node.data));
    }
    if (node.nodeName === 'script') {
      return ANALYTICS_SCRIPT.test(textOf(node));
    }
    if (node.nodeName === 'noscript') {
      return ANALYTICS_NOSCRIPT.test(textOf(node));
    }
    return false;
  },
  robotsMeta(node) {
    return node.nodeName === 'meta' && (node.attrs || []).some(a => a.name === 'name' && a.value === 'robots');
  },
  stagingRobots(node) {
    return (node.attrs || []).some(a => a.name === 'content' && a.value === 'noindex, nofollow');
  },
};

// Compares the production and staging builds of the same candidate: only the
// analytics blocks, the robots meta and the adjacent whitespace may differ.
function compareModes({ route, productionHtml, stagingHtml, assets }) {
  const comparison = new Comparison({ route, rules: [], assets, modeRules: stagingModeRules, normalize: false }).compareDocuments(
    parse(productionHtml),
    parse(stagingHtml),
  );
  if (comparison.modeCounts.robotsInserted !== 1) {
    comparison.errors.push(`${route}: staging must carry exactly one robots meta, found ${comparison.modeCounts.robotsInserted}`);
  }
  if (comparison.modeCounts.analyticsRemoved === 0 && route !== '404.html') {
    comparison.errors.push(`${route}: production build carries no analytics nodes to remove on staging`);
  }
  return { errors: comparison.errors, nodes: comparison.nodes, counts: comparison.modeCounts };
}

function parseConfigAssignments(source) {
  const assignments = new Map();
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) {
      continue;
    }
    const match = trimmed.match(/^window\.([A-Z_]+)\s*=\s*'((?:[^'\\]|\\.)*)';$/);
    if (!match) {
      throw new Error(`unexpected config line ${JSON.stringify(trimmed)}`);
    }
    assignments.set(match[1], match[2]);
  }
  return assignments;
}

function readSitemap(xml) {
  const entries = new Map();
  for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const field = name => match[1].match(new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`))?.[1] ?? null;
    const loc = field('loc');
    if (loc) {
      entries.set(loc, { lastmod: field('lastmod'), changefreq: field('changefreq'), priority: field('priority') });
    }
  }
  return entries;
}

module.exports = {
  CONFIGS,
  OWN_SCRIPTS,
  OWN_STYLES,
  compareHtml,
  compareModes,
  createAssetRegistry,
  normalizeAssetUrl,
  parse,
  parseConfigAssignments,
  readSitemap,
  rulesForRoute,
};
