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
