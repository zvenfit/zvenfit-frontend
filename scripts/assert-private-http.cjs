'use strict';

const DEFAULT_TIMEOUT_MS = 15_000;

async function assertPrivateUrl(url, { allowMissing = false, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const accepted = response.status === 401 || response.status === 403 || (allowMissing && response.status === 404);
  if (!accepted) {
    throw new Error(`assert-private-http: ${url} returned ${response.status}; private boundary is not proven`);
  }
  console.log(`assert-private-http: ${url} rejected anonymous access with HTTP ${response.status}`);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const url = argv.find(value => !value.startsWith('--'));
  if (!url) {
    throw new Error('assert-private-http: URL is required');
  }
  assertPrivateUrl(url, { allowMissing: argv.includes('--allow-missing') }).catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { assertPrivateUrl };
