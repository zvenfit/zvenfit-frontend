'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { legacyBase, listLegacy, showLegacy } = require('./helpers/legacy-base.cjs');
const { BACK_SCRIPT_RE, NODES, extractTrainer, matchBody } = require('../migrate/trainer-page.cjs');

const NBSP = String.fromCharCode(0xa0);
const SUFFIX = 'bd908423';
const WF_PAGE = `6a603de510930fd2${SUFFIX}`;
const GTM_FRAME =
  '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5532ZMV5" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>';
const GTM_BLOCK = `<!--  Google Tag Manager (noscript)  -->\n  ${GTM_FRAME}\n  <!--  End Google Tag Manager (noscript)  -->`;
const identity = value => value;

function card({ indent = 6, id = '', description = '<strong class="bold-text-2">по программе &quot;Пилатес&quot;</strong>', link = 'aria-label="Посмотреть документ"' } = {}) {
  const pad = offset => ' '.repeat(indent + offset);
  return [
    `${pad(0)}<div${id} class="cat_card areas">`,
    `${pad(2)}<div class="text_categ">`,
    `${pad(4)}<h3 class="text-block">Сертификат</h3>`,
    `${pad(4)}<p class="body_txt">${description}</p>`,
    `${pad(2)}</div>`,
    `${pad(2)}<a href="https://storage.yandexcloud.net/zvenfit/v2/documents/sertifikat-1.webp" target="_blank" ${link} class="button areas w-button">посмотреть</a>`,
    `${pad(0)}</div>`,
    '',
  ].join('\n');
}

// A legacy trainer page; the defaults describe the hand-written family.
function trainerPage({
  comments = '<!--  This site was created in Webflow. https://webflow.com  --><!--  Last Published: Sun Jul 26 2026 11:07:12 GMT+0000 (Coordinated Universal Time)  -->',
  blankLine = true,
  gtm = 'before',
  photo = ' anast',
  miniPhoto = photo,
  heading = 'Анастасия Извекова',
  cta = `записаться к${NBSP}анастасии`,
  list = ['<li class="heading-3 space">образование:</li>', '<li class="body_txt">Высшее спортивное образование</li>', '<li class="heading-3 _1">Направления:</li>', '<li class="body_txt">Пилатес<br></li>'],
  cards = '',
  emptySection = false,
  fallback = '/',
} = {}) {
  const node = name => `w-node-${NODES[name]}-${SUFFIX}`;
  const lines = [
    `<!DOCTYPE html>${comments}`,
    `<html lang="ru" data-wf-page="${WF_PAGE}" data-wf-site="697f30b67cb029a39716bd07">`,
    '<head>',
    '  <meta charset="utf-8">',
    '</head>',
    '<body class="body">',
    '  <div class="grain-overlay">',
    '    </div>',
    ...(blankLine ? ['  '] : []),
    '  <section class="menu2-coach">',
    '    <div class="menu_grid _1">',
    `      <a data-back="true" id="${node('back')}" href="#" class="link-block-page1 w-inline-block">`,
    '        <div class="menu-txt">вернуться назад</div>',
    '      </a>',
    `      <a id="${node('next')}" href="/trenery/trener-shorena-dzhakhaya/" class="link-block-page4 w-inline-block">`,
    '        <div class="menu-txt">следующий тренер</div>',
    '      </a>',
    '    </div>',
    '  </section>',
    '  <section>',
    `    <div class="photo_coach${photo}"></div>`,
    '    <div class="card_grid">',
    `      <div id="${node('card')}" class="div-block-12">`,
    `        <h2 class="heading-page">${heading}</h2>`,
    '        <h3 class="text-block">Тренер по фитнесу<br></h3>',
    '      </div>',
    `      <a id="${node('cta')}" data-w-id="980bac73-2f9d-6ef2-62fc-7ca3af7945ed" href="/forma-dlya-zayavki/" target="_blank" class="button coach w-button" aria-label="Записаться к тренеру">${cta}</a>`,
    '    </div>',
    '  </section>',
    '  <div class="divider"></div>',
    '  <section class="card_grid">',
    `    <div id="${node('photo')}" class="photo_coach_mini${miniPhoto}"></div>`,
    `    <ul id="${node('list')}" role="list" class="list">`,
    ...list.map(item => `      ${item}`),
    '    </ul>',
    '  </section>',
    ...(emptySection ? ['  <section class="section-2"></section>'] : []),
    '  <div class="divider"></div>',
    ...(cards ? ['  <section class="section-2">', '    <h3 class="heading-3">Сертификаты</h3>', '    <div class="card_grid">', cards.replace(/\n$/, ''), '    </div>', '  </section>', '  <div class="divider"></div>'] : []),
    ...(gtm === 'before' ? [`  ${GTM_BLOCK}`, ''] : []),
    '  <script src="https://storage.yandexcloud.net/zvenfit/v2/js/jquery-3.5.1.min.js" type="text/javascript" defer></script>',
    `  <script src="/js/webflow.js" type="text/javascript" defer></script>${gtm === 'after' ? GTM_BLOCK : ''}`,
    ...(gtm === 'bare' ? [`  ${GTM_FRAME}`] : []),
    '  <script>',
    'document.addEventListener("DOMContentLoaded", function() {',
    "  document.querySelectorAll('[data-back]').forEach(function(btn) {",
    "    btn.addEventListener('click', function(e) {",
    '      e.preventDefault();',
    '      if (history.length <= 1) {',
    `        window.location.pathname = '${fallback}';`,
    '      } else {',
    '        history.back();',
    '      }',
    '    });',
    '  });',
    '});',
    '</script>',
    '</body>',
    '</html>',
    '',
  ];
  return lines.join('\n');
}

