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

test('production smoke uses only read-only GET and OPTIONS requests', async () => {
  const requests = [];
  const routes = new Map([
    [
      'https://zvenfit.ru/forma-dlya-zayavki/',
      response(
        200,
        '<script src="/js/lead-config.js?v=42"></script><script src="/js/lead-form.js?v=42"></script>',
      ),
    ],
    [
      'https://zvenfit.ru/raspisanie/',
      response(
        200,
        '<script src="/js/schedule-config.js?v=42"></script><script src="/js/schedule.js?v=42"></script>',
      ),
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
      'https://lead.example.test/',
      response(204, '', { 'access-control-allow-origin': 'https://zvenfit.ru' }),
    ],
    ['https://schedule.example.test/', response(200, '{"events":[]}')],
  ]);

  const result = await runSmoke({
    fetchImpl: async (url, options = {}) => {
      requests.push({ method: options.method || 'GET', url });
      const route = routes.get(url);
      assert.ok(route, `unexpected request: ${options.method || 'GET'} ${url}`);

      return route;
    },
    log() {},
  });

  assert.equal(result.origin, 'https://zvenfit.ru');
  assert.deepEqual(
    requests.map(item => item.method),
    ['GET', 'GET', 'GET', 'GET', 'OPTIONS', 'GET'],
  );
  assert.ok(requests.every(item => item.method !== 'POST'));
});
