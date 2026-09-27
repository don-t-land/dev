'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TIME_PHASES,
  TIME_SEGMENT_SECONDS,
  startingTimeIndex,
  timeOfDayAt,
  buildArenaFlyObjects,
  isFinishCrossed
} = require('../public/flight-world-state.js');

test('a map seed deterministically starts at day, night, or dawn', () => {
  const seen = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const first = startingTimeIndex(seed);
    assert.equal(first, startingTimeIndex(seed));
    assert.ok(first >= 0 && first < TIME_PHASES.length);
    seen.add(TIME_PHASES[first].id);
  }
  assert.deepEqual([...seen].sort(), ['dawn', 'day', 'night']);
});

test('time of day advances smoothly into the next named phase', () => {
  const seed = 17;
  const start = timeOfDayAt(seed, 0);
  const middle = timeOfDayAt(seed, TIME_SEGMENT_SECONDS / 2);
  const next = timeOfDayAt(seed, TIME_SEGMENT_SECONDS);
  assert.equal(start.t, 0);
  assert.equal(middle.t, .5);
  assert.equal(next.from.id, start.to.id);
});

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

test('finish crossing only triggers at or beyond the course length', () => {
  assert.equal(isFinishCrossed(-7499.99, 7500), false);
  assert.equal(isFinishCrossed(-7500, 7500), true);
  assert.equal(isFinishCrossed(-7600, 7500), true);
});
