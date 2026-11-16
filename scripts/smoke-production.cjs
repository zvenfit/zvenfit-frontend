'use strict';

const DEFAULT_SITE_URL = 'https://zvenfit.ru';
const DEFAULT_TIMEOUT_MS = 15_000;
// A request that never produced a response (lost TCP handshake, reset, timeout)
// is repeated on a fresh connection. HTTP responses are never retried.
const DEFAULT_CONNECT_ATTEMPTS = 8;
const DEFAULT_RETRY_DELAY_MS = 500;
const SYNTHETIC_USER_AGENT = 'ZvenFit-Synthetic-Monitor/1.0';

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

function describeFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : undefined;
  const code = cause && typeof cause === 'object' && cause.code ? String(cause.code) : '';
  const causeMessage = cause instanceof Error && cause.message ? cause.message : '';
  const details = [code, causeMessage].filter(Boolean).join(': ');

  return details ? `${message} (${details})` : message;
}

function wait(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function createTransport({ fetchImpl, timeoutMs, attempts, retryDelayMs, log }) {
  async function attemptOnce(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetchImpl(url, {
        redirect: 'follow',
        ...options,
        headers: {
          'User-Agent': SYNTHETIC_USER_AGENT,
          ...options.headers,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async request(url, options = {}) {
      let lastFailure = '';

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          return await attemptOnce(url, options);
        } catch (error) {
          lastFailure = describeFailure(error);
          if (attempt < attempts) {
            log(
              `smoke-production: attempt ${attempt}/${attempts} for ${url} got no response (${lastFailure}); retrying on a new connection`,
            );
            await wait(retryDelayMs);
          }
        }
      }

      throw new Error(`smoke-production: request failed for ${url} after ${attempts} attempts: ${lastFailure}`);
    },
  };
}

function assertOk(response, label) {
  if (!response.ok) {
    throw new Error(`smoke-production: ${label} returned HTTP ${response.status}`);
  }
}

async function assertBasicAuthBoundary(transport, origin) {
  const response = await transport.request(`${origin}/`, { headers: { 'Cache-Control': 'no-cache' } });

  if (response.status !== 401) {
    throw new Error(`smoke-production: unauthenticated staging returned ${response.status}, expected 401`);
  }

  const challenge = response.headers.get('www-authenticate') || '';
  if (!/^Basic(?:\s|$)/i.test(challenge)) {
    throw new Error('smoke-production: staging 401 is missing the HTTP Basic challenge');
  }

  const wrongCredentials = Buffer.from('zvenfit-smoke:deliberately-wrong-credentials').toString('base64');
  const wrongResponse = await transport.request(`${origin}/`, {
    headers: {
      Authorization: `Basic ${wrongCredentials}`,
      'Cache-Control': 'no-cache',
    },
  });
  if (wrongResponse.status !== 403) {
    throw new Error(`smoke-production: invalid staging credentials returned ${wrongResponse.status}, expected 403`);
  }
}

async function fetchText(transport, url, label, headers = {}) {
  const response = await transport.request(url, { headers: { 'Cache-Control': 'no-cache', ...headers } });
  assertOk(response, label);

  return response.text();
}

async function runSmoke({
  siteUrl = DEFAULT_SITE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  connectAttempts = DEFAULT_CONNECT_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  fetchImpl = globalThis.fetch,
  log = console.log,
  basicAuth,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('smoke-production: this Node.js version does not provide fetch');
  }
  if (!Number.isInteger(connectAttempts) || connectAttempts < 1) {
    throw new Error('smoke-production: connectAttempts must be a positive integer');
  }

  const origin = normalizeSiteUrl(siteUrl);
  const transport = createTransport({ fetchImpl, timeoutMs, attempts: connectAttempts, retryDelayMs, log });
  const authorizationHeaders = basicAuth
    ? {
        Authorization: `Basic ${Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString('base64')}`,
      }
    : {};
  if (basicAuth) {
    await assertBasicAuthBoundary(transport, origin);
  }
  const leadPageUrl = `${origin}/forma-dlya-zayavki/`;
  const schedulePageUrl = `${origin}/raspisanie/`;

  const [leadPage, schedulePage] = await Promise.all([
    fetchText(transport, leadPageUrl, 'lead page', authorizationHeaders),
    fetchText(transport, schedulePageUrl, 'schedule page', authorizationHeaders),
  ]);

  extractScriptUrl(leadPage, 'lead-form.js', origin);
  extractScriptUrl(leadPage, 'traffic-beacon.js', origin);
  extractScriptUrl(schedulePage, 'schedule.js', origin);

  const leadConfigUrl = extractScriptUrl(leadPage, 'lead-config.js', origin);
  const scheduleConfigUrl = extractScriptUrl(schedulePage, 'schedule-config.js', origin);
  const trafficConfigUrl = extractScriptUrl(leadPage, 'traffic-config.js', origin);
  const [leadConfig, scheduleConfig, trafficConfig] = await Promise.all([
    fetchText(transport, leadConfigUrl, 'lead config', authorizationHeaders),
    fetchText(transport, scheduleConfigUrl, 'schedule config', authorizationHeaders),
    fetchText(transport, trafficConfigUrl, 'traffic config', authorizationHeaders),
  ]);

  const leadApiUrl = extractRuntimeUrl(leadConfig, 'ZVENFIT_LEAD_API');
  const scheduleApiUrl = extractRuntimeUrl(scheduleConfig, 'ZVENFIT_SCHEDULE_API');
  const trafficApiUrl = extractRuntimeUrl(trafficConfig, 'ZVENFIT_TRAFFIC_API');

  const leadApiOrigin = new URL(leadApiUrl).origin;
  if (leadApiOrigin === origin) {
    const leadValidation = await transport.request(leadApiUrl, {
      method: 'POST',
      headers: {
        ...authorizationHeaders,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (leadValidation.status !== 400) {
      throw new Error(
        `smoke-production: lead API validation probe returned HTTP ${leadValidation.status}, expected 400`,
      );
    }
    const leadPayload = await leadValidation.json();
    if (!leadPayload || leadPayload.ok !== false || typeof leadPayload.error !== 'string') {
      throw new Error('smoke-production: lead API validation probe returned an invalid error payload');
    }
  } else {
    const leadPreflight = await transport.request(leadApiUrl, {
      method: 'OPTIONS',
      headers: {
        ...authorizationHeaders,
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    assertOk(leadPreflight, 'lead API preflight');

    const allowedOrigin = leadPreflight.headers.get('access-control-allow-origin');
    if (allowedOrigin !== origin && allowedOrigin !== '*') {
      throw new Error(`smoke-production: lead API CORS allows ${allowedOrigin || 'nothing'} instead of ${origin}`);
    }
  }

  const scheduleResponse = await transport.request(scheduleApiUrl, { method: 'GET', headers: authorizationHeaders });
  assertOk(scheduleResponse, 'schedule API');

  const schedulePayload = await scheduleResponse.json();
  if (!schedulePayload || schedulePayload.ok !== true || !Array.isArray(schedulePayload.items)) {
    throw new Error('smoke-production: schedule API must return { ok: true, items: [] }');
  }

  const trafficResponse = await transport.request(trafficApiUrl, {
    method: 'POST',
    headers: {
      ...authorizationHeaders,
      Origin: origin,
      'Content-Type': 'text/plain;charset=UTF-8',
    },
    body: JSON.stringify({
      page_view_id: `smoke-${Date.now()}`,
      url: `${origin}/`,
      referrer: '',
      webdriver: true,
    }),
  });
  if (trafficResponse.status !== 204) {
    throw new Error(`smoke-production: traffic API returned HTTP ${trafficResponse.status}, expected 204`);
  }

  log(`smoke-production: site pages and runtime configs are available at ${origin}`);
  if (basicAuth) {
    log('smoke-production: missing credentials return 401 and invalid credentials return 403');
  }
  log(
    leadApiOrigin === origin
      ? 'smoke-production: same-origin lead API rejected an empty validation probe; no lead was created'
      : 'smoke-production: lead API preflight and CORS are healthy (no lead was created)',
  );
  log('smoke-production: schedule API returned JSON successfully');
  log('smoke-production: traffic API accepted a synthetic page view');

  return { origin, leadApiUrl, scheduleApiUrl, trafficApiUrl };
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