const extract = source => extractTrainer({ slug: 'trener-test', source, text: identity, html: identity });

test('a hand-written page yields its content and the family of its markup', () => {
  const page = extract(trainerPage());
  assert.equal(page.wfPage, WF_PAGE);
  assert.equal(page.markup, 'handwritten');
  assert.equal(page.bodyGtm, 'commented');
  assert.equal(page.nextSlug, 'trener-shorena-dzhakhaya');
  assert.equal(page.photoClass, 'anast');
  assert.equal(page.heading, 'Анастасия Извекова');
  assert.equal(page.role, 'Тренер по фитнесу<br>');
  assert.equal(page.nameDative, 'анастасии');
  assert.equal(page.ctaSpace, NBSP);
  assert.deepEqual(page.groups, [
    { heading: 'образование:', itemsHtml: ['Высшее спортивное образование'] },
    { heading: 'Направления:', itemsHtml: ['Пилатес<br>'] },
  ]);
  assert.equal(page.certificates, undefined);
  assert.equal(page.certificatesSectionEmpty, false);
  assert.equal(page.backFallbackPath, '/');
  assert.match(page.webflowComments, /Last Published: Sun Jul 26 2026/);
});

test('a Webflow page carries the GTM frame after the runtime, commented or bare', () => {
  const exported = extract(trainerPage({ blankLine: false, gtm: 'after', cta: 'записаться к анне', photo: '' }));
  assert.equal(exported.markup, 'webflow');
  assert.equal(exported.bodyGtm, 'commented');
  assert.equal(exported.ctaSpace, ' ');
  assert.equal(exported.photoClass, undefined);
  const bare = extract(trainerPage({ blankLine: false, gtm: 'bare', comments: '', fallback: '/trenery/' }));
  assert.equal(bare.bodyGtm, 'bare');
  assert.equal(bare.webflowComments, '');
  assert.equal(bare.backFallbackPath, '/trenery/');
});

