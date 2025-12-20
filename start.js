const http = require('http');

const port = process.env.API_PORT || 4000;
const host = process.env.API_HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const response = {
      ok: true,
      service: 'masterforge-api',
      time: new Date().toISOString(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}/`);
});