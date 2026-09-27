'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const WebSocket = require('ws');
const { getPresetCommands } = require('../public/paper-fold-model.js');
const { ARENA_R, buildArenaLayout } = require('../public/map-gen.js');
const { isArenaSpawnSafe } = require('../public/biomes/helpers.js');
const { httpServer, wss } = require('../server');

const DART_COMMANDS = JSON.stringify(getPresetCommands('dart'));

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
    next(predicate, timeout = 1000, label = 'WebSocket message') {
      const index = queued.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const waiterIndex = waiters.indexOf(waiter);
          if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
          reject(new Error(`timed out waiting for ${label}`));
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

function spawnPosition(message) {
  return Array.isArray(message.position)
    ? message.position
    : [Math.cos(message.angle) * 130, 130, Math.sin(message.angle) * 130];
}

async function createAndJoinLiveArena(hostName, guestName) {
  const host = await connectClient();
  const guest = await connectClient();
  const hostHello = await establishSession(host, hostName);
  host.send({ t: 'create', mode: 'ARENA', visibility: 'private' });
  const created = await host.next(message => message.t === 'room');
  const guestHello = await establishSession(guest, guestName);
  guest.send({ t: 'join', code: created.code });
  await guest.next(message => message.t === 'room' && message.players.length === 2);
  await host.next(message => message.t === 'room' && message.players.length === 2);
  return { host, guest, hostHello, guestHello, seed: created.seed };
}

test('live 방 접기 → fold_ok → 안전한 랜덤 위치 spawn → spawned 브로드캐스트', async () => {
  const { host, guest, guestHello, seed } = await createAndJoinLiveArena('방장', '손님');
  try {
    guest.send({ t: 'fold_done', commands: DART_COMMANDS });
    const foldOk = await guest.next(message => message.t === 'fold_ok');
    assert.equal(typeof foldOk.profile, 'object');

    guest.send({ t: 'spawn' });
    const [hostSpawned, guestSpawned] = await Promise.all([
      host.next(message => message.t === 'spawned' && message.id === guestHello.id),
      guest.next(message => message.t === 'spawned' && message.id === guestHello.id)
    ]);
    assert.equal(hostSpawned.name, '손님');
    assert.equal(typeof hostSpawned.angle, 'number');
    assert.equal(hostSpawned.position.length, 3);
    assert.ok(hostSpawned.position.every(Number.isFinite));
    assert.ok(isArenaSpawnSafe(
      buildArenaLayout(seed),
      { x: hostSpawned.position[0], y: hostSpawned.position[1], z: hostSpawned.position[2] },
      { radius: ARENA_R }
    ));
    assert.equal(typeof hostSpawned.profile, 'object');
    assert.equal(typeof hostSpawned.commands, 'string');
    assert.equal(hostSpawned.kills, 0);
    assert.deepEqual(guestSpawned, hostSpawned);
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test('spawn 가드: 미접기 FOLD_REQUIRED, 생존 중 ALREADY_ALIVE, 사망 직후 RESPAWN_COOLDOWN', async () => {
  const { host, guest } = await createAndJoinLiveArena('방장', '손님');
  try {
    guest.send({ t: 'spawn', requestId: 'fold-required-1' });
    const foldRequired = await guest.next(message => message.t === 'error');
    assert.equal(foldRequired.code, 'FOLD_REQUIRED');
    assert.equal(foldRequired.requestId, 'fold-required-1');

    guest.send({ t: 'fold_done', commands: DART_COMMANDS });
    await guest.next(message => message.t === 'fold_ok');
    guest.send({ t: 'spawn', requestId: 'spawn-ok-1' });
    const initialSpawn = await guest.next(message => message.t === 'spawned');
    assert.equal(initialSpawn.requestId, 'spawn-ok-1');

    guest.send({ t: 'spawn', requestId: 'already-alive-1' });
    const alreadyAlive = await guest.next(message => message.t === 'error');
    assert.equal(alreadyAlive.code, 'ALREADY_ALIVE');
    assert.equal(alreadyAlive.requestId, 'already-alive-1');

    guest.send({ t: 'crash' });
    await host.next(message => message.t === 'crashed');
    guest.send({ t: 'spawn', requestId: 'cooldown-1' });
    const cooldown = await guest.next(message => message.t === 'error');
    assert.equal(cooldown.code, 'RESPAWN_COOLDOWN');
    assert.equal(cooldown.requestId, 'cooldown-1');

    await new Promise(resolve => setTimeout(resolve, 2_100));
    guest.send({ t: 'spawn' });
    const respawned = await guest.next(message => message.t === 'spawned');
    assert.equal(respawned.kills, 0);
  } finally {
    await Promise.all([host.close(), guest.close()]);
  }
});

test('생존 중 재접속하면 사망 처리되어 재접기 후 스폰할 수 있다', async () => {
  const { host, guest, guestHello } = await createAndJoinLiveArena('방장', '손님');
  try {
    guest.send({ t: 'fold_done', commands: DART_COMMANDS });
    await guest.next(message => message.t === 'fold_ok');
    guest.send({ t: 'spawn' });
    await guest.next(message => message.t === 'spawned');

    // leave 없이 소켓만 끊고 같은 토큰으로 재접속합니다 (그레이스 구간 내).
    await guest.close();

    const resumed = await connectClient();
    try {
      resumed.send({ t: 'hello', token: guestHello.token, name: '손님' });
      const hello = await resumed.next(message => message.t === 'hello');
      assert.equal(hello.resumed, true);
      assert.equal(hello.id, guestHello.id);

      const resumeSnapshot = await resumed.next(message => message.t === 'room');
      const selfRow = resumeSnapshot.players.find(player => player.id === guestHello.id);
      assert.ok(selfRow, '재접속한 본인이 스냅샷에 있어야 한다');
      assert.equal(selfRow.alive, false);

      await host.next(message => message.t === 'crashed' && message.id === guestHello.id);

      resumed.send({ t: 'fold_done', commands: DART_COMMANDS });
      const foldOk = await resumed.next(message => message.t === 'fold_ok');
      assert.equal(typeof foldOk.profile, 'object');

      // 재접속 시점에 diedAt이 찍히므로 리스폰 쿨다운이 끝날 때까지 기다립니다.
      await new Promise(resolve => setTimeout(resolve, 2_100));

      resumed.send({ t: 'spawn' });
      const spawned = await resumed.next(message => message.t === 'spawned');
      assert.equal(spawned.id, guestHello.id);
    } finally {
      await resumed.close();
    }
  } finally {
    await host.close();
  }
});
