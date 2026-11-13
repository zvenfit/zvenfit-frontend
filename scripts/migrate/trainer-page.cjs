'use strict';

// Trainer pages of the legacy export become entries of the `trainers` content
// collection (src/content/trainers/<slug>.json); one template renders all of
// them (src/pages/trenery/[slug].astro). This module reads a legacy trainer
// page with a strict grammar: every byte of the body is either a fixed part of
// the shared skeleton or a captured value, so a page that does not fit the
// template is refused instead of being approximated. Differences between the
// legacy pages that are not content (the family of markup, GTM comment style,
// the indentation of certificate cards) are kept in the `legacy` block of the
// entry and listed in scripts/migrate/manual.json.

const GTM_NOSCRIPT =
  '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5532ZMV5" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>';
const GTM_OPEN = '<!--  Google Tag Manager (noscript)  -->';
const GTM_CLOSE = '<!--  End Google Tag Manager (noscript)  -->';
const JQUERY = '<script src="https://storage.yandexcloud.net/zvenfit/v2/js/jquery-3.5.1.min.js" type="text/javascript" defer></script>';
const WEBFLOW = '<script src="/js/webflow.js" type="text/javascript" defer></script>';
const BACK_SCRIPT_RE =
  /^document\.addEventListener\("DOMContentLoaded", function\(\) \{\n {2}document\.querySelectorAll\('\[data-back\]'\)\.forEach\(function\(btn\) \{\n {4}btn\.addEventListener\('click', function\(e\) \{\n {6}e\.preventDefault\(\);\n {6}if \(history\.length <= 1\) \{\n {8}window\.location\.pathname = '(\/[a-z/-]*)';\n {6}\} else \{\n {8}history\.back\(\);\n {6}\}\n {4}\}\);\n {2}\}\);\n\}\);\n$/;

// The six Webflow node ids every trainer page carries; the suffix is the last
// eight hex digits of the page's data-wf-page.
const NODES = Object.freeze({
  back: 'e11a7337-bde2-19aa-1b4b-c032af4154f2',
  next: 'e11a7337-bde2-19aa-1b4b-c032af4154f5',
  card: '_3a3877c5-6cff-fbf8-e343-fd2c16920b2f',
  cta: '_980bac73-2f9d-6ef2-62fc-7ca3af7945ed',
  photo: 'ef656b17-654a-462b-e243-174727480d7f',
  list: '_56762e99-7fb7-f4e5-d9ce-ad52ba56dcbf',
});
const CTA_INTERACTION = '980bac73-2f9d-6ef2-62fc-7ca3af7945ed';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The body grammar as an ordered list of named parts. They are matched one
// after another, so a page that leaves the skeleton is reported with the part
// that failed and the source at that position.
function bodyParts(suffix) {
  const node = name => `w-node-${NODES[name]}-${suffix}`;
  const gtmBlock = `${escapeRegExp(GTM_OPEN)}\\n {2}${escapeRegExp(GTM_NOSCRIPT)}\\n {2}${escapeRegExp(GTM_CLOSE)}`;
  return [
    ['body start and grain overlay', '<body class="body">\\n {2}<div class="grain-overlay">\\n {4}</div>\\n'],
    ['blank line before the menu', '(?<blankLine> {2}\\n)?'],
    [
      'coach menu',
      ' {2}<section class="menu2-coach">\\n {4}<div class="menu_grid _1">\\n' +
        ` {6}<a data-back="true" id="${node('back')}" href="#" class="link-block-page1 w-inline-block">\\n {8}<div class="menu-txt">вернуться назад</div>\\n {6}</a>\\n` +
        ` {6}<a id="${node('next')}" href="/trenery/(?<nextSlug>trener-[a-z-]+)/" class="link-block-page4 w-inline-block">\\n {8}<div class="menu-txt">следующий тренер</div>\\n {6}</a>\\n` +
        ' {4}</div>\\n {2}</section>\\n',
    ],
    ['cover photo', ' {2}<section>\\n {4}<div class="photo_coach(?: (?<photoClass>[a-z0-9_-]+))?"></div>\\n {4}<div class="card_grid">\\n'],
    [
      'name and role card',
      ` {6}<div id="${node('card')}" class="div-block-12">\\n` +
        ' {8}<h2 class="heading-page">(?<heading>.*)</h2>\\n {8}<h3 class="text-block">(?<role>.*)</h3>\\n {6}</div>\\n',
    ],
    [
      'sign-up button',
      ` {6}<a id="${node('cta')}" data-w-id="${CTA_INTERACTION}" href="/forma-dlya-zayavki/" target="_blank" (?:class="button coach w-button" aria-label="Записаться к тренеру"|aria-label="Записаться к тренеру" class="button coach w-button")>записаться к(?<ctaSpace>[ \u00a0])(?<nameDative>[^<]+)</a>\\n` +
        ' {4}</div>\\n {2}</section>\\n {2}<div class="divider"></div>\\n',
    ],
    [
      'list photo and list start',
      ' {2}<section class="card_grid">\\n' +
        ` {4}<div id="${node('photo')}" class="photo_coach_mini(?: (?<miniClass>[a-z0-9_-]+))?"></div>\\n` +
        ` {4}<ul id="${node('list')}" role="list" class="list">\\n`,
    ],
    ['list of headings and items', '(?<list>(?: {6}<li class="(?:heading-3 (?:space|_1)|body_txt)">.*</li>\\n)+) {4}</ul>\\n {2}</section>\\n'],
    ['empty certificate section', '(?<emptyCertificates> {2}<section class="section-2"></section>\\n)?'],
    ['divider after the list', ' {2}<div class="divider"></div>\\n'],
    [
      'certificate section',
      '(?: {2}<section class="section-2">\\n {4}<h3 class="heading-3">Сертификаты</h3>\\n {4}<div class="card_grid">\\n(?<cards>[\\s\\S]*?) {4}</div>\\n {2}</section>\\n {2}<div class="divider"></div>\\n)?',
    ],
    ['GTM noscript before the runtime scripts', `(?<gtmBefore> {2}${gtmBlock}\\n\\n)?`],
    ['jQuery and webflow.js', ` {2}${escapeRegExp(JQUERY)}\\n {2}${escapeRegExp(WEBFLOW)}`],
    ['GTM noscript after the runtime scripts', `(?:(?<gtmAfterCommented>${gtmBlock})|(?<gtmAfterBare>\\n {2}${escapeRegExp(GTM_NOSCRIPT)}))?`],
    ['back-button script and document end', '\\n {2}<script>\\n(?<backScript>[\\s\\S]*?)</script>\\n</body>\\n</html>\\n$'],
  ];
}

