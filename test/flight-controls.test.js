const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  updateAttitude,
  updateFreeLook,
  keyGuideVisibleFromStorage,
  mouseInvertYFromStorage,
  updateEnergy,
  consumeDartEnergy,
  dashAcceleration,
  speedFov,
  orbitCameraOffset,
  recenterFreeLook,
  isFreeLookCentered,
  LOOK_PITCH_LIMIT,
  MAX_ENERGY,
  DART_ENERGY_COST
} = require('../public/flight-controls.js');

test('an overheated engine ignores held dash until energy is fully restored', () => {
  let state = { energy: 0, overheated: true };
  for (let step = 0; step < 49; step++) {
    state = updateEnergy(state.energy, 0.1, true, state.overheated);
    assert.equal(state.dashRatio, 0);
    assert.equal(state.overheated, true);
  }
  state = updateEnergy(state.energy, 0.1, true, state.overheated);
  assert.equal(state.energy, MAX_ENERGY);
  assert.equal(state.dashRatio, 0);
  assert.equal(state.overheated, false);

  const resumed = updateEnergy(state.energy, 0.1, true, state.overheated);
  assert.equal(resumed.dashRatio, 1);
  assert.ok(resumed.energy < MAX_ENERGY);
});

test('recentering is frame-rate independent over the same elapsed time', () => {
  const start = { yaw: 1.5, pitch: 0.9 };
  let fine = start;
  for (let i = 0; i < 8; i++) fine = recenterFreeLook(fine, 0.0125);
  const coarse = recenterFreeLook(start, 0.1);

  assert.ok(Math.abs(fine.yaw - coarse.yaw) < 1e-9, `${fine.yaw} vs ${coarse.yaw}`);
  assert.ok(Math.abs(fine.pitch - coarse.pitch) < 1e-9, `${fine.pitch} vs ${coarse.pitch}`);
});
