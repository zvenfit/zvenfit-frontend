'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { extractRuntimeUrl, runSmoke } = require('../smoke-production.cjs');

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[name.toLowerCase()] || null;
      },
    },
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
  };
}

test('extractRuntimeUrl rejects build placeholders', () => {
  assert.throws(
    () => extractRuntimeUrl("window.ZVENFIT_LEAD_API = '__LEAD_API_URL__';", 'ZVENFIT_LEAD_API'),
    /placeholder/,
  );
});

test('production smoke writes only a synthetic traffic event and never creates a lead', async () => {
  const requests = [];
  const routes = new Map([
    [
      'https://zvenfit.ru/forma-dlya-zayavki/',
      response(200, '<script src="/js/lead-config.js?v=42"></script><script src="/js/lead-form.js?v=42"></script><script src="/js/traffic-config.js?v=42"></script><script src="/js/traffic-beacon.js?v=42"></script>'),
    ],
    [
      'https://zvenfit.ru/raspisanie/',
      response(200, '<script src="/js/schedule-config.js?v=42"></script><script src="/js/schedule.js?v=42"></script>'),
    ],
    [
      'https://zvenfit.ru/js/lead-config.js?v=42',
      response(200, "window.ZVENFIT_LEAD_API = 'https://lead.example.test/';"),
    ],
    [
      'https://zvenfit.ru/js/schedule-config.js?v=42',
      response(200, "window.ZVENFIT_SCHEDULE_API = 'https://schedule.example.test/';"),
    ],
    [
      'https://zvenfit.ru/js/traffic-config.js?v=42',
      response(200, "window.ZVENFIT_TRAFFIC_API = 'https://traffic.example.test/';"),
    ],
    ['https://lead.example.test/', response(204, '', { 'access-control-allow-origin': 'https://zvenfit.ru' })],
    ['https://schedule.example.test/', response(200, '{"ok":true,"items":[]}')],
    ['https://traffic.example.test/', response(204, '')],
  ]);

  const result = await runSmoke({
    fetchImpl: async (url, options = {}) => {
      requests.push({ headers: options.headers || {}, method: options.method || 'GET', url });
      const route = routes.get(url);
      assert.ok(route, `unexpected request: ${options.method || 'GET'} ${url}`);

      return route;
    },
    log() {},
  });

  assert.equal(result.origin, 'https://zvenfit.ru');
  assert.deepEqual(
    requests.map(item => item.method),
    ['GET', 'GET', 'GET', 'GET', 'GET', 'OPTIONS', 'GET', 'POST'],
  );
  assert.equal(requests.filter(item => item.method === 'POST').length, 1);
  assert.ok(
    requests.every(item => item.headers['User-Agent'] === 'ZvenFit-Synthetic-Monitor/1.0'),
  );
});