function matchBody(body, suffix, slug) {
  const captured = {};
  let cursor = 0;
  for (const [name, source] of bodyParts(suffix)) {
    const pattern = new RegExp(source, 'y');
    pattern.lastIndex = cursor;
    const match = pattern.exec(body);
    if (!match) {
      throw new Error(
        `trainers: ${slug} leaves the shared trainer skeleton at "${name}": ${JSON.stringify(body.slice(cursor, cursor + 200))}. Extend the template and the schema, or record the deviation in manual.json`,
      );
    }
    Object.assign(captured, match.groups);
    cursor = pattern.lastIndex;
  }
  return captured;
}

function parseList(list, slug) {
  const groups = [];
  for (const line of list.split('\n').filter(Boolean)) {
    const heading = line.match(/^ {6}<li class="heading-3 (space|_1)">(.*)<\/li>$/);
    if (heading) {
      const expected = groups.length === 0 ? 'space' : '_1';
      if (heading[1] !== expected) {
        throw new Error(`trainers: ${slug} list heading ${groups.length + 1} carries class "heading-3 ${heading[1]}", the template renders "heading-3 ${expected}"`);
      }
      groups.push({ headingSource: heading[2], itemsSource: [] });
      continue;
    }
    const item = line.match(/^ {6}<li class="body_txt">(.*)<\/li>$/);
    if (!item || groups.length === 0) {
      throw new Error(`trainers: ${slug} has a list line outside the heading/items structure: ${JSON.stringify(line)}`);
    }
    groups[groups.length - 1].itemsSource.push(item[1]);
  }
  return groups;
}

