const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  createArenaMinimapFrame,
  drawArenaMinimap,
  projectArenaPoint
} = require('../public/arena-minimap.js');

test('ARENA minimap normalizes live world markers and excludes unavailable entities', () => {
  const frame = createArenaMinimapFrame({
    mode: 'ARENA',
    arenaRadius: 200,
    local: { x: 100, z: -50, yaw: Math.PI / 2, alive: true },
    players: [
      { id: 'live', x: -200, z: 0, alive: true, seen: true },
      { id: 'dead', x: 50, z: 50, alive: false, seen: true },
      { id: 'unseen', x: 20, z: 20, alive: true, seen: false }
    ],
    rings: [
      { x: 0, z: 200, taken: false },
      { x: 30, z: 30, taken: true }
    ],
    thermals: [{ x: -50, z: 100 }]
  });

  assert.equal(frame.visible, true);
  assert.deepEqual(frame.local, { x: 0.5, z: -0.25, yaw: Math.PI / 2, alive: true, outside: false });
  assert.deepEqual(frame.players, [
    { id: 'live', x: -1, z: 0, alive: true, seen: true, outside: false }
  ]);
  assert.deepEqual(frame.rings, [{ x: 0, z: 1, outside: false }]);
  assert.deepEqual(frame.thermals, [{ x: -0.25, z: 0.5, outside: false }]);
});

test('canvas renderer draws the arena boundary and every marker family', () => {
  const calls = [];
  const context = new Proxy({}, {
    get(target, property) {
      if (!(property in target)) target[property] = (...args) => calls.push([property, ...args]);
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
  const canvas = { width: 256, height: 256, getContext: () => context };
  const frame = {
    visible: true,
    local: { x: 0, z: 0, yaw: 0, alive: true },
    players: [{ id: 'p', x: 0.5, z: 0.25 }],
    rings: [{ x: -0.25, z: 0.5 }],
    thermals: [{ x: 0.3, z: -0.4 }]
  };

  assert.equal(drawArenaMinimap(canvas, frame), true);
  assert.ok(calls.some(([name]) => name === 'clearRect'));
  assert.ok(calls.filter(([name]) => name === 'arc').length >= 6);
  assert.ok(calls.filter(([name]) => name === 'fill').length >= 4);
  assert.equal(drawArenaMinimap(canvas, { visible: false }), false);
});

test('DIST mode disables the minimap and out-of-bounds points clamp to the arena rim', () => {
  assert.deepEqual(createArenaMinimapFrame({ mode: 'DIST', arenaRadius: 200 }), {
    visible: false,
    local: null,
    players: [],
    rings: [],
    thermals: []
  });
  const clamped = projectArenaPoint({ x: 400, z: -300 }, 200);
  assert.equal(clamped.outside, true);
  assert.ok(Math.abs(clamped.x - 0.8) < 1e-12);
  assert.ok(Math.abs(clamped.z + 0.6) < 1e-12);
});