test('authenticated same-origin staging probes both APIs without creating a lead', async () => {
  const requests = [];
  const origin = 'https://staging.zvenfit.ru';
  const routes = new Map([
    [`${origin}/`, response(401, '', { 'www-authenticate': 'Basic realm="ZvenFit staging"' })],
    [
      `${origin}/forma-dlya-zayavki/`,
      response(200, '<script src="/js/lead-config.js?v=7"></script><script src="/js/lead-form.js?v=7"></script><script src="/js/traffic-config.js?v=7"></script><script src="/js/traffic-beacon.js?v=7"></script>'),
    ],
    [
      `${origin}/raspisanie/`,
      response(200, '<script src="/js/schedule-config.js?v=7"></script><script src="/js/schedule.js?v=7"></script>'),
    ],
    [`${origin}/js/lead-config.js?v=7`, response(200, `window.ZVENFIT_LEAD_API = '${origin}/api/lead';`)],
    [`${origin}/js/schedule-config.js?v=7`, response(200, `window.ZVENFIT_SCHEDULE_API = '${origin}/api/schedule';`)],
    [`${origin}/js/traffic-config.js?v=7`, response(200, `window.ZVENFIT_TRAFFIC_API = '${origin}/api/traffic';`)],
    [`${origin}/api/lead`, response(400, '{"ok":false,"error":"invalid_name"}')],
    [`${origin}/api/schedule`, response(200, '{"ok":true,"items":[]}')],
    [`${origin}/api/traffic`, response(204, '')],
  ]);

  await runSmoke({
    siteUrl: origin,
    basicAuth: { username: 'qa', password: 'local-only-password' },
    fetchImpl: async (url, options = {}) => {
      requests.push({ method: options.method || 'GET', url, headers: options.headers || {} });
      if (url === `${origin}/` && options.headers?.Authorization) {
        return response(403, 'invalid credentials');
      }
      const route = routes.get(url);
      assert.ok(route, `unexpected request: ${options.method || 'GET'} ${url}`);
      return route;
    },
    log() {},
  });

  assert.equal(requests.length, 10);
  assert.deepEqual(
    requests.map(item => item.method),
    ['GET', 'GET', 'GET', 'GET', 'GET', 'GET', 'GET', 'POST', 'GET', 'POST'],
  );
  assert.equal(requests[0].headers.Authorization, undefined);
  assert.match(requests[1].headers.Authorization, /^Basic /);
  assert.ok(requests.slice(2).every(item => /^Basic /.test(item.headers.Authorization)));
  assert.equal(requests[7].headers['Content-Type'], 'application/json');
  assert.equal(requests[9].headers['Content-Type'], 'text/plain;charset=UTF-8');
});

test('authenticated staging smoke fails if the anonymous boundary is open', async () => {
  await assert.rejects(
    () =>
      runSmoke({
        siteUrl: 'https://staging.zvenfit.ru',
        basicAuth: { username: 'qa', password: 'local-only-password' },
        fetchImpl: async () => response(200, 'public'),
        log() {},
      }),
    /expected 401/,
  );
});

test('authenticated staging smoke fails if incorrect credentials are accepted', async () => {
  let call = 0;
  await assert.rejects(
    () =>
      runSmoke({
        siteUrl: 'https://staging.zvenfit.ru',
        basicAuth: { username: 'qa', password: 'local-only-password' },
        fetchImpl: async () => {
          call += 1;
          return call === 1
            ? response(401, '', { 'www-authenticate': 'Basic realm="ZvenFit staging"' })
            : response(200, 'incorrect credentials accepted');
        },
        log() {},
      }),
    /invalid staging credentials returned 200/,
  );
});

test('smoke rejects a syntactically valid but unusable schedule payload', async () => {
  const routes = new Map([
    [
      'https://zvenfit.ru/forma-dlya-zayavki/',
      response(200, '<script src="/js/lead-config.js"></script><script src="/js/lead-form.js"></script><script src="/js/traffic-config.js"></script><script src="/js/traffic-beacon.js"></script>'),
    ],
    [
      'https://zvenfit.ru/raspisanie/',
      response(200, '<script src="/js/schedule-config.js"></script><script src="/js/schedule.js"></script>'),
    ],
    ['https://zvenfit.ru/js/lead-config.js', response(200, "window.ZVENFIT_LEAD_API = 'https://lead.test/';")],
    [
      'https://zvenfit.ru/js/schedule-config.js',
      response(200, "window.ZVENFIT_SCHEDULE_API = 'https://schedule.test/';"),
    ],
    [
      'https://zvenfit.ru/js/traffic-config.js',
      response(200, "window.ZVENFIT_TRAFFIC_API = 'https://traffic.test/';"),
    ],
    ['https://lead.test/', response(204, '', { 'access-control-allow-origin': 'https://zvenfit.ru' })],
    ['https://schedule.test/', response(200, '{"error":"fixture_failed"}')],
  ]);

  await assert.rejects(
    () => runSmoke({ fetchImpl: async url => routes.get(url), log() {} }),
    /must return \{ ok: true, items: \[\] \}/,
  );
});
