'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ARENA_RADIUS,
  SPAWN_CLEARANCE,
  createEnduranceMap,
  isSpawnCorridorClear,
} = require('../public/endurance-map');

function collectNumbers(value, into = []) {
  if (typeof value === 'number') into.push(value);
  else if (Array.isArray(value)) value.forEach(item => collectNumbers(item, into));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectNumbers(item, into));
  return into;
}

function macroLayout(map) {
  return {
    id: map.id,
    radius: map.radius,
    landmarks: map.landmarks,
    ridge: map.ridge,
    terraces: map.terraces,
    spires: map.spires,
    thermals: map.thermals,
    rings: map.rings,
  };
}

test('endurance map is a compact authored postal canyon with three readable landmarks', () => {
  const map = createEnduranceMap(1234);

  assert.equal(ARENA_RADIUS, 210);
  assert.equal(map.radius, ARENA_RADIUS);
  assert.equal(map.id, 'whitewind-post-canyon');
  assert.equal(map.name, '백풍 우편협곡');
  assert.deepEqual(
    map.landmarks.map(({ id, silhouette }) => [id, silhouette]),
    [
      ['wind-gate', 'twin-vertical'],
      ['cliff-post-office', 'low-horizontal'],
      ['white-needle', 'single-spire-ring'],
    ],
  );
  assert.equal(map.ridge.length, 9);
  assert.equal(map.terraces.length, 5);
});

test('macro composition is authored while seed only varies secondary dressing', () => {
  const first = createEnduranceMap(17);
  const same = createEnduranceMap(17);
  const other = createEnduranceMap(18);

  assert.deepEqual(first, same);
  assert.deepEqual(macroLayout(first), macroLayout(other));
  assert.notDeepEqual(first.dressing, other.dressing);
});

test('collidable obstacles leave the full launch and spawn annulus unobstructed', () => {
  const map = createEnduranceMap(99);

  assert.equal(SPAWN_CLEARANCE.minRadius, 108);
  assert.equal(SPAWN_CLEARANCE.maxRadius, 158);
  assert.ok(isSpawnCorridorClear(map));

  for (const obstacle of [...map.spires, ...map.rocks]) {
    const radius = Math.hypot(obstacle.x, obstacle.z);
    assert.ok(
      radius < SPAWN_CLEARANCE.minRadius || radius > SPAWN_CLEARANCE.maxRadius,
      `${obstacle.id} intrudes into the launch annulus at radius ${radius}`,
    );
  }
});

test('flight loop resources stay inside the compact arena and form distinct route roles', () => {
  const map = createEnduranceMap(404);
  const roles = new Set(map.thermals.map(item => item.role));

  assert.deepEqual(
    roles,
    new Set(['terrace-core', 'gate-lift', 'needle-spiral', 'ridge-lift', 'post-recovery']),
  );
  assert.equal(map.thermals.length, 5);
  assert.equal(map.rings.length, 6);

  for (const item of [...map.thermals, ...map.rings]) {
    assert.ok(Math.hypot(item.x, item.z) <= ARENA_RADIUS - 18, `${item.id} is outside the readable route`);
  }
});

test('descriptor values are finite and remain inside the rendering budget', () => {
  const map = createEnduranceMap(0xffffffff);
  const numbers = collectNumbers(map);

  assert.ok(numbers.length > 100);
  assert.ok(numbers.every(Number.isFinite));
  assert.ok(map.spires.length <= 12);
  assert.ok(map.rocks.length <= 18);
  assert.ok(map.dressing.routeMarkers.length <= 18);
  assert.ok(map.dressing.groundRocks.length <= 40);
  assert.ok(map.dressing.grassPatches.length <= 80);
  assert.ok(map.clouds.length <= 9);
});
