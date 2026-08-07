const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { after, before, test } = require('node:test');
const WebSocket = require('ws');
process.env.FOLDING_MS = '500';
process.env.FOLD_SUBMISSION_GRACE_MS = '100';
process.env.LAUNCH_MS = '80';
process.env.RECONNECT_GRACE_MS = '250';
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

test('health endpoint reports readiness', async () => {
  const response = await request('/healthz');
  assert.equal(response.status, 200);
  assert.match(response.contentType, /^application\/json/);
  assert.deepEqual(JSON.parse(response.body), { status: 'ok', release: 'development' });
});

test('root serves the multiplayer client', async () => {
  const response = await request('/');
  assert.equal(response.status, 200);
  assert.match(response.contentType, /^text\/html/);
  assert.match(response.body, /종이비행기 온라인/);
});

test('production folding time defaults to two minutes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /process\.env\.FOLDING_MS \|\| 120_000/);
  assert.match(source, /:\s*120_000;/);
});

test('a public room can be created and discovered before joining', async () => {
  const creator = await connectClient();
  const browser = await connectClient();
  try {
    const hello = await establishSession(creator, '방장');
    creator.send({ t: 'create', mode: 'DIST', visibility: 'public' });
    const room = await creator.next(message => message.t === 'room');

    assert.equal(room.mode, 'DIST');
    assert.equal(room.visibility, 'public');
    assert.equal(room.hostId, hello.id);
    assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);

    browser.send({ t: 'list' });
    const listing = await browser.next(message => message.t === 'rooms');
    assert.deepEqual(listing.rooms.map(item => item.code), [room.code]);
    assert.equal(listing.rooms[0].players, 1);
    assert.equal(listing.rooms[0].hostName, '방장');
  } finally {
    await Promise.all([creator.close(), browser.close()]);
  }
});

test('room-list broadcasts are bounded during mutation bursts', async () => {
  const creator = await connectClient();
  const browser = await connectClient();
  try {
    await establishSession(creator, '방장');
    browser.send({ t: 'list' });
    await browser.next(message => message.t === 'rooms');

    creator.send({ t: 'create', mode: 'DIST', visibility: 'public' });
    const room = await creator.next(message => message.t === 'room');
    await browser.next(message => message.t === 'rooms' &&
      message.rooms.some(item => item.code === room.code));
    browser.takeAll(message => message.t === 'rooms');

    for (let index = 0; index < 20; index++) {
      creator.send({ t: 'rename', name: `방장${index}` });
    }
    await new Promise(resolve => setTimeout(resolve, 350));
    const updates = browser.takeAll(message => message.t === 'rooms');
    assert.ok(updates.length <= 3, `received ${updates.length} room-list broadcasts`);
  } finally {
    await Promise.all([creator.close(), browser.close()]);
  }
});

test('direct room-list requests are cached and rate-limited per connection', async () => {
  const browser = await connectClient();
  try {
    browser.send({ t: 'list' });
    await browser.next(message => message.t === 'rooms');
    await new Promise(resolve => setTimeout(resolve, 1_050));
    browser.takeAll(message => message.t === 'rooms');

    for (let index = 0; index < 20; index++) browser.send({ t: 'list' });
    await new Promise(resolve => setTimeout(resolve, 150));
    const replies = browser.takeAll(message => message.t === 'rooms');
    assert.ok(replies.length <= 1, `received ${replies.length} direct room-list replies`);
  } finally {
    await browser.close();
  }
});

