import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMessage } from '../delivery';

const LEAD_ID = '1cc32f4f-8f06-4dc8-915f-92955c829523';

test('message includes the stable lead id and selected attribution fields', () => {
  const message = buildMessage({
    leadId: LEAD_ID,
    createdAt: new Date('2026-08-08T12:00:00.000Z'),
    name: 'Анна',
    phone: '+7 (999) 111-22-33',
    contactMethod: 'Telegram',
    telegramUsername: '@anna',
    utm: { utm_source: 'direct' },
    telegramAttempts: 1,
  });

  assert.match(message, new RegExp(`ID: ${LEAD_ID}`));
  assert.match(message, /Телеграм: @anna/);
  assert.match(message, /source: direct/);
});
