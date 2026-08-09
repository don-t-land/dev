'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildArenaFlyObjects,
  isFinishCrossed
} = require('../public/flight-world-state.js');

test('arena fly objects are deterministic and remain inside the playable radius', () => {
  const first = buildArenaFlyObjects(829, 720);
  assert.deepEqual(first, buildArenaFlyObjects(829, 720));
  assert.equal(first.length, 7);
  assert.ok(first.some(object => object.type === 'hot-air-balloon'));
  assert.ok(first.some(object => object.type === 'balloon-airship'));
  for (const object of first) {
    assert.ok(Math.hypot(object.x, object.z) < 720);
    assert.ok(object.y >= 115 && object.y <= 270);
  }
});

test('arena fly objects choose only the selected balloon and airship assets', () => {
  const allowedByType = {
    'hot-air-balloon': new Set(['hot-air-balloon-a', 'hot-air-balloon-b', 'hot-air-balloon-c']),
    'balloon-airship': new Set(['airship-g', 'airship-h'])
  };
  const seen = new Set();

  for (let seed = 0; seed < 120; seed++) {
    for (const object of buildArenaFlyObjects(seed, 720)) {
      assert.ok(allowedByType[object.type].has(object.assetKey));
      seen.add(object.assetKey);
    }
  }

  assert.deepEqual([...seen].sort(), [
    'airship-g',
    'airship-h',
    'hot-air-balloon-a',
    'hot-air-balloon-b',
    'hot-air-balloon-c'
  ]);
});

test('finish crossing only triggers at or beyond the course length', () => {
  assert.equal(isFinishCrossed(-7499.99, 7500), false);
  assert.equal(isFinishCrossed(-7500, 7500), true);
  assert.equal(isFinishCrossed(-7600, 7500), true);
});
