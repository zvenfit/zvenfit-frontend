'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { legacyBase, showLegacy } = require('./helpers/legacy-base.cjs');
const blocks = require('../migrate/shared-blocks.cjs');

const PAIR = '<div class="code-embed-5 w-embed"><svg></svg></div>\n        <div class="code-embed-6 w-embed"><svg id="full"></svg></div>';
const LOGO = { pair: PAIR, full: '<svg id="full"></svg>' };
const decode = text => text.replace(/&amp;/g, '&');
const context = pagePath => ({ pagePath, logo: LOGO, decode });

function link({ attributes = '', href, classes, label }) {
  return `      <a${attributes} href="${href}" class="${classes} w-inline-block">\n        <div class="menu-txt">${label}</div>\n      </a>\n`;
}

function plainMenu({ logo = PAIR, ariaLabel = '', dataBack = ' data-back="true"', href = '#', target = '', block = 1, label = 'вернуться назад' } = {}) {
  return `<section class="menu3">\n    <div class="menu_grid-4">\n      <a href="/" class="link-block-4 w-inline-block"${ariaLabel}>\n        ${logo}\n      </a>\n      <a${dataBack} href="${href}"${target} class="link-block-page${block} w-inline-block">\n        <div class="menu-txt">${label}</div>\n      </a>\n    </div>\n  </section>`;
}

function serviceMenu({ ctaTarget = '', secondary = ' href="#prices"', label = 'тарифы', embedClass = 'code-embed-3 w-embed', svg = LOGO.full, suffix = '4601c0c5' } = {}) {
  const node = id => `w-node-${id}-${suffix}`;
  return [
    '<section class="menu2">\n    <div class="menu_grid-2">\n',
    `      <a id="${node('e11a7337-f2')}" href="/forma-dlya-zayavki/"${ctaTarget} class="link-block-page1 w-inline-block">\n        <div class="menu-txt">оставить заявку</div>\n      </a>\n`,
    `      <a id="${node('e11a7337-f5')}"${secondary} class="link-block-page2 w-inline-block">\n        <div class="menu-txt">${label}</div>\n      </a>\n`,
    `      <a href="/" class="link-block-4 w-inline-block">\n        <div class="${embedClass}">${svg}</div>\n      </a>\n`,
    `      <a id="${node('_52a1a7f0-82')}" href="#reviews" class="link-block-page3 w-inline-block">\n        <div class="menu-txt">отзывы</div>\n      </a>\n`,
    `      <a id="${node('e11a7337-f8')}" href="#contacts" class="link-block-page4 w-inline-block">\n        <div class="menu-txt">контакты</div>\n      </a>\n`,
    '    </div>\n  </section>',
  ].join('');
}

test('the plain menu is reduced to component props and anything else is refused', () => {
  assert.equal(blocks.convertMenu(plainMenu(), context('/offer/')), '<Menu variant="plain" secondary={{"label":"вернуться назад","href":"#","dataBack":true,"block":1}} />');
  assert.equal(
    blocks.convertMenu(plainMenu({ logo: '<div class="menu-txt">zvenfit</div>', ariaLabel: ' aria-label="На главную ZvenFit"' }), context('/raspisanie/')),
    '<Menu variant="plain" logo="text" logoText="zvenfit" logoLabel="На главную ZvenFit" secondary={{"label":"вернуться назад","href":"#","dataBack":true,"block":1}} />',
  );
  assert.equal(
    blocks.convertMenu(plainMenu({ dataBack: '', href: '/forma-dlya-zayavki/', block: 4, label: 'оставить заявку' }), context('/404.html')),
    '<Menu variant="plain" secondary={{"label":"оставить заявку","href":"/forma-dlya-zayavki/","block":4}} />',
  );
  assert.throws(() => blocks.convertMenu(plainMenu({ logo: PAIR.replace('code-embed-6', 'code-embed-7') }), context('/x/')), /plain menu contract/);
  assert.throws(() => blocks.convertMenu(plainMenu({ logo: PAIR.replace('<svg>', '<svg width="1">') }), context('/x/')), /logo embeds differ/);
  assert.throws(() => blocks.convertMenu(plainMenu().replace('menu3', 'menu9'), context('/x/')), /unknown kind "menu9"/);
});

