'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const WEBFLOW_CSS_PATH = path.join(PUBLIC_DIR, 'css', 'zvenfit.webflow.css');
const MIN_W_NODE_CSS_COVERAGE = 0.9;
const WEBFLOW_PAGE_ID_PATTERN = /^[0-9a-f]{24}$/;

function walkHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractAttribute(source, attributeName) {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`\\b${escapedName}=(['"])(.*?)\\1`, 'i'));
  return match?.[2] || null;
}

function extractIds(source) {
  return Array.from(source.matchAll(/\bid=(['"])(.*?)\1/gi), match => match[2]);
}

function analyzeWebflowPage({ cssSource, minCoverage = MIN_W_NODE_CSS_COVERAGE, relativePath, sourceHtml }) {
  const errors = [];
  const pageId = extractAttribute(sourceHtml, 'data-wf-page');
  const ids = extractIds(sourceHtml);
  const wNodeIds = ids.filter(id => id.startsWith('w-node-'));
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

  if (pageId && !WEBFLOW_PAGE_ID_PATTERN.test(pageId)) {
    errors.push(`${relativePath}: data-wf-page must be a 24-character lowercase hex id, got "${pageId}"`);
  }

  if (wNodeIds.length > 0 && !pageId) {
    errors.push(`${relativePath}: contains w-node ids but has no data-wf-page`);
  }

  if (duplicateIds.length > 0) {
    errors.push(`${relativePath}: contains duplicate ids: ${duplicateIds.join(', ')}`);
  }

  const matchedWNodeIds = wNodeIds.filter(id => cssSource.includes(`#${id}`));
  const coverage = wNodeIds.length === 0 ? 1 : matchedWNodeIds.length / wNodeIds.length;

  if (wNodeIds.length > 0 && coverage < minCoverage) {
    const missingIds = wNodeIds.filter(id => !cssSource.includes(`#${id}`));
    errors.push(
      `${relativePath}: Webflow CSS covers only ${matchedWNodeIds.length}/${wNodeIds.length} w-node ids; ` +
        `missing ${missingIds.slice(0, 5).join(', ')}${missingIds.length > 5 ? ', ...' : ''}`,
    );
  }

  return {
    coverage,
    errors,
    matchedWNodeCount: matchedWNodeIds.length,
    pageId,
    wNodeCount: wNodeIds.length,
  };
}

function checkWebflowLayouts({
  cssPath = WEBFLOW_CSS_PATH,
  minCoverage = MIN_W_NODE_CSS_COVERAGE,
  publicDir = PUBLIC_DIR,
} = {}) {
  const cssSource = fs.readFileSync(cssPath, 'utf8');
  const errors = [];
  let checkedPages = 0;
  let checkedWNodes = 0;

  for (const htmlPath of walkHtmlFiles(publicDir)) {
    const sourceHtml = fs.readFileSync(htmlPath, 'utf8');
    const relativePath = path.relative(publicDir, htmlPath);
    const result = analyzeWebflowPage({ cssSource, minCoverage, relativePath, sourceHtml });

    if (result.pageId || result.wNodeCount > 0) {
      checkedPages += 1;
      checkedWNodes += result.wNodeCount;
    }
    errors.push(...result.errors);
  }

  if (errors.length > 0) {
    throw new Error(`check-webflow-layout failed:\n- ${errors.join('\n- ')}`);
  }

  return { checkedPages, checkedWNodes };
}

if (require.main === module) {
  try {
    const result = checkWebflowLayouts();
    console.log(
      `check-webflow-layout: verified ${result.checkedWNodes} w-node id(s) across ${result.checkedPages} page(s)`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  MIN_W_NODE_CSS_COVERAGE,
  WEBFLOW_PAGE_ID_PATTERN,
  analyzeWebflowPage,
  checkWebflowLayouts,
  extractAttribute,
  extractIds,
};
