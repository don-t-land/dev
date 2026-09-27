const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const modulePath = '../public/waiting-room-state.js';

function makeRoom(overrides = {}) {
  return {
    phase: 'waiting',
    mode: 'ARENA',
    hostId: 'host',
    players: [
      { id: 'host', name: '방장', ready: true },
      { id: 'guest', name: '참가자', ready: false }
    ],
    ...overrides
  };
}

test('CommonJS에서 전체 대기실 selector API를 노출한다', () => {
  const policy = require(modulePath);

  assert.deepEqual(Object.keys(policy).sort(), [
    'areAllPlayersReady',
    'canStart',
    'getLocalReady',
    'getWaitingRole',
    'getWaitingSlots'
  ]);
});

test('현재 플레이어의 방장, 참가자, 빈 역할을 구분한다', () => {
  const { getWaitingRole } = require(modulePath);
  const room = makeRoom();

  assert.equal(getWaitingRole(room, 'host'), 'host');
  assert.equal(getWaitingRole(room, 'guest'), 'client');
  assert.equal(getWaitingRole(room, 'missing'), 'empty');
  assert.equal(getWaitingRole(null, 'host'), 'empty');
});

test('플레이어를 순서대로 배치하고 나머지를 비운 고정 4개 슬롯을 만든다', () => {
  const { getWaitingSlots } = require(modulePath);
  const room = makeRoom();
  const slots = getWaitingSlots(room);

  assert.equal(slots.length, 4);
  assert.deepEqual(slots, [
    { index: 0, player: room.players[0], role: 'host', ready: true },
    { index: 1, player: room.players[1], role: 'client', ready: false },
    { index: 2, player: null, role: 'empty', ready: false },
    { index: 3, player: null, role: 'empty', ready: false }
  ]);
});

test('슬롯 수 인자를 존중하며 넘치는 플레이어는 슬롯에 포함하지 않는다', () => {
  const { getWaitingSlots } = require(modulePath);
  const room = makeRoom({
    players: [
      { id: 'host', ready: true },
      { id: 'one', ready: true },
      { id: 'two', ready: true }
    ]
  });

  assert.deepEqual(getWaitingSlots(room, 2).map(slot => slot.player.id), ['host', 'one']);
});

test('한 명 이상이고 모든 플레이어가 준비한 경우만 전체 준비 상태다', () => {
  const { areAllPlayersReady } = require(modulePath);

  assert.equal(areAllPlayersReady(makeRoom()), false);
  assert.equal(areAllPlayersReady(makeRoom({ players: [{ id: 'host', ready: true }] })), true);
  assert.equal(areAllPlayersReady(makeRoom({ players: [] })), false);
  assert.equal(areAllPlayersReady({ players: null }), false);
});

test('대기 단계의 준비 완료된 방에서 방장만 시작할 수 있다', () => {
  const { canStart } = require(modulePath);
  const readyRoom = makeRoom({
    players: [
      { id: 'host', ready: true },
      { id: 'guest', ready: true }
    ]
  });

  assert.equal(canStart(readyRoom, 'host'), true);
  assert.equal(canStart(readyRoom, 'guest'), false);
  assert.equal(canStart({ ...readyRoom, phase: 'playing' }, 'host'), false);
  assert.equal(canStart(makeRoom(), 'host'), false);
  assert.equal(canStart(makeRoom({ players: [] }), 'host'), false);
});

test('DIST 방도 ARENA와 동일하게 모두 READY 후 방장만 시작할 수 있다', () => {
  const { canStart } = require(modulePath);
  const distanceRoom = makeRoom({ mode: 'DIST' });

  assert.equal(canStart(distanceRoom, 'host'), false);
  assert.equal(canStart(distanceRoom, 'guest'), false);
  assert.equal(canStart({ ...distanceRoom, phase: 'playing' }, 'host'), false);
  assert.equal(canStart({
    ...distanceRoom,
    players: distanceRoom.players.map(player => ({ ...player, ready: true }))
  }, 'host'), true);
});

test('로컬 플레이어의 준비 여부를 불리언으로 반환한다', () => {
  const { getLocalReady } = require(modulePath);
  const room = makeRoom();

  assert.equal(getLocalReady(room, 'host'), true);
  assert.equal(getLocalReady(room, 'guest'), false);
  assert.equal(getLocalReady(room, 'missing'), false);
  assert.equal(getLocalReady(undefined, 'host'), false);
});

test('selector 호출은 room과 players를 변경하지 않는다', () => {
  const policy = require(modulePath);
  const room = makeRoom();
  const before = structuredClone(room);
  Object.freeze(room.players[0]);
  Object.freeze(room.players[1]);
  Object.freeze(room.players);
  Object.freeze(room);

  policy.getWaitingRole(room, 'host');
  policy.getWaitingSlots(room);
  policy.areAllPlayersReady(room);
  policy.canStart(room, 'host');
  policy.getLocalReady(room, 'guest');

  assert.deepEqual(room, before);
});

test('브라우저에서는 waitingRoomStatePolicy 전역으로 같은 API를 노출한다', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'waiting-room-state.js'), 'utf8');
  const context = {};
  vm.runInNewContext(source, context);

  assert.equal(typeof context.waitingRoomStatePolicy.getWaitingSlots, 'function');
  assert.equal(context.waitingRoomStatePolicy.getWaitingRole(makeRoom(), 'host'), 'host');
});
