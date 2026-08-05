const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const { httpServer, wss } = require('../server');

let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise(resolve => wss.close(resolve));
  await new Promise(resolve => httpServer.close(resolve));
});

function request(path) {
  return new Promise((resolve, reject) => {
    http.get(baseUrl + path, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        contentType: res.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8')
      }));
    }).on('error', reject);
  });
}

test('health endpoint reports readiness', async () => {
  const response = await request('/healthz');
  assert.equal(response.status, 200);
  assert.match(response.contentType, /^application\/json/);
  assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
});

test('root serves the multiplayer client', async () => {
  const response = await request('/');
  assert.equal(response.status, 200);
  assert.match(response.contentType, /^text\/html/);
  assert.match(response.body, /종이비행기 온라인/);
});

test('malformed URL encoding is rejected without crashing', async () => {
  const response = await request('/%E0%A4%A');
  assert.equal(response.status, 400);
});

test('path traversal does not expose files outside public', async () => {
  const response = await request('/..%2Fserver.js');
  assert.equal(response.status, 403);
});

test('WebSocket payloads larger than 16 KiB are rejected', async () => {
  const WebSocket = require('ws');
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  const closeCode = await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.once('error', reject);
    ws.once('open', () => ws.send('x'.repeat(16 * 1024 + 1)));
    ws.once('close', resolve);
  });
  assert.equal(closeCode, 1009);
});
