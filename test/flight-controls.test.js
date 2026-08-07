const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  updateAttitude,
  updateFreeLook,
  keyGuideVisibleFromStorage,
  updateEnergy,
  consumeDartEnergy,
  dashAcceleration,
  speedFov,
  MAX_ENERGY,
  DART_ENERGY_COST
} = require('../public/flight-controls.js');

test('DIST keeps free pitch while its roll self-levels like ARENA', () => {
  const state = { yaw: 1.7, pitch: 1.2, roll: 0.8 };
  const next = updateAttitude(state, {}, 0.5, 'DIST');
  const arena = updateAttitude(state, {}, 0.5, 'ARENA');

  assert.ok(Math.abs(next.pitch - state.pitch) < 1e-9);
  assert.equal(next.roll, arena.roll);
  assert.ok(Math.abs(next.roll) < Math.abs(state.roll));
  assert.ok(next.yaw > state.yaw, 'bank angle should continue turning the aircraft');
});

test('DIST supports complete loops but uses the same roll limit as ARENA', () => {
  const state = { yaw: 0, pitch: -3.05, roll: 0.9 };
  const next = updateAttitude(state, { KeyW: true, KeyA: true }, 0.2, 'DIST');
  const arena = updateAttitude(state, { KeyW: true, KeyA: true }, 0.2, 'ARENA');

  assert.ok(next.pitch > 2.9, `pitch should wrap through -π, got ${next.pitch}`);
  assert.equal(next.roll, arena.roll);
  assert.equal(next.roll, 0.95);
});

test('ARENA keeps its existing assisted attitude limits without pulling yaw toward zero', () => {
  const state = { yaw: 0.4, pitch: 0.5, roll: 0 };
  const next = updateAttitude(state, {}, 0.5, 'ARENA');

  assert.ok(Math.abs(next.pitch + 0.09) < Math.abs(state.pitch + 0.09));
  assert.equal(next.roll, 0);
  assert.ok(Math.abs(next.yaw - state.yaw) < 1e-12);
  assert.ok(next.pitch >= -0.95 && next.pitch <= 0.75);
  assert.ok(next.roll >= -0.95 && next.roll <= 0.95);
});

test('DIST and ARENA apply identical roll dynamics for both input and release', () => {
  for (const keys of [{ KeyD: true }, {}]) {
    const state = { yaw: -0.4, pitch: 0.2, roll: -0.7 };
    const dist = updateAttitude(state, keys, 0.05, 'DIST');
    const arena = updateAttitude(state, keys, 0.05, 'ARENA');
    assert.equal(dist.roll, arena.roll);
  }
});

test('mouse free-look rotates continuously and clamps only the vertical view', () => {
  const first = updateFreeLook({ yaw: 0, pitch: 0 }, 900, -900);
  const second = updateFreeLook(first, 900, 900);

  assert.ok(first.yaw < 0);
  assert.equal(first.pitch, 1.35);
  assert.ok(second.yaw !== first.yaw);
  assert.ok(second.yaw >= -Math.PI && second.yaw <= Math.PI);
  assert.ok(second.pitch >= -1.35 && second.pitch <= 1.35);
});

test('the key guide is visible by default and can be persisted off', () => {
  assert.equal(keyGuideVisibleFromStorage(null), true);
  assert.equal(keyGuideVisibleFromStorage('1'), true);
  assert.equal(keyGuideVisibleFromStorage('0'), false);
});

test('energy regenerates normally and drains continuously while dash is held', () => {
  const recharged = updateEnergy(50, 0.1, false);
  assert.ok(recharged.energy > 50);
  assert.equal(recharged.dashRatio, 0);

  const dashing = updateEnergy(MAX_ENERGY, 0.1, true);
  assert.ok(dashing.energy < MAX_ENERGY);
  assert.equal(dashing.dashRatio, 1);

  const depleted = updateEnergy(1, 0.1, true);
  assert.equal(depleted.energy, 0);
  assert.ok(depleted.dashRatio > 0 && depleted.dashRatio < 1);
});

test('darts consume the shared energy pool and fail without enough energy', () => {
  const fired = consumeDartEnergy(DART_ENERGY_COST);
  assert.deepEqual(fired, { energy: 0, fired: true });
  assert.deepEqual(consumeDartEnergy(DART_ENERGY_COST - 1), {
    energy: DART_ENERGY_COST - 1,
    fired: false
  });
});

test('dash acceleration eases at high physical speeds and speed widens the camera FOV', () => {
  assert.ok(dashAcceleration(22) > dashAcceleration(60));
  assert.ok(speedFov(60, false) > speedFov(22, false));
  assert.ok(speedFov(60, true) > speedFov(60, false));
});