test('certificate cards keep their indentation, node ids, link attributes and unwrapped descriptions', () => {
  const usual = extract(trainerPage({ cards: card() + card() }));
  assert.equal(usual.certificateIndent, 6);
  assert.equal(usual.certificateLinkRel, undefined);
  assert.deepEqual(usual.certificates[0], { title: 'Сертификат', description: 'по программе &quot;Пилатес&quot;', href: 'https://storage.yandexcloud.net/zvenfit/v2/documents/sertifikat-1.webp' });
  const deep = extract(trainerPage({ blankLine: false, gtm: 'after', cards: card({ indent: 12 }) }));
  assert.equal(deep.certificateIndent, 12);
  const linked = extract(
    trainerPage({
      cards: card({ description: 'о прохождении курса', link: 'rel="noopener noreferrer"' }) + card({ id: ` id="w-node-f394948c-d9ea-9703-61a4-183cf369dda6-${SUFFIX}"`, link: 'rel="noopener noreferrer"' }),
    }),
  );
  assert.equal(linked.certificateLinkRel, 'noopener noreferrer');
  assert.deepEqual(linked.certificates.map(item => [item.plainDescription, item.wNode]), [
    [true, undefined],
    [undefined, `w-node-f394948c-d9ea-9703-61a4-183cf369dda6-${SUFFIX}`],
  ]);
  const empty = extract(trainerPage({ blankLine: false, gtm: 'after', emptySection: true }));
  assert.equal(empty.certificatesSectionEmpty, true);
  assert.throws(() => extract(trainerPage({ cards: card() + card({ link: 'rel="noopener noreferrer"' }) })), /mixes certificate link attributes/);
  assert.throws(() => extract(trainerPage({ cards: card().replace('cat_card areas', 'cat_card') })), /certificate card 1 does not match the card contract/);
  assert.throws(() => extract(trainerPage({ blankLine: false, gtm: 'after', emptySection: true, cards: card() })), /both an empty and a filled certificate section/);
});

test('a page that leaves the skeleton is refused with the part that failed', () => {
  assert.throws(() => extract(trainerPage({ heading: 'Имя</h2>\n        <p>лишний абзац</p><h2>' })), /leaves the shared trainer skeleton at "name and role card"/);
  assert.throws(() => extract(trainerPage({ list: ['<li class="body_txt">без заголовка</li>'] })), /list line outside the heading\/items structure/);
  assert.throws(() => extract(trainerPage({ list: ['<li class="heading-3 space">а:</li>', '<li class="heading-3 space">б:</li>'] })), /list heading 2 carries class "heading-3 space", the template renders "heading-3 _1"/);
  assert.throws(() => extract(trainerPage({ miniPhoto: ' other' })), /different photo modifiers/);
  assert.throws(() => extract(trainerPage({ gtm: 'none' })), /GTM noscript frame exactly once/);
  assert.throws(() => extract(trainerPage({ blankLine: false })), /mixes the two legacy markup families/);
  assert.throws(() => extract(trainerPage({ blankLine: true, gtm: 'after' })), /mixes the two legacy markup families/);
  assert.throws(() => extract(trainerPage().replace("e.preventDefault();", "e.preventDefault(); track();")), /back-button script differs/);
  assert.throws(() => extract(trainerPage().replace('data-wf-site="697f30b67cb029a39716bd07">', 'data-wf-site="697f30b67cb029a39716bd07" class="x">')), /document frame of a trainer page/);
  assert.throws(() => matchBody('<body class="body">\n  <main></main>', SUFFIX, 'trener-test'), /at "body start and grain overlay": "<body class=/);
  assert.equal(BACK_SCRIPT_RE.test('document.addEventListener("DOMContentLoaded", function() {});\n'), false);
});

test('every legacy trainer page at the pinned base fits the skeleton: seven Webflow pages and fourteen hand-written ones', t => {
  if (!legacyBase(t)) {
    return;
  }
  const pages = listLegacy('public/trenery').filter(file => /\/trener-[a-z-]+\/index\.html$/.test(file));
  const families = { webflow: 0, handwritten: 0 };
  for (const file of pages) {
    const slug = file.split('/')[2];
    const page = extractTrainer({ slug, source: showLegacy(file), text: identity, html: identity });
    families[page.markup] += 1;
    assert.ok(page.groups.length >= 1 && page.groups.every(group => group.itemsHtml.length > 0), slug);
  }
  assert.deepEqual(families, { webflow: 7, handwritten: 14 });
});