test('the home menu passes its three Webflow node ids on and tolerates no other difference', () => {
  const menu = [
    '<section class="menu1">\n    <div class="menu_grid">\n',
    link({ attributes: ' id="w-node-aa-9716bd19"', href: 'tel:+79253082323', classes: 'link-block', label: 'позвонить нам' }).replace(' w-inline-block">', ' w-inline-block" aria-label="Позвонить по телефону +7 (925) 308-23-23">'),
    link({ attributes: ' id="w-node-_bb-9716bd19"', href: '/forma-dlya-zayavki/', classes: 'link-block-2', label: 'оставить заявку' }),
    link({ attributes: ' id="w-node-_cc-9716bd19"', href: '/contacts/platforms/', classes: 'link-block-3', label: 'где нас найти' }).replace(' w-inline-block">', ' w-inline-block" aria-label="Где нас найти — карты и мессенджеры">'),
    '    </div>\n  </section>',
  ].join('');
  assert.equal(blocks.convertMenu(menu, context('/')), '<Menu variant="home" wNode={{"call":"w-node-aa-9716bd19","cta":"w-node-_bb-9716bd19","contacts":"w-node-_cc-9716bd19"}} />');
  assert.throws(() => blocks.convertMenu(menu.replace('где нас найти', 'контакты'), context('/')), /home menu contract/);
  assert.throws(() => blocks.convertMenu(menu.replace('tel:+79253082323', 'tel:+70000000000'), context('/')), /home menu contract/);
});

test('the service menu yields the secondary link, targets, the logo wrapper class and exact node ids', () => {
  assert.equal(
    blocks.convertMenu(serviceMenu(), context('/personalnye-trenirovki/')),
    '<Menu variant="service" secondary={{"label":"тарифы","href":"#prices"}} logoEmbedClass="code-embed-3 w-embed" wNode={{"cta":"w-node-e11a7337-f2-4601c0c5","secondary":"w-node-e11a7337-f5-4601c0c5","reviews":"w-node-_52a1a7f0-82-4601c0c5","contacts":"w-node-e11a7337-f8-4601c0c5"}} />',
  );
  assert.equal(
    blocks.convertMenu(
      serviceMenu({ ctaTarget: ' target="_blank"', secondary: ' href="https://yandex.ru/maps/-/CPeXe80n" target="_blank"', label: 'показать на карте', embedClass: 'w-embed', suffix: 'ad0e8501' }),
      context('/pilates-na-reformere/'),
    ),
    '<Menu variant="service" secondary={{"label":"показать на карте","href":"https://yandex.ru/maps/-/CPeXe80n","target":"_blank"}} ctaTarget="_blank" logoEmbedClass="w-embed" wNode={{"cta":"w-node-e11a7337-f2-ad0e8501","secondary":"w-node-e11a7337-f5-ad0e8501","reviews":"w-node-_52a1a7f0-82-ad0e8501","contacts":"w-node-e11a7337-f8-ad0e8501"}} />',
  );
  // The ids are not derived from the page: the mini-groups page carries those of another page.
  assert.match(blocks.convertMenu(serviceMenu({ suffix: '4601c0c5' }), context('/trenazhernyj-zal/mini-gruppy/')), /"cta":"w-node-e11a7337-f2-4601c0c5"/);
  assert.throws(() => blocks.convertMenu(serviceMenu({ svg: '<svg id="other"></svg>' }), context('/x/')), /menu logo differs/);
  assert.throws(() => blocks.convertMenu(serviceMenu().replace('#reviews', '#otzyvy'), context('/x/')), /service menu contract/);
});

