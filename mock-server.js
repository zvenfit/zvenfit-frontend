const http = require('http');
const fs = require('fs');
const path = require('path');

const scheduleHandler = require('./functions/fitbase-schedule/index.js');

const PORT = 3000;
const rootDir = __dirname;
const scheduleFixturePath = path.join(rootDir, 'scripts', 'fixtures', 'schedule.mock.json');
const scheduleFixture = JSON.parse(fs.readFileSync(scheduleFixturePath, 'utf8'));

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.development');

const useFitbaseSchedule =
  Boolean(process.env.FITBASE_API_TOKEN) && process.env.USE_SCHEDULE_FIXTURE !== '1';

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

async function handleScheduleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  const from = requestUrl.searchParams.get('from') || scheduleFixture.from;
  const to = requestUrl.searchParams.get('to') || scheduleFixture.to;

  console.log(`\n📅 Schedule request: ${from} → ${to}`);

  if (useFitbaseSchedule) {
    const queryStringParameters = {};
    for (const [key, value] of requestUrl.searchParams.entries()) {
      queryStringParameters[key] = value;
    }

    try {
      const result = await scheduleHandler.handler({
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

  sendJson(res, 200, {
    ...scheduleFixture,
    from,
    to,
    count: scheduleFixture.items.length,
  });
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

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        console.log('\n📩 Получена заявка:');
        console.log(JSON.parse(body));
        console.log('---');

        sendJson(res, 200, { ok: true });
      });

      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  })
  .listen(PORT, () => {
    console.log(`🚀 Mock API сервер запущен: http://localhost:${PORT}`);
    console.log('  POST /          — lead form');
    if (useFitbaseSchedule) {
      console.log('  GET  /schedule  — Fitbase API (live)');
      console.log(`  domain: ${process.env.FITBASE_DOMAIN}`);
      if (process.env.FITBASE_CLUB_ID) {
        console.log(`  club: ${process.env.FITBASE_CLUB_ID}`);
      }
    } else {
      console.log('  GET  /schedule  — fixture (set FITBASE_API_TOKEN in .env.development for live data)');
    }
    console.log('');
  });
