'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const test = require('node:test');

const { deterministicUuid, parseTelegramDate, parseTelegramExport } = require('../import-leads.cjs');

function message({ id, date, text, joined = false }) {
  return `
    <div class="message default clearfix${joined ? ' joined' : ''}" id="message${id}">
      <div class="body">
        <div class="pull_right date details" title="${date}">00:00</div>
        <div class="text">${text}</div>
      </div>
    </div>`;
}

test('parses Telegram HTML leads without depending on sender blocks', () => {
  const html = [
    '<div class="history">',
    message({
      id: 42,
      date: '19.05.2026 14:52:09 UTC+03:00',
      text: [
        'Новая заявка',
        'Имя: Иван &amp; Мария',
        'Телефон: +7 999 000-00-00',
        'Способ связи: Telegram',
        'Телеграм: @example',
        '---',
        'Маркировка:',
        'source: yandex',
        'campaign: spring:brand',
      ].join('<br>'),
    }),
    '<div class="message service"><div class="body details">service event</div></div>',
    message({
      id: 43,
      date: '20.05.2026 10:00:00 UTC+03:00',
      joined: true,
      text: ['Новая заявка', 'Имя: Анна', 'Телефон: +7 999 111-11-11', 'Способ связи: Телефон'].join('<br>'),
    }),
    '</div>',
  ].join('');

  const parsed = parseTelegramExport(html);

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.leads.length, 2);
  assert.equal(parsed.leads[0].name, 'Иван & Мария');
  assert.equal(parsed.leads[0].telegramUsername, '@example');
  assert.deepEqual(parsed.leads[0].utm, {
    utm_source: 'yandex',
    utm_campaign: 'spring:brand',
  });
  assert.equal(parsed.leads[0].createdAt.toISOString(), '2026-05-19T11:52:09.000Z');
  assert.equal(parsed.leads[1].contactMethod, 'Телефон');
});

test('rejects a lead with missing required fields without exposing field values', () => {
  const html = message({
    id: 99,
    date: '20.05.2026 10:00:00 UTC+03:00',
    text: 'Новая заявка<br>Имя: Анна<br>Способ связи: Телефон',
  });

  const parsed = parseTelegramExport(html);

  assert.deepEqual(parsed.leads, []);
  assert.deepEqual(parsed.errors, [{ messageId: '99', code: 'required_field_missing' }]);
});

test('creates stable UUID-compatible identifiers from Telegram message ids', () => {
  const first = deterministicUuid('chat-a', '42');

  assert.equal(first, deterministicUuid('chat-a', '42'));
  assert.notEqual(first, deterministicUuid('chat-a', '43'));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('rejects unsupported Telegram date formats', () => {
  assert.equal(parseTelegramDate('2026-05-19'), null);
});