const MAP = '<div class="code-embed-4 w-embed w-iframe"><iframe src="https://yandex.ru/map-widget/v1/?ll=1" width="100%" height="100%" frameborder="0">\n        </iframe></div>';

function legalLinks(indent) {
  return [
    `${indent}<a href="/privacy/" target="_blank" class="link">Политика конфиденциальности</a>`,
    `${indent}<a href="/offer/" target="_blank" class="link text-span-2 _2">Публичная оферта</a>`,
  ].join('\n');
}

function classicPage({ current = '' } = {}) {
  const section = (number, marker) =>
    [
      `<section class="section-${number}">`,
      '    <div class="div-block-13">',
      `      ${MAP}`,
      '    </div>',
      '    <div class="txt_cont">',
      '      <h2 class="footer">Звенигород, Чехова 13А</h2>',
      '      <a href="tel:+79253082323" class="link-block-6 w-inline-block" aria-label="Позвонить по телефону +7 (925) 308-23-23">',
      '        <h2 class="footer">+7 (925) 308-23-23</h2>',
      '      </a>',
      legalLinks('      ').replace('class="link">', current ? 'aria-current="page" class="link w--current">' : 'class="link">'),
      '    </div>',
      `        <!-- ZvenFit: app-download-links-${marker} -->`,
      '    <div class="divider footer"></div>',
      '  </section>',
    ].join('\n');
  return `<body>\n  ${section(4, 'desktop')}\n  ${section(3, 'mobile')}\n</body>`;
}

function gridPage() {
  const section = (number, marker) =>
    [
      `<section class="section-${number}">`,
      '    <div class="div-block-13">',
      `      ${MAP.replace('frameborder="0"', 'frameborder="0" title="Карта"')}`,
      '    </div>',
      '    <div class="txt_cont txt_cont--home">',
      '      <div class="footer-grid">',
      legalLinks('        '),
      '      </div>',
      '    </div>',
      `        <!-- ZvenFit: app-download-links-${marker} -->`,
      '    <div class="divider footer"></div>',
      '  </section>',
    ].join('\n');
  return `<body>\n  ${section(4, 'desktop')}\n  ${section(3, 'mobile')}\n</body>`;
}

const TEMPLATES = blocks.footerTemplates({ classicSource: classicPage({ current: 'privacy' }), gridSource: gridPage() });
const footerOf = page => page.match(blocks.FOOTER_RE)[0];

test('the reference footers are a desktop and mobile pair with maps and badge markers, without current-page state', () => {
  assert.doesNotMatch(TEMPLATES.classic, /aria-current|w--current|map-widget/);
  assert.equal(TEMPLATES.classic.split('<@map>').length - 1, 2);
  assert.match(TEMPLATES.grid, /txt_cont--home/);
  assert.throws(() => blocks.footerTemplates({ classicSource: gridPage(), gridSource: gridPage() }), /changed kind/);
  assert.throws(() => blocks.footerTemplates({ classicSource: classicPage().replace(/\n {8}<!-- ZvenFit: app-download-links-mobile -->/, ''), gridSource: gridPage() }), /both app-badge markers/);
  assert.throws(() => blocks.footerTemplates({ classicSource: classicPage().replace('<section class="section-4">', '<section id="contacts" class="section-4">'), gridSource: gridPage() }), /pair without ids/);
});

