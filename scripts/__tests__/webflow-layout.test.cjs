'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { analyzeWebflowPage, checkWebflowLayouts } = require('../check-webflow-layout.cjs');

function page({ pageId = '69b540f958c9c44d220bcf1a', ids = [] } = {}) {
  return `<html data-wf-page="${pageId}"><body>${ids.map(id => `<div id="${id}"></div>`).join('')}</body></html>`;
}

test('repository Webflow pages use valid page ids and matching layout selectors', () => {
  const result = checkWebflowLayouts();

  assert.ok(result.checkedPages > 0);
  assert.ok(result.checkedWNodes > 0);
});

test('rejects synthetic Webflow page ids such as the former -mini suffix', () => {
  const result = analyzeWebflowPage({
    cssSource: '',
    relativePath: 'trenazhernyj-zal/mini-gruppy/index.html',
    sourceHtml: page({ pageId: '69b540f958c9c44d220bcf1a-mini' }),
  });

  assert.match(result.errors.join('\n'), /24-character lowercase hex id/);
});

test('rejects pages whose generated w-node ids are mostly absent from Webflow CSS', () => {
  const ids = Array.from({ length: 10 }, (_, index) => `w-node-card-${index}-220bcf1a`);
  const result = analyzeWebflowPage({
    cssSource: ids
      .slice(0, 2)
      .map(id => `#${id} { grid-area: auto; }`)
      .join('\n'),
    relativePath: 'broken/index.html',
    sourceHtml: page({ ids }),
  });

  assert.match(result.errors.join('\n'), /covers only 2\/10 w-node ids/);
});

test('allows a small number of intentionally unstyled w-node ids', () => {
  const ids = Array.from({ length: 10 }, (_, index) => `w-node-card-${index}-220bcf1a`);
  const result = analyzeWebflowPage({
    cssSource: ids
      .slice(0, 9)
      .map(id => `#${id} { grid-area: auto; }`)
      .join('\n'),
    relativePath: 'valid/index.html',
    sourceHtml: page({ ids }),
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.coverage, 0.9);
});

test('rejects duplicate element ids that can collapse layout behavior', () => {
  const duplicateId = 'w-node-card-1-220bcf1a';
  const result = analyzeWebflowPage({
    cssSource: `#${duplicateId} { grid-area: auto; }`,
    relativePath: 'duplicate/index.html',
    sourceHtml: page({ ids: [duplicateId, duplicateId] }),
  });

  assert.match(result.errors.join('\n'), /contains duplicate ids/);
});
