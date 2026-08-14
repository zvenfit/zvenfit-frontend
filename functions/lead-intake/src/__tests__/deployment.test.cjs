'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function javascriptSource(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const target = path.join(directory, entry.name);

      return entry.isDirectory()
        ? [javascriptSource(target)]
        : entry.name.endsWith('.js')
          ? [fs.readFileSync(target, 'utf8')]
          : [];
    })
    .join('\n');
}

test('production and staging artifacts expose separate cloud handlers', () => {
  const compiledFunction = require('../../build/index.js');
  const compiledStagingFunction = require('../../build-staging/entrypoints/staging.js');

  assert.equal(typeof compiledFunction.handler, 'function');
  assert.equal(typeof compiledStagingFunction.handler, 'function');
});

test('discard notification adapter and Telegram adapter are physically isolated', () => {
  const productionRoot = path.resolve(__dirname, '../../build');
  const stagingRoot = path.resolve(__dirname, '../../build-staging');
  const productionSource = javascriptSource(productionRoot);
  const stagingSource = javascriptSource(stagingRoot);

  assert.equal(fs.existsSync(path.join(productionRoot, 'entrypoints/staging.js')), false);
  assert.equal(fs.existsSync(path.join(productionRoot, 'adapters/notification/discard-sink.js')), false);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'telegram')), false);
  assert.doesNotMatch(productionSource, /discardNotification|external side effect/);
  assert.doesNotMatch(stagingSource, /api\.telegram\.org|TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID/);
  assert.doesNotMatch(`${productionSource}\n${stagingSource}`, /TELEGRAM_DELIVERY_MODE/);
});

test('application handler depends on ports instead of concrete infrastructure', () => {
  const handlerSource = fs.readFileSync(path.resolve(__dirname, '../handler.ts'), 'utf8');

  assert.doesNotMatch(handlerSource, /process\.env|from ['"].*telegram|from ['"].*ydb/);
  assert.doesNotMatch(handlerSource, /createInvocationLogger|createInvocationMetrics|randomUUID/);
  assert.match(handlerSource, /createHandler\(dependencies: HandlerDependencies\)/);
});
