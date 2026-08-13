'use strict';

const DEFAULT_SITE_URL = 'https://zvenfit.ru';
const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeSiteUrl(value) {
  const url = new URL(value || DEFAULT_SITE_URL);

  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('smoke-production: SITE_URL must use HTTPS');
  }

  return url.origin;
}

function extractRuntimeUrl(source, variableName) {
  const pattern = new RegExp(`window\\.${variableName}\\s*=\\s*(['"])(.*?)\\1`);
  const match = source.match(pattern);
  const value = match?.[2]?.trim() || '';

  if (!value || value.startsWith('__')) {
    throw new Error(`smoke-production: ${variableName} is missing or still contains a placeholder`);
  }

  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error(`smoke-production: ${variableName} must use HTTPS`);
  }

  return url.toString();
}

function extractScriptUrl(html, filename, origin) {
  const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<script[^>]+src=["']([^"']*/js/${escapedFilename}(?:\\?[^"']*)?)["']`, 'i');
  const source = html.match(pattern)?.[1];

  if (!source) {
    throw new Error(`smoke-production: page does not load /js/${filename}`);
  }

  return new URL(source, origin).toString();
}

async function request(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      redirect: 'follow',
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`smoke-production: request failed for ${url}: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }
}

function assertOk(response, label) {
  if (!response.ok) {
    throw new Error(`smoke-production: ${label} returned HTTP ${response.status}`);
  }
}

async function assertBasicAuthBoundary(fetchImpl, origin, timeoutMs) {
  const response = await request(fetchImpl, `${origin}/`, { headers: { 'Cache-Control': 'no-cache' } }, timeoutMs);

  if (response.status !== 401) {
    throw new Error(`smoke-production: unauthenticated staging returned ${response.status}, expected 401`);
  }

  const challenge = response.headers.get('www-authenticate') || '';
  if (!/^Basic(?:\s|$)/i.test(challenge)) {
    throw new Error('smoke-production: staging 401 is missing the HTTP Basic challenge');
  }
}

async function fetchText(fetchImpl, url, label, timeoutMs, headers = {}) {
  const response = await request(fetchImpl, url, { headers: { 'Cache-Control': 'no-cache', ...headers } }, timeoutMs);
  assertOk(response, label);

  return response.text();
}

async function runSmoke({
  siteUrl = DEFAULT_SITE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  log = console.log,
  basicAuth,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('smoke-production: this Node.js version does not provide fetch');
  }

  const origin = normalizeSiteUrl(siteUrl);
  const authorizationHeaders = basicAuth
    ? {
        Authorization: `Basic ${Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString('base64')}`,
      }
    : {};
  if (basicAuth) {
    await assertBasicAuthBoundary(fetchImpl, origin, timeoutMs);
  }
  const leadPageUrl = `${origin}/forma-dlya-zayavki/`;
  const schedulePageUrl = `${origin}/raspisanie/`;

  const [leadPage, schedulePage] = await Promise.all([
    fetchText(fetchImpl, leadPageUrl, 'lead page', timeoutMs, authorizationHeaders),
    fetchText(fetchImpl, schedulePageUrl, 'schedule page', timeoutMs, authorizationHeaders),
  ]);

  extractScriptUrl(leadPage, 'lead-form.js', origin);
  extractScriptUrl(schedulePage, 'schedule.js', origin);

  const leadConfigUrl = extractScriptUrl(leadPage, 'lead-config.js', origin);
  const scheduleConfigUrl = extractScriptUrl(schedulePage, 'schedule-config.js', origin);
  const [leadConfig, scheduleConfig] = await Promise.all([
    fetchText(fetchImpl, leadConfigUrl, 'lead config', timeoutMs, authorizationHeaders),
    fetchText(fetchImpl, scheduleConfigUrl, 'schedule config', timeoutMs, authorizationHeaders),
  ]);

  const leadApiUrl = extractRuntimeUrl(leadConfig, 'ZVENFIT_LEAD_API');
  const scheduleApiUrl = extractRuntimeUrl(scheduleConfig, 'ZVENFIT_SCHEDULE_API');

  const leadApiOrigin = new URL(leadApiUrl).origin;
  if (leadApiOrigin !== origin) {
    const leadPreflight = await request(
      fetchImpl,
      leadApiUrl,
      {
        method: 'OPTIONS',
        headers: {
          ...authorizationHeaders,
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      },
      timeoutMs,
    );
    assertOk(leadPreflight, 'lead API preflight');

    const allowedOrigin = leadPreflight.headers.get('access-control-allow-origin');
    if (allowedOrigin !== origin && allowedOrigin !== '*') {
      throw new Error(`smoke-production: lead API CORS allows ${allowedOrigin || 'nothing'} instead of ${origin}`);
    }
  }

  const scheduleResponse = await request(
    fetchImpl,
    scheduleApiUrl,
    { method: 'GET', headers: authorizationHeaders },
    timeoutMs,
  );
  assertOk(scheduleResponse, 'schedule API');

  const schedulePayload = await scheduleResponse.json();
  if (!schedulePayload || typeof schedulePayload !== 'object') {
    throw new Error('smoke-production: schedule API did not return JSON data');
  }

  log(`smoke-production: site pages and runtime configs are available at ${origin}`);
  if (basicAuth) {
    log('smoke-production: unauthenticated staging access is rejected with an HTTP Basic challenge');
  }
  log(
    leadApiOrigin === origin
      ? 'smoke-production: lead API is same-origin and no lead was created'
      : 'smoke-production: lead API preflight and CORS are healthy (no lead was created)',
  );
  log('smoke-production: schedule API returned JSON successfully');

  return { origin, leadApiUrl, scheduleApiUrl };
}

function readSiteArgument(argv) {
  const siteIndex = argv.indexOf('--site');

  if (siteIndex === -1) {
    return process.env.SITE_URL || DEFAULT_SITE_URL;
  }
  if (!argv[siteIndex + 1]) {
    throw new Error('smoke-production: --site requires a URL');
  }

  return argv[siteIndex + 1];
}

function readBasicAuth(environment = process.env) {
  const username = environment.STAGING_BASIC_AUTH_USERNAME || '';
  const password = environment.STAGING_BASIC_AUTH_PASSWORD || '';

  if (!username && !password) {
    return undefined;
  }
  if (!username || !password) {
    throw new Error('smoke-production: both staging Basic Auth credentials are required');
  }

  return { username, password };
}

if (require.main === module) {
  runSmoke({
    siteUrl: readSiteArgument(process.argv.slice(2)),
    basicAuth: readBasicAuth(),
  }).catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { extractRuntimeUrl, extractScriptUrl, normalizeSiteUrl, readBasicAuth, runSmoke };
