import assert from 'node:assert/strict';
import test from 'node:test';

import { createProductionDependencies } from '../production';

test('production composition owns notification retry configuration', () => {
  const defaults = createProductionDependencies({});
  const configured = createProductionDependencies({ MAX_TELEGRAM_ATTEMPTS: '8', TELEGRAM_RETRY_BATCH_SIZE: '999' });

  assert.equal(defaults.maxAttempts(), 12);
  assert.equal(defaults.retryBatchSize(), 5);
  assert.equal(configured.maxAttempts(), 8);
  assert.equal(configured.retryBatchSize(), 25);
});
