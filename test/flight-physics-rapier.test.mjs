import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  BETA_AERO_TUNING,
  FIXED_DT,
  calculateAerodynamicMagnitudes,
  createPaperFlightPhysics,
  makeColliderVertices
} from '../public/flight-physics-rapier.mjs';

const require = createRequire(import.meta.url);
const { createPaperModel, createPresetModel, applyFold } = require('../public/paper-fold-model.js');
const { deriveAerodynamicProfile } = require('../public/paper-aero-profile.js');

function initialState() {
  return {
    position: { x: 0, y: 100, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: -22 }
  };
}

async function configured(model) {
  const physics = await createPaperFlightPhysics();
  physics.configure(deriveAerodynamicProfile(model), makeColliderVertices(model));
  physics.reset(initialState());
  return physics;
}

function attitudeYXZ(quaternion) {
  const { x, y, z, w } = quaternion;
  const m11 = 1 - 2 * (y * y + z * z);
  const m13 = 2 * (x * z + y * w);
  const m21 = 2 * (x * y + z * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  const m31 = 2 * (x * z - y * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const pitch = Math.asin(-Math.max(-1, Math.min(1, m23)));
  return Math.abs(m23) < .9999999
    ? { pitch, yaw: Math.atan2(m13, m33), roll: Math.atan2(m21, m22) }
    : { pitch, yaw: Math.atan2(-m31, m11), roll: 0 };
}

function quaternionDistance(left, right) {
  const product = Math.abs(
    left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w
  );
  const norm = Math.hypot(left.x, left.y, left.z, left.w)
    * Math.hypot(right.x, right.y, right.z, right.w);
  return 2 * Math.acos(Math.min(1, product / norm));
}

function snapshotRounded(state) {
  return JSON.stringify({
    p: Object.values(state.position).map(value => value.toFixed(5)),
    r: Object.values(state.rotation).map(value => value.toFixed(5)),
    v: Object.values(state.velocity).map(value => value.toFixed(5))
  });
}

test('Rapier fixed-step flight is independent of render cadence', async () => {
  const at30 = await configured(createPaperModel());
  const at144 = await configured(createPaperModel());
  let state30;
  let state144;
  for (let frame = 0; frame < 60; frame += 1) state30 = at30.advance(1 / 30, {});
  for (let frame = 0; frame < 288; frame += 1) state144 = at144.advance(1 / 144, {});
  assert.equal(snapshotRounded(state30), snapshotRounded(state144));
  at30.free();
  at144.free();
});

test('Rapier clamps velocity to the configured aircraft maximum speed', async () => {
  const model = createPresetModel('stealth');
  const profile = deriveAerodynamicProfile(model);
  const physics = await createPaperFlightPhysics();
  physics.configure(profile, makeColliderVertices(model));
  physics.reset({
    position: { x: 0, y: 100, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: -120 }
  });

  const state = physics.advance(FIXED_DT, {});
  assert.ok(state.speed <= profile.maxSpeed + 1e-6, `${state.speed} > ${profile.maxSpeed}`);
  physics.free();
});

test('Rapier keeps combined pitch and roll inside the envelope across float32 round trips', async () => {
  const model = createPresetModel('stealth');
  const profile = deriveAerodynamicProfile(model);
  const physics = await createPaperFlightPhysics();
  physics.configure(profile, makeColliderVertices(model));
  physics.reset(initialState());

  for (let tick = 0; tick < 1200; tick += 1) {
    const state = physics.advance(FIXED_DT, {
      pitch: tick % 400 < 200 ? 1 : -1,
      roll: tick % 600 < 300 ? 1 : -1
    });
    const { pitch, roll } = attitudeYXZ(state.rotation);
    assert.ok(
      pitch >= -profile.maxPitchDown - 1e-6 && pitch <= profile.maxPitchUp + 1e-6,
      `tick ${tick}: pitch ${pitch} outside ${-profile.maxPitchDown}..${profile.maxPitchUp}`
    );
    assert.ok(
      Math.abs(roll) <= profile.maxRoll + 1e-6,
      `tick ${tick}: roll ${roll} outside ±${profile.maxRoll}`
    );
  }
  physics.free();
});

test('different folded shapes produce different physical trajectories', async () => {
  const squareModel = createPaperModel();
  const halfModel = applyFold(createPaperModel(), [-1, 0], [1, 0], 1);
  const square = await configured(squareModel);
  const half = await configured(halfModel);
  let squareState;
  let halfState;
  for (let tick = 0; tick < 300; tick += 1) {
    squareState = square.advance(FIXED_DT, {});
    halfState = half.advance(FIXED_DT, {});
  }
  assert.ok(Math.abs(squareState.position.y - halfState.position.y) > 1);
  assert.ok(Math.abs(squareState.position.z - halfState.position.z) > .1);
  square.free();
  half.free();
});
