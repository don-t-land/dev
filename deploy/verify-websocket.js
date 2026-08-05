'use strict';

const WebSocket = require('ws');

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('invalid PORT');
  process.exit(1);
}

const ws = new WebSocket(`ws://127.0.0.1:${port}`);
const timeout = setTimeout(() => {
  console.error('dontland-dev-websocket-timeout');
  ws.terminate();
  process.exit(1);
}, 5000);

timeout.unref();
ws.once('error', err => {
  clearTimeout(timeout);
  console.error(`dontland-dev-websocket-error: ${err.message}`);
  process.exit(1);
});
ws.once('open', () => ws.send(JSON.stringify({ t: 'hello' })));
ws.on('message', raw => {
  let message;
  try { message = JSON.parse(raw); } catch { return; }
  if (message.t !== 'hello' || typeof message.id !== 'string' || typeof message.token !== 'string') return;
  clearTimeout(timeout);
  console.log(`dontland-dev-websocket-ok url=ws://127.0.0.1:${port}`);
  ws.close(1000);
});
ws.once('close', code => {
  if (code !== 1000) process.exit(1);
});
