'use strict';

// Contracts of the shared blocks the converter replaces with components:
// the menus (Menu.astro variants) and the footers (Footer.astro). A legacy
// block either fits a contract exactly, in which case it is reduced to the
// component props, or the conversion fails with the first difference; nothing
// is approximated. The footer contracts are built from reference pages of the
// same legacy ref, so a hotfix of the footer text is picked up automatically.

const MAP_IFRAME_RE = /<div class="code-embed-4 w-embed w-iframe"><iframe[^>]*map-widget[^>]*>\s*<\/iframe><\/div>/g;
const MAP_TOKEN = '<@map>';
const BADGES_DESKTOP = '<!-- ZvenFit: app-download-links-desktop -->';
const BADGES_MOBILE = '<!-- ZvenFit: app-download-links-mobile -->';

// --- menus ------------------------------------------------------------------

const LINK_TEXT = label => `\\n {8}<div class="menu-txt">${label}</div>\\n {6}</a>\\n`;
const W_NODE = '(w-node-[0-9a-f_-]+)';

const MENU3_RE =
  /^<section class="menu3">\n {4}<div class="menu_grid-4">\n {6}<a href="\/" class="link-block-4 w-inline-block"( aria-label="[^"]*")?>\n {8}(<div class="code-embed-5 w-embed"><svg[\s\S]*?<\/svg><\/div>\n {8}<div class="code-embed-6 w-embed"><svg[\s\S]*?<\/svg><\/div>|<div class="menu-txt">([^<]*)<\/div>)\n {6}<\/a>\n {6}<a( data-back="true")? href="([^"]*)"( target="[^"]*")? class="link-block-page([1-4]) w-inline-block">\n {8}<div class="menu-txt">([^<]*)<\/div>\n {6}<\/a>\n {4}<\/div>\n {2}<\/section>$/;

const MENU1_RE = new RegExp(
  [
    '^<section class="menu1">\\n {4}<div class="menu_grid">\\n',
    ` {6}<a id="${W_NODE}" href="tel:\\+79253082323" class="link-block w-inline-block" aria-label="Позвонить по телефону \\+7 \\(925\\) 308-23-23">${LINK_TEXT('позвонить нам')}`,
    ` {6}<a id="${W_NODE}" href="/forma-dlya-zayavki/" class="link-block-2 w-inline-block">${LINK_TEXT('оставить заявку')}`,
    ` {6}<a id="${W_NODE}" href="/contacts/platforms/" class="link-block-3 w-inline-block" aria-label="Где нас найти — карты и мессенджеры">${LINK_TEXT('где нас найти')}`,
    ' {4}</div>\\n {2}</section>$',
  ].join(''),
);

const MENU2_RE = new RegExp(
  [
    '^<section class="menu2">\\n {4}<div class="menu_grid-2">\\n',
    ` {6}<a id="${W_NODE}" href="/forma-dlya-zayavki/"( target="[^"]*")? class="link-block-page1 w-inline-block">${LINK_TEXT('оставить заявку')}`,
    ` {6}<a id="${W_NODE}" href="([^"]*)"( target="[^"]*")? class="link-block-page2 w-inline-block">${LINK_TEXT('([^<]*)')}`,
    ' {6}<a href="/" class="link-block-4 w-inline-block">\\n {8}<div class="([a-z0-9 -]+)">(<svg[\\s\\S]*?</svg>)</div>\\n {6}</a>\\n',
    ` {6}<a id="${W_NODE}" href="#reviews" class="link-block-page3 w-inline-block">${LINK_TEXT('отзывы')}`,
    ` {6}<a id="${W_NODE}" href="#contacts" class="link-block-page4 w-inline-block">${LINK_TEXT('контакты')}`,
    ' {4}</div>\\n {2}</section>$',
  ].join(''),
);

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : undefined;
}

// `logo` carries the two byte-exact logo markups of src/components/logo-embeds.html:
// `pair` (both embeds of the plain menu) and `full` (the SVG of the service menu).
// The Webflow node ids are passed on exactly as the page has them: they do not
// follow the page's own data-wf-page (the mini-groups page carries the ids of
// the personal-training page), and zvenfit.webflow.css addresses them literally.
function convertMenu(block, { pagePath, logo, decode }) {
  const kind = block.match(/^<section class="(menu[0-9a-z-]*)"/)?.[1];
  if (kind === 'menu3') {
    const match = block.match(MENU3_RE);
    if (!match) {
      throw new Error(`html-to-astro: ${pagePath} menu does not match the plain menu contract; add the page to manual.json`);
    }
    const [, ariaLabel, embeds, logoText, dataBack, href, target, blockNumber, label] = match;
    const props = ['variant="plain"'];
    if (embeds.startsWith('<div class="code-embed-5')) {
      if (embeds !== logo.pair) {
        throw new Error(`html-to-astro: ${pagePath} logo embeds differ from LogoEmbeds.astro`);
      }
    } else {
      props.push('logo="text"', `logoText=${JSON.stringify(decode(logoText))}`);
    }
    if (ariaLabel) {
      props.push(`logoLabel=${JSON.stringify(decode(attribute(ariaLabel, 'aria-label')))}`);
    }
    const secondary = { label: decode(label), href };
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
  if (kind === 'menu1') {
    const match = block.match(MENU1_RE);
    if (!match) {
      throw new Error(`html-to-astro: ${pagePath} menu does not match the home menu contract; add the page to manual.json`);
    }
    const [, call, cta, contacts] = match;
    return `<Menu variant="home" wNode={${JSON.stringify({ call, cta, contacts })}} />`;
  }
  if (kind === 'menu2') {
    const match = block.match(MENU2_RE);
    if (!match) {
      throw new Error(`html-to-astro: ${pagePath} menu does not match the service menu contract; add the page to manual.json`);
    }
    const [, cta, ctaTarget, secondaryNode, href, target, label, embedClass, svg, reviews, contacts] = match;
    if (svg !== logo.full) {
      throw new Error(`html-to-astro: ${pagePath} menu logo differs from the full logo of LogoEmbeds.astro`);
    }
    const secondary = { label: decode(label), href };
    if (target) {
      secondary.target = attribute(target, 'target');
    }
    const props = ['variant="service"', `secondary={${JSON.stringify(secondary)}}`];
    if (ctaTarget) {
      props.push(`ctaTarget=${JSON.stringify(attribute(ctaTarget, 'target'))}`);
    }
    props.push(`logoEmbedClass=${JSON.stringify(embedClass)}`, `wNode={${JSON.stringify({ cta, secondary: secondaryNode, reviews, contacts })}}`);
    return `<Menu ${props.join(' ')} />`;
  }
  throw new Error(`html-to-astro: ${pagePath} has a menu of an unknown kind "${kind}"; add the page to manual.json`);
}

// --- footers ------------------------------------------------------------------

const FOOTER_RE =
  /<section(?: id="([a-z-]+)")? class="section-4">[\s\S]*?<\/section>(?:\n {2}<section(?: id="([a-z-]+)")? class="section-3">[\s\S]*?<\/section>)?/;
const SECTION_4 = '<section class="section-4">';
const SECTION_3 = '<section class="section-3">';
const MOBILE_SECTION_RE = /\n {2}<section class="section-3">[\s\S]*?<\/section>$/;
const MAP_BLOCK = `    <div class="div-block-13">\n      ${MAP_TOKEN}\n    </div>\n`;

// Texts of the second club in the one-club footer (the group-training page).
const NAKHABINSKOE = [
  ['Звенигород, Чехова 13А', 'Звенигород, Нахабинское&nbsp;шоссе,&nbsp;7А', 2],
  ['tel:+79253082323', 'tel:+79688440088', 2],
  ['+7 (925) 308-23-23', '+7 (968) 844-00-88', 4],
  [`        ${BADGES_DESKTOP}`, `            ${BADGES_DESKTOP}`, 1],
  [`        ${BADGES_MOBILE}`, `            ${BADGES_MOBILE}`, 1],
];

function normalizeMaps(block) {
  return block.replace(MAP_IFRAME_RE, MAP_TOKEN);
}

function referenceFooter(source, name) {
  const match = source.match(FOOTER_RE);
  if (!match || match[1] || match[2] || !match[0].includes(SECTION_3)) {
    throw new Error(`html-to-astro: cannot read the reference footer from ${name}: it must be a desktop and mobile pair without ids`);
  }
  const block = normalizeMaps(match[0]).replace(/ aria-current="page"/g, '').replace(/ w--current/g, '');
  if (!block.includes(BADGES_DESKTOP) || !block.includes(BADGES_MOBILE) || block.split(MAP_TOKEN).length !== 3) {
    throw new Error(`html-to-astro: the reference footer of ${name} must carry both app-badge markers and both maps`);
  }
  return block;
}

// `classicSource` is a legacy page with the one-club Chekhova footer (privacy),
// `gridSource` one with the two-club grid footer (home).
function footerTemplates({ classicSource, gridSource }) {
  const classic = referenceFooter(classicSource, 'the privacy page');
  const grid = referenceFooter(gridSource, 'the home page');
  if (grid.split('footer-grid">').length !== 3 || classic.includes('footer-grid')) {
    throw new Error('html-to-astro: the reference footers changed kind (grid on the home page, one club on the privacy page)');
  }
  return { classic, grid };
}

function replaceExactly(text, from, to, count, what) {
  const parts = text.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`html-to-astro: the reference footer has ${parts.length - 1} occurrence(s) of ${what}, expected ${count}`);
  }
  return parts.join(to);
}

