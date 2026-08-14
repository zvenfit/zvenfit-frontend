import assert from 'node:assert/strict';
import test from 'node:test';

import { discardNotification } from '../discard-sink';

test('discard notification adapter has no external side effects', async () => {
  const previousFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = (async () => {
    fetched = true;
    throw new Error('unexpected_fetch');
  }) as typeof fetch;

  try {
    await discardNotification();
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