test('a private room stays unlisted and can only be joined by its code', async () => {
  const creator = await connectClient();
  const guest = await connectClient();
  const browser = await connectClient();
  try {
    await establishSession(creator, '초대방장');
    creator.send({ t: 'create', mode: 'ARENA', visibility: 'private' });
    const created = await creator.next(message => message.t === 'room');

    browser.send({ t: 'list' });
    const listing = await browser.next(message => message.t === 'rooms');
    assert.equal(listing.rooms.some(room => room.code === created.code), false);

    await establishSession(guest, '초대손님');
    guest.send({ t: 'join', code: 'AAAAAA' });
    const error = await guest.next(message => message.t === 'error');
    assert.equal(error.code, 'ROOM_NOT_FOUND');

    guest.send({ t: 'join', code: created.code.toLowerCase() });
    const joined = await guest.next(message => message.t === 'room');
    assert.equal(joined.code, created.code);
    assert.equal(joined.mode, 'ARENA');
    assert.equal(joined.players.length, 2);
  } finally {
    await Promise.all([creator.close(), guest.close(), browser.close()]);
  }
});

test('a distance room requires every player to be ready before its host starts folding', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  try {
    const hostHello = await establishSession(host, '방장');
    host.send({ t: 'create', mode: 'DIST', visibility: 'public' });
    const created = await host.next(message => message.t === 'room');
    assert.equal(created.maxPlayers, 4);
    assert.equal(created.players[0].ready, false);

    const guestHello = await establishSession(guest, '손님');
    guest.send({ t: 'join', code: created.code });
    const joined = await guest.next(message => message.t === 'room');
    assert.equal(joined.players.every(player => player.ready === false), true);

    guest.send({ t: 'start' });
    const denied = await guest.next(message => message.t === 'error');
    assert.equal(denied.code, 'NOT_HOST');

    host.send({ t: 'start' });
    const notReady = await host.next(message => message.t === 'error');
    assert.equal(notReady.code, 'NOT_ALL_READY');

    host.send({ t: 'ready', ready: true });
    await guest.next(message => message.t === 'room' &&
      message.players.find(player => player.id === hostHello.id)?.ready === true);
    guest.send({ t: 'ready', ready: true });
    const allReady = await host.next(message => message.t === 'room' &&
      message.players.every(player => player.ready));
    assert.equal(allReady.players.find(player => player.id === guestHello.id).ready, true);

    const requestedAt = Date.now();
    host.send({ t: 'start' });
    const [hostPhase, guestPhase] = await Promise.all([
      host.next(message => message.t === 'phase' && message.phase === 'folding'),
      guest.next(message => message.t === 'phase' && message.phase === 'folding')
    ]);
    assert.deepEqual(hostPhase.order, guestPhase.order);
    assert.equal(hostPhase.order.length, 2);
    assert.ok(hostPhase.ends - requestedAt >= 450);
    assert.ok(Number.isFinite(hostPhase.serverNow));
    assert.ok(hostPhase.ends - hostPhase.serverNow <= 500);
    assert.equal(hostPhase.duration, 500);

    // 자유각도 커맨드 형식: {start, end, angle}. 상단 절반을 180° 접는다.
    // Task 2: 프로필이 computeFoldedGeometry(3D) 기반이라 접힌 형상이
    // planformArea에 반영된다 — 절반을 겹치는 접기라 planformArea가 절반이 된다.
    const halfFold = JSON.stringify([{
      start: [-1, 0], end: [1, 0], angle: Math.PI
    }]);
    host.send({ t: 'fold_done', commands: halfFold });
    const oneDone = await guest.next(message => message.t === 'fold_status' && message.doneIds.length === 1);
    assert.deepEqual(oneDone.doneIds, [hostHello.id]);
    assert.equal(oneDone.total, 2);
    assert.equal(oneDone.profiles[hostHello.id].foldCount, 1);
    assert.ok(Math.abs(oneDone.profiles[hostHello.id].planformArea - 2) < 1e-6,
      `planformArea ${oneDone.profiles[hostHello.id].planformArea}`);

    guest.send({
      t: 'fold_done',
      commands: JSON.stringify([{ start: [0, 0], end: [0, 0], angle: Math.PI / 2 }])
    });
    const invalidFold = await guest.next(message => message.t === 'error');
    assert.equal(invalidFold.code, 'INVALID_FOLD');

    const allDoneAt = Date.now();
    guest.send({ t: 'fold_done', commands: '[]' });
    const allDoneStatus = await host.next(message => message.t === 'fold_status' && message.doneIds.length === 2);
    assert.deepEqual(new Set(allDoneStatus.doneIds), new Set([hostHello.id, guestHello.id]));
    assert.equal(allDoneStatus.total, 2);
    assert.equal(allDoneStatus.profiles[guestHello.id].foldCount, 0);

    const launch = await host.next(message => message.t === 'phase' && message.phase === 'launch');
    assert.ok(Date.now() - allDoneAt < 400, 'launch should start immediately after every fold is complete');
    assert.equal(launch.order.length, 2);
    assert.equal(launch.crafts.length, 2);
    assert.equal(launch.duration, 80);
    assert.equal(launch.crafts.find(craft => craft.id === hostHello.id).aeroProfile.foldCount, 1);
    assert.ok(Number.isFinite(launch.serverNow));
    assert.ok(launch.ends > Date.now());
    await host.next(message => message.t === 'phase' && message.phase === 'playing');
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test('a distance room uses the same ready and folding flow before its own map', async () => {
  const host = await connectClient();
  try {
    await establishSession(host, '거리방장');
    host.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    const created = await host.next(message => message.t === 'room');
    assert.equal(created.maxPlayers, 4);

    host.send({ t: 'start' });
    const notReady = await host.next(message => message.t === 'error');
    assert.equal(notReady.code, 'NOT_ALL_READY');

    host.send({ t: 'ready', ready: true });
    await host.next(message => message.t === 'room' && message.players[0].ready === true);
    host.send({ t: 'start' });
    const folding = await host.next(message => message.t === 'phase' && message.phase === 'folding');
    assert.deepEqual(folding.order, [created.hostId]);
  } finally {
    await host.close();
  }
});

test('a final fold submitted just after the visible deadline is preserved for launch', async () => {
  const host = await connectClient();
  try {
    const hello = await establishSession(host, '마감제출');
    host.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    await host.next(message => message.t === 'room');
    host.send({ t: 'ready', ready: true });
    await host.next(message => message.t === 'room' && message.players[0].ready);
    host.send({ t: 'start' });
    const folding = await host.next(message => message.t === 'phase' && message.phase === 'folding');
    const waitMs = Math.max(0, folding.ends - Date.now() + 25);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    host.send({
      t: 'fold_done',
      commands: JSON.stringify([{ start: [-1, 0], end: [1, 0], angle: Math.PI }])
    });
    const launch = await host.next(message => message.t === 'phase' && message.phase === 'launch');
    const craft = launch.crafts.find(item => item.id === hello.id);
    assert.ok(Math.abs(craft.aeroProfile.planformArea - 2) < 1e-6,
      `planformArea ${craft.aeroProfile.planformArea}`);
  } finally {
    await host.close();
  }
});

test('leaving during folding removes the player and immediately launches when survivors are done', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  try {
    const hostHello = await establishSession(host, '잔류방장');
    await establishSession(guest, '이탈손님');
    host.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    const created = await host.next(message => message.t === 'room');
    guest.send({ t: 'join', code: created.code });
    await host.next(message => message.t === 'room' && message.players.length === 2);
    host.send({ t: 'ready', ready: true });
    guest.send({ t: 'ready', ready: true });
    await host.next(message => message.t === 'room' && message.players.every(player => player.ready));
    host.send({ t: 'start' });
    await host.next(message => message.t === 'phase' && message.phase === 'folding');
    host.send({ t: 'fold_done', commands: '[]' });
    await host.next(message => message.t === 'fold_status' && message.doneIds.length === 1);
    guest.send({ t: 'leave' });
    const launch = await host.next(
      message => message.t === 'phase' && message.phase === 'launch',
      400
    );
    assert.deepEqual(launch.order, [hostHello.id]);
    assert.deepEqual(launch.crafts.map(craft => craft.id), [hostHello.id]);
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test('disconnect grace expiry removes a folded player from playing order and crafts', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  try {
    const hostHello = await establishSession(host, '잔류완료자');
    const guestHello = await establishSession(guest, '단절완료자');
    host.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    const created = await host.next(message => message.t === 'room');
    guest.send({ t: 'join', code: created.code });
    await host.next(message => message.t === 'room' && message.players.length === 2);
    host.send({ t: 'ready', ready: true });
    guest.send({ t: 'ready', ready: true });
    await host.next(message => message.t === 'room' && message.players.every(player => player.ready));
    host.send({ t: 'start' });
    await host.next(message => message.t === 'phase' && message.phase === 'folding');

    guest.send({ t: 'fold_done', commands: '[]' });
    await host.next(message => message.t === 'fold_status' && message.doneIds.includes(guestHello.id));
    await guest.close();
    await host.next(message => message.t === 'room' && message.phase === 'folding' &&
      message.players.some(player => player.id === guestHello.id && player.connected === false));

    host.send({ t: 'fold_done', commands: '[]' });
    const launch = await host.next(message => message.t === 'phase' && message.phase === 'launch');
    assert.deepEqual(new Set(launch.order), new Set([hostHello.id, guestHello.id]));
    await host.next(message => message.t === 'phase' && message.phase === 'playing');

    const pruned = await host.next(message => message.t === 'room' && message.phase === 'playing' &&
      message.players.length === 1, 1_000);
    assert.deepEqual(pruned.order, [hostHello.id]);
    assert.deepEqual(pruned.crafts.map(craft => craft.id), [hostHello.id]);
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test('host ownership transfers when the host disconnects', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  try {
    await establishSession(host, '이전방장');
    host.send({ t: 'create', mode: 'DIST', visibility: 'public' });
    const created = await host.next(message => message.t === 'room');

    const guestHello = await establishSession(guest, '새방장');
    guest.send({ t: 'join', code: created.code });
    await guest.next(message => message.t === 'room');
    await host.close();

    const updated = await guest.next(message => message.t === 'room' && message.hostId === guestHello.id);
    assert.equal(updated.players.length, 1);

    guest.send({ t: 'ready', ready: true });
    await guest.next(message => message.t === 'room' && message.players[0].ready === true);
    guest.send({ t: 'start' });
    const phase = await guest.next(message => message.t === 'phase' && message.phase === 'folding');
    assert.deepEqual(phase.order, [guestHello.id]);
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test('playing rooms publish a server-authoritative live leaderboard', async () => {
  const host = await connectClient();
  try {
    const hello = await establishSession(host, '생존자');
    host.send({ t: 'create', mode: 'DIST', visibility: 'public' });
    await host.next(message => message.t === 'room');
    host.send({ t: 'ready', ready: true });
    await host.next(message => message.t === 'room' && message.players[0].ready === true);
    host.send({ t: 'start' });
    await host.next(message => message.t === 'phase' && message.phase === 'playing');

    const leaderboard = await host.next(message => message.t === 'leaderboard', 1500);
    assert.equal(leaderboard.rows[0].id, hello.id);
    assert.equal(leaderboard.rows[0].name, '생존자');
    assert.equal(leaderboard.rows[0].alive, true);
    assert.ok(leaderboard.rows[0].score >= 0);
  } finally {
    await host.close();
  }
});

test('round participants return to the waiting room only after individual acknowledgement', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  try {
    const hostHello = await establishSession(host, '확인방장');
    const guestHello = await establishSession(guest, '확인손님');
    host.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    const created = await host.next(message => message.t === 'room');
    guest.send({ t: 'join', code: created.code });
    await guest.next(message => message.t === 'room' && message.players.length === 2);
    host.takeAll(message => message.t === 'room');

    host.send({ t: 'ready', ready: true });
    guest.send({ t: 'ready', ready: true });
    await host.next(message => message.t === 'room' && message.players.every(player => player.ready));
    host.takeAll(message => message.t === 'room');
    host.send({ t: 'start' });
    await guest.next(message => message.t === 'phase' && message.phase === 'playing', 5_000);
    guest.send({ t: 'crash' });
    host.send({ t: 'crash' });
    await host.next(message => message.t === 'phase' && message.phase === 'results');

    host.send({ t: 'results-ready' });
    const hostReady = await host.next(message => message.t === 'room' && message.phase === 'results' &&
      Array.isArray(message.readyIds) && message.readyIds.includes(hostHello.id));
    assert.deepEqual(hostReady.readyIds, [hostHello.id]);

    host.send({ t: 'results-ready' });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(host.takeAll(message => message.t === 'room' && message.phase === 'results').length, 0,
      'duplicate acknowledgement must not broadcast another room snapshot');

    guest.send({ t: 'results-ready' });
    const [hostWaiting, guestWaiting] = await Promise.all([
      host.next(message => message.t === 'room' && message.phase === 'waiting'),
      guest.next(message => message.t === 'room' && message.phase === 'waiting')
    ]);
    assert.equal(hostWaiting.results.length, 0);
    assert.equal(guestWaiting.results.length, 0);
    assert.deepEqual(hostWaiting.readyIds, []);
    assert.deepEqual(guestWaiting.readyIds, []);
    assert.deepEqual(hostWaiting.order, []);
    assert.equal(hostWaiting.players.every(player => player.ready === false), true);
    assert.equal(hostWaiting.players.every(player => player.alive === false), true);
    assert.deepEqual(new Set(hostWaiting.players.map(player => player.id)), new Set([hostHello.id, guestHello.id]));
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test('disconnecting an unacknowledged participant releases the remaining ready player', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  try {
    const hostHello = await establishSession(host, '남은방장');
    await establishSession(guest, '연결종료손님');
    host.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    const created = await host.next(message => message.t === 'room');
    guest.send({ t: 'join', code: created.code });
    await guest.next(message => message.t === 'room' && message.players.length === 2);
    host.takeAll(message => message.t === 'room');

    host.send({ t: 'ready', ready: true });
    guest.send({ t: 'ready', ready: true });
    await host.next(message => message.t === 'room' && message.players.every(player => player.ready));
    host.takeAll(message => message.t === 'room');
    host.send({ t: 'start' });
    await guest.next(message => message.t === 'phase' && message.phase === 'playing', 5_000);
    guest.send({ t: 'crash' });
    host.send({ t: 'crash' });
    await host.next(message => message.t === 'phase' && message.phase === 'results');
    host.send({ t: 'results-ready' });
    await host.next(message => message.t === 'room' && message.phase === 'results' &&
      message.readyIds.includes(hostHello.id));

    await guest.close();
    const waiting = await host.next(message => message.t === 'room' && message.phase === 'waiting' &&
      message.players.length === 1, 1_500);
    assert.deepEqual(waiting.players.map(player => player.id), [hostHello.id]);
    assert.deepEqual(waiting.readyIds, []);
    assert.equal(waiting.players[0].ready, false);
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test('started rooms reject joins and reset readiness after result acknowledgements', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  const lateJoiner = await connectClient();
  try {
    await establishSession(host, '결과방장');
    await establishSession(guest, '탈락자');
    host.send({ t: 'create', mode: 'DIST', visibility: 'public' });
    const created = await host.next(message => message.t === 'room');
    guest.send({ t: 'join', code: created.code });
    await guest.next(message => message.t === 'room' && message.players.length === 2);
    host.takeAll(message => message.t === 'room');

    host.send({ t: 'ready', ready: true });
    guest.send({ t: 'ready', ready: true });
    await host.next(message => message.t === 'room' && message.players.every(player => player.ready));
    host.takeAll(message => message.t === 'room');
    host.send({ t: 'start' });
    await guest.next(message => message.t === 'phase' && message.phase === 'playing');

    await establishSession(lateJoiner, '늦은참가자');
    lateJoiner.send({ t: 'list' });
    const listing = await lateJoiner.next(message => message.t === 'rooms');
    assert.equal(listing.rooms.find(room => room.code === created.code).joinable, false);
    lateJoiner.send({ t: 'join', code: created.code });
    const denied = await lateJoiner.next(message => message.t === 'error');
    assert.equal(denied.code, 'ROOM_NOT_JOINABLE');

    guest.send({ t: 'crash' });
    host.send({ t: 'crash' });
    const finished = await host.next(message => message.t === 'phase' && message.phase === 'results');
    assert.equal(finished.results.length, 2);

    host.send({ t: 'results-ready' });
    guest.send({ t: 'results-ready' });
    const waiting = await host.next(message => message.t === 'room' && message.phase === 'waiting', 1_500);
    assert.equal(waiting.players.every(player => player.ready === false), true);
    assert.equal(waiting.players.every(player => player.alive === false), true);
    assert.deepEqual(waiting.order, []);
    assert.deepEqual(waiting.results, []);
    assert.deepEqual(waiting.readyIds, []);
  } finally {
    await Promise.all([host.close(), guest.close(), lateJoiner.close()]);
  }
});

test('a player can leave a room without disconnecting', async () => {
  const host = await connectClient();
  try {
    await establishSession(host, '나가기');
    host.send({ t: 'create', mode: 'DIST', visibility: 'public' });
    const created = await host.next(message => message.t === 'room');

    host.send({ t: 'leave' });
    await host.next(message => message.t === 'left');
    host.send({ t: 'list' });
    const listing = await host.next(message =>
      message.t === 'rooms' && !message.rooms.some(room => room.code === created.code));
    assert.equal(listing.rooms.some(room => room.code === created.code), false);
    assert.equal(host.socket.readyState, WebSocket.OPEN);
  } finally {
    await host.close();
  }
});

test('a lobby player can rename before joining a room', async () => {
  const player = await connectClient();
  try {
    await establishSession(player, '이전이름');
    player.send({ t: 'rename', name: '새이름' });
    player.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    const room = await player.next(message => message.t === 'room');
    assert.equal(room.players[0].name, '새이름');
  } finally {
    await player.close();
  }
});

test('costumes are validated and synchronized to every player in a room', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  try {
    host.send({ t: 'hello', name: '산타', costume: { hat: 'santa', nose: 'rudolph' } });
    const hostHello = await host.next(message => message.t === 'hello');
    host.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    const created = await host.next(message => message.t === 'room');
    assert.deepEqual(created.players[0].costume, { hat: 'santa', nose: 'rudolph' });

    guest.send({ t: 'hello', name: '마술사', costume: { hat: 'magic', nose: 'none' } });
    const guestHello = await guest.next(message => message.t === 'hello');
    guest.send({ t: 'join', code: created.code });
    const joined = await host.next(message => message.t === 'room' && message.players.length === 2);
    assert.deepEqual(joined.players.find(player => player.id === guestHello.id).costume, {
      hat: 'magic', nose: 'none'
    });

    guest.send({ t: 'costume', costume: { hat: '<script>', nose: 'rudolph' } });
    const updated = await host.next(message => message.t === 'room' &&
      message.players.find(player => player.id === guestHello.id)?.costume?.nose === 'rudolph');
    assert.deepEqual(updated.players.find(player => player.id === guestHello.id).costume, {
      hat: 'none', nose: 'rudolph'
    });
    assert.equal(updated.players.find(player => player.id === hostHello.id).costume.hat, 'santa');
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test('a distance room rejects the fifth player', async () => {
  const clients = await Promise.all(Array.from({ length: 5 }, () => connectClient()));
  try {
    await Promise.all(clients.map((client, index) => establishSession(client, `조종사${index + 1}`)));
    clients[0].send({ t: 'create', mode: 'DIST', visibility: 'public' });
    const room = await clients[0].next(message => message.t === 'room');
    assert.equal(room.maxPlayers, 4);

    for (let index = 1; index < 4; index++) {
      clients[index].send({ t: 'join', code: room.code });
      await clients[index].next(message => message.t === 'room' && message.players.length >= index + 1);
    }

    clients[4].send({ t: 'join', code: room.code });
    const denied = await clients[4].next(message => message.t === 'error');
    assert.equal(denied.code, 'ROOM_FULL');
  } finally {
    await Promise.all(clients.map(client => client.close()));
  }
});

test('an arena room rejects the ninth player', async () => {
  const clients = await Promise.all(Array.from({ length: 9 }, () => connectClient()));
  try {
    await Promise.all(clients.map((client, index) => establishSession(client, `아레나${index + 1}`)));
    clients[0].send({ t: 'create', mode: 'ARENA', visibility: 'public' });
    const room = await clients[0].next(message => message.t === 'room');
    assert.equal(room.maxPlayers, 8);
    assert.equal(room.phase, 'live');

    for (let index = 1; index < 8; index++) {
      clients[index].send({ t: 'join', code: room.code });
      await clients[index].next(message => message.t === 'room' && message.players.length === index + 1);
    }

    clients[8].send({ t: 'join', code: room.code });
    const denied = await clients[8].next(message => message.t === 'error');
    assert.equal(denied.code, 'ROOM_FULL');
  } finally {
    await Promise.all(clients.map(client => client.close()));
  }
});

test('ready state resets when a player moves to another room', async () => {
  const player = await connectClient();
  try {
    await establishSession(player, '이동자');
    player.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    await player.next(message => message.t === 'room');
    player.send({ t: 'ready', ready: true });
    await player.next(message => message.t === 'room' && message.players[0].ready === true);

    player.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    const moved = await player.next(message => message.t === 'room');
    assert.equal(moved.players[0].ready, false);
  } finally {
    await player.close();
  }
});

test('active distance rooms block rename and resume the same player during the disconnect grace period', async () => {
  const host = await connectClient();
  const guest = await connectClient();
  let resumed;
  try {
    const hostHello = await establishSession(host, '고정방장');
    const guestHello = await establishSession(guest, '재접속자');
    host.send({ t: 'create', mode: 'DIST', visibility: 'private' });
    const created = await host.next(message => message.t === 'room');
    guest.send({ t: 'join', code: created.code });
    await guest.next(message => message.t === 'room' && message.players.length === 2);
    host.send({ t: 'ready', ready: true });
    guest.send({ t: 'ready', ready: true });
    await host.next(message => message.t === 'room' && message.players.every(player => player.ready));
    host.send({ t: 'start' });
    await guest.next(message => message.t === 'phase' && message.phase === 'folding');

    host.send({ t: 'rename', name: '경기중변경' });
    const renameDenied = await host.next(message => message.t === 'error');
    assert.equal(renameDenied.code, 'ROOM_NOT_WAITING');

    await guest.close();
    resumed = await connectClient();
    resumed.send({ t: 'hello', token: guestHello.token, name: '재접속자' });
    const resumedHello = await resumed.next(message => message.t === 'hello');
    assert.equal(resumedHello.id, guestHello.id);
    const resumedRoom = await resumed.next(message => message.t === 'room');
    assert.equal(resumedRoom.id, created.id);
    assert.equal(resumedRoom.phase, 'folding');
    assert.deepEqual(resumedRoom.order, [hostHello.id, guestHello.id]);
  } finally {
    await Promise.all([host.close(), guest.close(), resumed?.close()]);
  }
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

test('WebSocket clients exceeding 60 messages per second are rate-limited', async () => {
  const WebSocket = require('ws');
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  const closeCode = await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.once('error', reject);
    ws.once('open', () => {
      for (let i = 0; i < 61; i++) ws.send('{}');
    });
    ws.once('close', resolve);
  });
  assert.equal(closeCode, 1008);
});
