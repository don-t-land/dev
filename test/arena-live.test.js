'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const WebSocket = require('ws');
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

async function connectClient() {
  const socket = new WebSocket(baseUrl.replace(/^http/, 'ws'));
  const queued = [];
  const waiters = [];
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    const index = waiters.findIndex(waiter => waiter.predicate(message));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      queued.push(message);
    }
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return {
    socket,
    send(message) { socket.send(JSON.stringify(message)); },
    takeAll(predicate = () => true) {
      const taken = [];
      for (let index = queued.length - 1; index >= 0; index--) {
        if (predicate(queued[index])) taken.unshift(...queued.splice(index, 1));
      }
      return taken;
    },
    next(predicate, timeout = 1000) {
      const index = queued.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const waiterIndex = waiters.indexOf(waiter);
          if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
          reject(new Error('timed out waiting for WebSocket message'));
        }, timeout);
        waiters.push(waiter);
      });
    },
    close() {
      if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
      return new Promise(resolve => {
        socket.once('close', resolve);
        socket.close();
      });
    }
  };
}

async function establishSession(client, name) {
  client.send({ t: 'hello', name });
  return client.next(message => message.t === 'hello');
}

test('ARENA 방은 생성 즉시 live 상태다', async () => {
  const host = await connectClient();
  try {
    await establishSession(host, '방장');
    host.send({ t: 'create', mode: 'ARENA', visibility: 'private' });
    const room = await host.next(message => message.t === 'room');

    assert.equal(room.phase, 'live');
    assert.equal(typeof room.seed, 'number');
    assert.notEqual(room.seed, 0);
    assert.equal(room.maxPlayers, 8);
  } finally {
    await host.close();
  }
});

test('진행 중인 ARENA live 방에 코드로 중도 참여할 수 있다', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  try {
    const hostHello = await establishSession(host, '방장A');
    host.send({ t: 'create', mode: 'ARENA', visibility: 'private' });
    const created = await host.next(message => message.t === 'room');
    assert.equal(created.phase, 'live');

    await establishSession(guest, '참가자B');
    guest.send({ t: 'join', code: created.code });
    const joined = await guest.next(message => message.t === 'room' || message.t === 'error');

    assert.equal(joined.t, 'room');
    assert.equal(joined.phase, 'live');
    assert.deepEqual(
      new Set(joined.players.map(player => player.id)),
      new Set([hostHello.id, joined.players.find(player => player.name === '참가자B').id])
    );
    assert.equal(joined.players.length, 2);
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test('ARENA 빠른 참가는 자리 있는 공개 live 방을 찾고 없으면 자동 생성한다', async () => {
  const player1 = await connectClient();
  const player2 = await connectClient();
  try {
    await establishSession(player1, '드롭인1');
    player1.send({ t: 'join', mode: 'ARENA' });
    const first = await player1.next(message => message.t === 'room');
    assert.equal(first.phase, 'live');
    assert.equal(first.players.length, 1);

    await establishSession(player2, '드롭인2');
    player2.send({ t: 'join', mode: 'ARENA' });
    const second = await player2.next(message => message.t === 'room');
    assert.equal(second.code, first.code);
    assert.equal(second.players.length, 2);
  } finally {
    await Promise.all([player1.close(), player2.close()]);
  }
});

test('ARENA live 방에서 start/ready/results-ready는 ARENA_LIVE 에러다', async () => {
  const host = await connectClient();
  try {
    await establishSession(host, '방장');
    host.send({ t: 'create', mode: 'ARENA', visibility: 'private' });
    await host.next(message => message.t === 'room');

    host.send({ t: 'start' });
    const startError = await host.next(message => message.t === 'error');
    assert.equal(startError.code, 'ARENA_LIVE');

    host.send({ t: 'ready', ready: true });
    const readyError = await host.next(message => message.t === 'error');
    assert.equal(readyError.code, 'ARENA_LIVE');

    host.send({ t: 'results-ready' });
    const resultsError = await host.next(message => message.t === 'error');
    assert.equal(resultsError.code, 'ARENA_LIVE');
  } finally {
    await host.close();
  }
});

test('room 목록에서 ARENA live 방은 인원 미만이면 joinable이다', async () => {
  const host = await connectClient();
  const browser = await connectClient();
  try {
    await establishSession(host, '방장');
    host.send({ t: 'create', mode: 'ARENA', visibility: 'public' });
    const created = await host.next(message => message.t === 'room');

    browser.send({ t: 'list' });
    const listing = await browser.next(message => message.t === 'rooms');
    const entry = listing.rooms.find(room => room.code === created.code);
    assert.ok(entry, 'created room should be listed');
    assert.equal(entry.phase, 'live');
    assert.equal(entry.joinable, true);
  } finally {
    await Promise.all([host.close(), browser.close()]);
  }
});