function parseCards(cards, suffix, slug) {
  const indent = cards.match(/^( *)<div/)?.[1].length;
  if (indent === undefined) {
    throw new Error(`trainers: ${slug} certificate section does not start with a card`);
  }
  const pad = n => ` {${indent + n}}`;
  const cardPattern = new RegExp(
    [
      `${pad(0)}<div(?: id="(?<wNode>w-node-[0-9a-f_-]+-${suffix})")? class="cat_card areas">\\n`,
      `${pad(2)}<div class="text_categ">\\n`,
      `${pad(4)}<h3 class="text-block">(?<title>.*)</h3>\\n`,
      `${pad(4)}<p class="body_txt">(?:<strong class="bold-text-2">(?<description>.*)</strong>|(?<plain>(?!<strong).*))</p>\\n`,
      `${pad(2)}</div>\\n`,
      `${pad(2)}<a href="(?<href>https://storage\\.yandexcloud\\.net/zvenfit/v2/documents/[^"]+)" target="_blank" (?:aria-label="Посмотреть документ"|rel="(?<rel>[^"]+)") class="button areas w-button">посмотреть</a>\\n`,
      `${pad(0)}</div>\\n`,
    ].join(''),
    'y',
  );
  const certificates = [];
  const rels = new Set();
  let cursor = 0;
  while (cursor < cards.length) {
    cardPattern.lastIndex = cursor;
    const match = cardPattern.exec(cards);
    if (!match) {
      throw new Error(`trainers: ${slug} certificate card ${certificates.length + 1} does not match the card contract: ${JSON.stringify(cards.slice(cursor, cursor + 160))}`);
    }
    const { wNode, title, description, plain, href, rel } = match.groups;
    certificates.push({ titleSource: title, descriptionSource: description ?? plain, plain: plain !== undefined, href, wNode });
    rels.add(rel ?? '');
    cursor = cardPattern.lastIndex;
  }
  if (rels.size !== 1) {
    throw new Error(`trainers: ${slug} mixes certificate link attributes (${[...rels].join(' | ')}); the template renders one kind per page`);
  }
  return { certificates, indent, rel: [...rels][0] || undefined };
}

// Reads a legacy trainer page. `text` decodes entities for fields rendered as
// escaped text, `html` prepares fragments rendered through set:html.
function extractTrainer({ slug, source, text, html }) {
  const frame = source.match(/^<!DOCTYPE html>(?<comments>.*)\n<html lang="ru" data-wf-page="(?<wfPage>[0-9a-f]{24})" data-wf-site="(?<wfSite>[0-9a-f]{24})">\n<head>\n[\s\S]*?<\/head>\n(?<body><body[\s\S]*)$/);
  if (!frame) {
    throw new Error(`trainers: ${slug} does not have the document frame of a trainer page`);
  }
  const { comments, wfPage, wfSite, body } = frame.groups;
  const suffix = wfPage.slice(-8);
  const groups = matchBody(body, suffix, slug);
  if ((groups.photoClass ?? '') !== (groups.miniClass ?? '')) {
    throw new Error(`trainers: ${slug} uses different photo modifiers for the cover and the list photo`);
  }
  const back = groups.backScript.match(BACK_SCRIPT_RE);
  if (!back) {
    throw new Error(`trainers: ${slug} back-button script differs from the shared one`);
  }
  const gtmBefore = groups.gtmBefore !== undefined;
  const gtmAfter = groups.gtmAfterCommented !== undefined || groups.gtmAfterBare !== undefined;
  if (gtmBefore === gtmAfter) {
    throw new Error(`trainers: ${slug} must carry the GTM noscript frame exactly once, before or after the runtime scripts`);
  }
  if (gtmBefore !== (groups.blankLine !== undefined)) {
    throw new Error(`trainers: ${slug} mixes the two legacy markup families (blank line before the menu, GTM placement)`);
  }
  const cards = groups.cards === undefined ? null : parseCards(groups.cards, suffix, slug);
  if (cards && groups.emptyCertificates) {
    throw new Error(`trainers: ${slug} has both an empty and a filled certificate section`);
  }

  return {
    wfPage,
    wfSite,
    webflowComments: comments,
    nextSlug: groups.nextSlug,
    photoClass: groups.photoClass,
    heading: html(groups.heading),
    role: html(groups.role),
    nameDative: text(groups.nameDative),
    groups: parseList(groups.list, slug).map(group => ({ heading: text(group.headingSource), itemsHtml: group.itemsSource.map(html) })),
    certificates: cards?.certificates.map(card => ({
      title: text(card.titleSource),
      description: html(card.descriptionSource),
      href: card.href,
      ...(card.wNode ? { wNode: card.wNode } : {}),
      ...(card.plain ? { plainDescription: true } : {}),
    })),
    certificatesSectionEmpty: Boolean(groups.emptyCertificates),
    markup: gtmBefore ? 'handwritten' : 'webflow',
    bodyGtm: groups.gtmAfterBare !== undefined ? 'bare' : 'commented',
    certificateIndent: cards?.indent,
    certificateLinkRel: cards?.rel,
    backFallbackPath: back[1],
    ctaSpace: groups.ctaSpace,
  };
}

module.exports = { BACK_SCRIPT_RE, CTA_INTERACTION, NODES, bodyParts, extractTrainer, matchBody, parseCards, parseList };
