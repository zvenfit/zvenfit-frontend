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

test('production and staging artifacts export only their cloud handler', () => {
  const compiledFunction = require('../../build/index.js');
  const compiledStagingFunction = require('../../build-staging/entrypoints/staging.js');

  assert.equal(typeof compiledFunction.handler, 'function');
  assert.deepEqual(Object.keys(compiledFunction), ['handler']);
  assert.equal(typeof compiledStagingFunction.handler, 'function');
  assert.deepEqual(Object.keys(compiledStagingFunction), ['handler']);
});

test('synthetic data and Fitbase integration are physically isolated between artifacts', () => {
  const productionRoot = path.resolve(__dirname, '../../build');
  const stagingRoot = path.resolve(__dirname, '../../build-staging');
  const productionSource = javascriptSource(productionRoot);
  const stagingSource = javascriptSource(stagingRoot);

  assert.equal(fs.existsSync(path.join(productionRoot, 'entrypoints/staging.js')), false);
  assert.equal(fs.existsSync(path.join(productionRoot, 'adapters/synthetic')), false);
  assert.equal(fs.existsSync(path.join(stagingRoot, 'adapters/fitbase')), false);
  assert.doesNotMatch(productionSource, /fixture-|ZvenFit Staging|Тест: групповая тренировка/);
  assert.doesNotMatch(stagingSource, /FITBASE_API_TOKEN|api\.fitbase|fitbase_schedule_error/);
  assert.doesNotMatch(`${productionSource}\n${stagingSource}`, /SCHEDULE_PROVIDER/);
});

test('application handler depends on a provider port instead of concrete adapters', () => {
  const handlerSource = fs.readFileSync(path.resolve(__dirname, '../handler.ts'), 'utf8');

  assert.doesNotMatch(handlerSource, /process\.env|from ['"].*fitbase|from ['"].*providers|provider\.name/);
  assert.match(handlerSource, /createHandler\(dependencies: HandlerDependencies\)/);
  assert.match(handlerSource, /dependencies\.providerFactory\(\)/);
});
