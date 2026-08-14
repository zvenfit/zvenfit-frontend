const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 3000;
const rootDir = __dirname;

function loadEnvFile(filename) {
  const filepath = path.join(rootDir, filename);
  if (!fs.existsSync(filepath)) {
    return;
  }

  const content = fs.readFileSync(filepath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.development');

const localScheduleProvider = (process.env.SCHEDULE_PROVIDER || 'fixture').trim();
if (!['fitbase', 'fixture'].includes(localScheduleProvider)) {
  throw new Error('SCHEDULE_PROVIDER must be fitbase or fixture');
}

const useFitbaseSchedule = localScheduleProvider === 'fitbase';
const productionScheduleHandler = require('./functions/fitbase-schedule/build/index.js');
const stagingScheduleHandler = require('./functions/fitbase-schedule/build-staging/entrypoints/staging.js');

if (!process.env.FITBASE_DOMAIN) {
  process.env.FITBASE_DOMAIN = 'zvenfit';
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function sendHandlerResponse(res, result) {
  res.writeHead(result.statusCode, {
    'Content-Type': result.headers['Content-Type'] || 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(result.body);
}

function getMoscowDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(date);
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

async function handleScheduleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
  const from = requestUrl.searchParams.get('from') || getMoscowDateString();
  const to = requestUrl.searchParams.get('to') || addDays(from, 13);

  console.log(`\n📅 Schedule request: ${from} → ${to}`);

  if (useFitbaseSchedule) {
    const queryStringParameters = {};
    for (const [key, value] of requestUrl.searchParams.entries()) {
      queryStringParameters[key] = value;
    }

    try {
      const result = await productionScheduleHandler.handler({
        httpMethod: 'GET',
        headers: {
          origin: req.headers.origin || 'http://localhost:4173',
        },
        queryStringParameters,
      });

      let payload = null;
      try {
        payload = JSON.parse(result.body);
      } catch {
        payload = null;
      }

      if (payload?.ok) {
        console.log(`   Fitbase: ${payload.count ?? payload.items?.length ?? 0} items`);
        sendHandlerResponse(res, result);

        return;
      }

      console.log(`   Fitbase error: ${payload?.error || result.statusCode}, using fixture`);
    } catch (error) {
      console.error('   Fitbase request failed:', error.message);
    }
  }

  console.log('   Fixture mode (Fitbase unavailable)');
  const result = await stagingScheduleHandler.handler({
    httpMethod: 'GET',
    headers: { origin: req.headers.origin || 'http://localhost:4173' },
    queryStringParameters: { from, to },
  });
  sendHandlerResponse(res, result);
}

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();

      return;
    }

    if (req.method === 'GET' && (req.url === '/schedule' || req.url.startsWith('/schedule?'))) {
      handleScheduleRequest(req, res).catch(error => {
        console.error('Schedule handler failed:', error.message);
        sendJson(res, 500, { ok: false, error: 'server_error' });
      });

      return;
    }

    if (req.method === 'POST' && req.url === '/traffic') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          console.log('\n📈 Получен page view:');
          console.log({
            page_view_id: payload.page_view_id || 'missing',
            url: payload.url || 'missing',
            webdriver: payload.webdriver === true,
            user_agent: req.headers['user-agent'] || '',
          });
          console.log('---');
          res.writeHead(204);
          res.end();
        } catch {
          sendJson(res, 400, { ok: false, error: 'invalid_json' });
        }
      });

      return;
    }

    if (req.method === 'POST' && req.url === '/') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        const payload = JSON.parse(body);
        console.log('\n📩 Получена заявка:');
        console.log({
          submission_id: payload.submission_id || 'missing',
          service: payload.service || 'missing',
          has_name: Boolean(payload.name),
          has_phone: Boolean(payload.phone),
          has_utm: Boolean(payload.utm && Object.keys(payload.utm).length > 0),
        });
        console.log('---');

        sendJson(res, 200, { ok: true, lead_id: payload.submission_id || null, notification: 'mock' });
      });

      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  })
  .listen(PORT, HOST, () => {
    console.log(`🚀 Mock API сервер запущен: http://${HOST}:${PORT}`);
    console.log('  POST /          — lead form');
    console.log('  POST /traffic   — page-view log');
    if (useFitbaseSchedule) {
      console.log('  GET  /schedule  — Fitbase API (live)');
      console.log(`  domain: ${process.env.FITBASE_DOMAIN}`);
      if (process.env.FITBASE_CLUB_ID) {
        console.log(`  club: ${process.env.FITBASE_CLUB_ID}`);
      }
    } else {
      console.log('  GET  /schedule  — dynamic fixture (set SCHEDULE_PROVIDER=fitbase for live data)');
    }
    console.log('');
  });
