const http = require('http');

const PORT = 3000;

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();

      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        console.log('\n📩 Получена заявка:');
        console.log(JSON.parse(body));
        console.log('---');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });

      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  })
  .listen(PORT, () => {
    console.log(`🚀 Mock API сервер запущен: http://localhost:${PORT}`);
    console.log('Ожидаю заявки...\n');
  });
