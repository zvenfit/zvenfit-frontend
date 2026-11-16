'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { stripGoogleTagManager } = require('../build-static.cjs');

const ROOT = path.join(__dirname, '..', '..');
const clubCardHtml = fs.readFileSync(path.join(ROOT, 'public/klubnaya-karta/index.html'), 'utf8');
const homeHtml = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

function assertGtmGone(html) {
  assert.doesNotMatch(html, /googletagmanager\.com/);
  assert.doesNotMatch(html, /GTM-[A-Z0-9]+/);
  assert.doesNotMatch(html, /Google Tag Manager/);
}

test('staging strip removes only the GTM blocks from the club card head', () => {
  const stripped = stripGoogleTagManager(clubCardHtml);

  assertGtmGone(stripped);
  assert.match(stripped, /n\.className\+=t\+"js"/, 'Webflow bootstrap script must survive');
  assert.match(stripped, /rel="shortcut icon"/, 'favicon link must survive');
  assert.match(stripped, /rel="apple-touch-icon"/, 'apple-touch-icon link must survive');
  assert.match(stripped, /property="og:image" content="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/images\/club-card\/hero\.webp"/);
  assert.match(stripped, /property="twitter:image" content="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/images\/club-card\/hero\.webp"/);
});

test('staging strip keeps the neighbours of the GTM blocks in their original order', () => {
  const stripped = stripGoogleTagManager(clubCardHtml);
  const bootstrap = stripped.indexOf('n.className+=t+"js"');
  const favicon = stripped.indexOf('rel="shortcut icon"');
  const webclip = stripped.indexOf('rel="apple-touch-icon"');
  const ogImage = stripped.indexOf('property="og:image"');
  const jquery = stripped.indexOf('jquery-3.5.1.min.js');
  const webflow = stripped.indexOf('/js/webflow.js');

  assert.ok(bootstrap >= 0 && favicon > bootstrap && webclip > favicon && ogImage > webclip);
  assert.ok(jquery >= 0 && webflow > jquery);
});

test('staging strip removes exactly the GTM script, its noscript iframe and the marker comments', () => {
  const stripped = stripGoogleTagManager(homeHtml);
  const removedScripts = (homeHtml.match(/<script\b/g) || []).length - (stripped.match(/<script\b/g) || []).length;
  const removedNoscripts = (homeHtml.match(/<noscript>/g) || []).length - (stripped.match(/<noscript>/g) || []).length;

  assertGtmGone(stripped);
  assert.equal(removedScripts, 1);
  assert.equal(removedNoscripts, 1);
  assert.equal((stripped.match(/<link\b/g) || []).length, (homeHtml.match(/<link\b/g) || []).length);
  assert.equal((stripped.match(/<meta\b/g) || []).length, (homeHtml.match(/<meta\b/g) || []).length);
});

test('a page without GTM is returned unchanged', () => {
  const withoutGtm = stripGoogleTagManager(clubCardHtml);

  assert.equal(stripGoogleTagManager(withoutGtm), withoutGtm);
  const synthetic = '<html><head><script>var a = 1;</script><link rel="shortcut icon" href="/f.png"></head><body><noscript>no js</noscript></body></html>';
  assert.equal(stripGoogleTagManager(synthetic), synthetic);
});

test('a GTM block that follows another script on the same line does not take that script with it', () => {
  const fixture = [
    '<script>window.keep = true;</script><!-- Google Tag Manager -->',
    "<script>(function(w,d,s,l,i){w[l]=w[l]||[];var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-TEST');</script>",
    '<!-- End Google Tag Manager -->',
    '<noscript>keep me</noscript><!-- Google Tag Manager (noscript) -->',
    '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TEST"></iframe></noscript>',
    '<!-- End Google Tag Manager (noscript) -->',
  ].join('\n');
  const stripped = stripGoogleTagManager(fixture);

  assertGtmGone(stripped);
  assert.match(stripped, /window\.keep = true;/);
  assert.match(stripped, /<noscript>keep me<\/noscript>/);
});