function expectedFooter(templates, { pagePath, location = 'chekhova', withGrid = false, withMobile = true, withMap = true, badges = true, anchorId, mobileAnchorId }) {
  let expected = withGrid ? templates.grid : templates.classic;
  if (!withGrid && location === 'nahabinskoe-shosse') {
    for (const [from, to, count] of NAKHABINSKOE) {
      expected = replaceExactly(expected, from, to, count, JSON.stringify(from));
    }
  } else if (location !== 'chekhova') {
    throw new Error(`html-to-astro: unknown footer location ${location}`);
  }
  expected = expected.replace(
    /<a href="(\/privacy\/|\/payment-policy\/|\/offer\/)" target="_blank" class="([^"]*)">/g,
    (tag, href, classes) => (href === pagePath ? `<a href="${href}" target="_blank" aria-current="page" class="${classes} w--current">` : tag),
  );
  if (!badges) {
    expected = expected.replace(/\n *<!-- ZvenFit: app-download-links-(?:desktop|mobile) -->/g, '');
  }
  if (!withMap) {
    expected = replaceExactly(expected, `${SECTION_4}\n${MAP_BLOCK}`, `${SECTION_4}\n`, 1, 'the desktop map block');
  }
  if (!withMobile) {
    if (!MOBILE_SECTION_RE.test(expected)) {
      throw new Error('html-to-astro: the reference footer has no mobile section to drop');
    }
    expected = expected.replace(MOBILE_SECTION_RE, '');
  } else if (mobileAnchorId) {
    expected = replaceExactly(expected, SECTION_3, `<section id="${mobileAnchorId}" class="section-3">`, 1, SECTION_3);
  }
  if (anchorId) {
    expected = replaceExactly(expected, SECTION_4, `<section id="${anchorId}" class="section-4">`, 1, SECTION_4);
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

// Reads the footer options off the legacy block, rebuilds the block those
// options must produce and compares the two byte for byte.
function convertFooter(block, { pagePath, templates }) {
  const sections = block.match(FOOTER_RE);
  if (!sections || sections[0] !== block) {
    throw new Error(`html-to-astro: ${pagePath} footer is not a section-4 block with an optional section-3`);
  }
  const normalized = normalizeMaps(block);
  const desktop = normalized.split(/\n {2}<section(?: id="[a-z-]+")? class="section-3">/)[0];
  const options = {
    pagePath,
    withGrid: normalized.includes('txt_cont--home'),
    withMobile: /class="section-3"/.test(normalized),
    withMap: desktop.includes(MAP_TOKEN),
    badges: normalized.includes(BADGES_DESKTOP),
    anchorId: sections[1],
    mobileAnchorId: sections[2],
  };
  options.location = !options.withGrid && normalized.includes('tel:+79688440088') ? 'nahabinskoe-shosse' : 'chekhova';
  const expected = expectedFooter(templates, options);
  if (normalized !== expected) {
    throw new Error(
      `html-to-astro: ${pagePath} footer differs from the shared Footer contract; add the page to manual.json or extend the component.\n${firstDifference(expected, normalized)}`,
    );
  }
  const props = [];
  if (options.withGrid) {
    props.push('withGrid');
  } else {
    props.push(`location="${options.location}"`);
  }
  if (!options.withMobile) {
    props.push('withMobile={false}');
  }
  if (!options.withMap) {
    props.push('withMap={false}');
  }
  if (!options.badges) {
    props.push('badges={false}');
  }
  if (options.anchorId) {
    props.push(`anchorId="${options.anchorId}"`);
  }
  if (options.mobileAnchorId) {
    props.push(`mobileAnchorId="${options.mobileAnchorId}"`);
  }
  return `<Footer ${props.join(' ')} />`;
}

module.exports = {
  BADGES_DESKTOP,
  BADGES_MOBILE,
  FOOTER_RE,
  MAP_IFRAME_RE,
  MENU1_RE,
  MENU2_RE,
  MENU3_RE,
  attribute,
  convertFooter,
  convertMenu,
  expectedFooter,
  firstDifference,
  footerTemplates,
};