test('a footer is reduced to Footer props only when the options rebuild it byte for byte', () => {
  const convert = (page, pagePath = '/x/') => blocks.convertFooter(footerOf(page), { pagePath, templates: TEMPLATES });
  assert.equal(convert(classicPage()), '<Footer location="chekhova" />');
  assert.equal(convert(classicPage({ current: 'privacy' }), '/privacy/'), '<Footer location="chekhova" />');
  assert.throws(() => convert(classicPage({ current: 'privacy' }), '/offer/'), /differs from the shared Footer contract[\s\S]*expected: "      <a href=\\"\/privacy\/\\" target=\\"_blank\\" class=\\"link\\">/);

  const anchored = classicPage().replace('<section class="section-4">', '<section id="contacts" class="section-4">').replace('<section class="section-3">', '<section id="contact" class="section-3">');
  assert.equal(convert(anchored), '<Footer location="chekhova" anchorId="contacts" mobileAnchorId="contact" />');

  const second = anchored
    .replaceAll('Звенигород, Чехова 13А', 'Звенигород, Нахабинское&nbsp;шоссе,&nbsp;7А')
    .replaceAll('tel:+79253082323', 'tel:+79688440088')
    .replaceAll('+7 (925) 308-23-23', '+7 (968) 844-00-88')
    .replaceAll('        <!-- ZvenFit', '            <!-- ZvenFit');
  assert.equal(convert(second), '<Footer location="nahabinskoe-shosse" anchorId="contacts" mobileAnchorId="contact" />');
  assert.throws(() => convert(second.replace('            <!-- ZvenFit: app-download-links-desktop', '        <!-- ZvenFit: app-download-links-desktop')), /differs from the shared Footer contract/);
  assert.throws(() => convert(classicPage().replace('Публичная оферта', 'Оферта')), /differs from the shared Footer contract/);
});

test('the grid footer covers the pages without badges, without the mobile section and without the map', () => {
  const convert = page => blocks.convertFooter(footerOf(page), { pagePath: '/x/', templates: TEMPLATES });
  assert.equal(convert(gridPage()), '<Footer withGrid />');
  const withoutBadges = gridPage().replace(/\n {8}<!-- ZvenFit: app-download-links-(desktop|mobile) -->/g, '');
  assert.equal(convert(withoutBadges.replace('<section class="section-4">', '<section id="contacts" class="section-4">')), '<Footer withGrid badges={false} anchorId="contacts" />');
  const desktopOnly = withoutBadges
    .replace(/\n {2}<section class="section-3">[\s\S]*?<\/section>/, '')
    .replace(/ {4}<div class="div-block-13">\n[\s\S]*?\n {4}<\/div>\n/, '')
    .replace('<section class="section-4">', '<section id="contacts" class="section-4">');
  assert.equal(convert(desktopOnly), '<Footer withGrid withMobile={false} withMap={false} badges={false} anchorId="contacts" />');
  assert.throws(() => blocks.expectedFooter(TEMPLATES, { pagePath: '/x/', location: 'elsewhere' }), /unknown footer location/);
});

test('every footer of the legacy pages at the pinned base fits the Footer contract', t => {
  if (!legacyBase(t)) {
    return;
  }
  const templates = blocks.footerTemplates({ classicSource: showLegacy('public/privacy/index.html'), gridSource: showLegacy('public/index.html') });
  const expected = {
    '404.html': '<Footer withGrid anchorId="contacts" mobileAnchorId="contact" />',
    'contacts/platforms/index.html': '<Footer withGrid badges={false} anchorId="contacts" mobileAnchorId="contact" />',
    'forma-dlya-zayavki/index.html': '<Footer location="chekhova" />',
    'gruppovye-trenirovki/index.html': '<Footer location="nahabinskoe-shosse" anchorId="contacts" mobileAnchorId="contact" />',
    'index.html': '<Footer withGrid />',
    'personalnye-trenirovki/index.html': '<Footer location="chekhova" anchorId="contacts" mobileAnchorId="contact" />',
    'raspisanie/index.html': '<Footer withGrid withMobile={false} withMap={false} badges={false} anchorId="contacts" />',
    'trenery/index.html': '<Footer location="chekhova" anchorId="contacts" mobileAnchorId="contact" />',
  };
  for (const [page, call] of Object.entries(expected)) {
    const pagePath = page === 'index.html' ? '/' : `/${page.replace(/index\.html$/, '')}`;
    assert.equal(blocks.convertFooter(showLegacy(`public/${page}`).match(blocks.FOOTER_RE)[0], { pagePath, templates }), call, page);
  }
});
