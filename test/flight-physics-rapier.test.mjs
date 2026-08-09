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

test('beta aerodynamics reduce lift by 30% and drag by 55% for every profile', () => {
  assert.deepEqual(BETA_AERO_TUNING, {
    liftMultiplier: .7,
    dragMultiplier: .45
  });

  const forces = calculateAerodynamicMagnitudes(22, {
    liftScale: 1,
    dragScale: 1,
    stallSpeed: 10
  });
  assert.equal(forces.liftMagnitude, 14.7);
  assert.equal(forces.dragMagnitude, .82764);
});

test('square paper produces a non-degenerate folded-shape collider hull', () => {
  const vertices = makeColliderVertices(createPaperModel());
  assert.equal(vertices.length, 24);
  assert.ok([...vertices].every(Number.isFinite));
  assert.ok(new Set([...vertices].map(value => value.toFixed(3))).size > 3);
});

test('a 90-degree fold lifts collider vertices to the folded 3d height, not just the paper thickness', () => {
  const foldedModel = applyFold(createPaperModel(), [-1, 0], [1, 0], Math.PI / 2);
  const vertices = makeColliderVertices(foldedModel);
  assert.ok([...vertices].every(Number.isFinite));
  const ys = [];
  for (let index = 1; index < vertices.length; index += 3) ys.push(vertices[index]);
  const uniqueYs = new Set(ys.map(value => value.toFixed(3)));
  // The old flat-sheet implementation only ever produced y = ±0.035 (paper
  // thickness). A 90-degree fold must lift some vertices to roughly the
  // folded height (1 material unit) scaled by 1.35, ± the thickness offset.
  assert.ok([...uniqueYs].some(value => value !== '0.035' && value !== '-0.035'));
  assert.ok(ys.some(y => Math.abs(y - 1.35) <= .035 + 1e-6));
  const seenPairs = new Set(ys.map(value => value.toFixed(6)));
  assert.ok(seenPairs.size > 2);
});

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

test('Rapier caps reset velocity immediately even when no fixed step runs', async () => {
  const model = createPresetModel('stealth');
  const profile = deriveAerodynamicProfile(model);
  const physics = await createPaperFlightPhysics();
  physics.configure(profile, makeColliderVertices(model));
  physics.reset({
    position: { x: 0, y: 100, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: -120 }
  });

  const state = physics.advance(FIXED_DT / 4, {});
  assert.equal(state.steps, 0);
  assert.ok(state.speed <= profile.maxSpeed + 1e-6, `${state.speed} > ${profile.maxSpeed}`);
  physics.free();
});

test('Rapier caps boost immediately even when no fixed step runs', async () => {
  const model = createPresetModel('stealth');
  const profile = deriveAerodynamicProfile(model);
  const physics = await createPaperFlightPhysics();
  physics.configure(profile, makeColliderVertices(model));
  physics.reset({
    position: { x: 0, y: 100, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: -profile.maxSpeed }
  });

  physics.boostSpeed(6);
  const state = physics.advance(FIXED_DT / 4, {});
  assert.equal(state.steps, 0);
  assert.ok(state.speed <= profile.maxSpeed + 1e-6, `${state.speed} > ${profile.maxSpeed}`);
  physics.free();
});

test('Rapier enforces the configured pitch envelope during sustained input', async () => {
  const model = createPresetModel('stealth');
  const profile = deriveAerodynamicProfile(model);
  const physics = await createPaperFlightPhysics();
  physics.configure(profile, makeColliderVertices(model));
  physics.reset(initialState());

  for (let tick = 0; tick < 360; tick += 1) {
    const state = physics.advance(FIXED_DT, { pitch: 1 });
    const { pitch } = attitudeYXZ(state.rotation);
    assert.ok(
      pitch >= -profile.maxPitchDown - 1e-6 && pitch <= profile.maxPitchUp + 1e-6,
      `tick ${tick}: pitch ${pitch} outside ${-profile.maxPitchDown}..${profile.maxPitchUp}`
    );
  }
  physics.free();
});

test('Rapier enforces the configured roll envelope during sustained input', async () => {
  const model = createPresetModel('stealth');
  const profile = deriveAerodynamicProfile(model);
  const physics = await createPaperFlightPhysics();
  physics.configure(profile, makeColliderVertices(model));
  physics.reset(initialState());

  for (let tick = 0; tick < 360; tick += 1) {
    const state = physics.advance(FIXED_DT, { roll: 1 });
    const { roll } = attitudeYXZ(state.rotation);
    assert.ok(
      Math.abs(roll) <= profile.maxRoll + 1e-6,
      `tick ${tick}: roll ${roll} outside ±${profile.maxRoll}`
    );
  }
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

test('Rapier attitude limiting does not snap at positive or negative yaw gimbal headings', async () => {
  const model = createPresetModel('stealth');
  const profile = deriveAerodynamicProfile(model);

  for (const yaw of [Math.PI / 2, -Math.PI / 2]) {
    const physics = await createPaperFlightPhysics();
    physics.configure(profile, makeColliderVertices(model));
    let previousRotation = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    physics.reset({ ...initialState(), rotation: previousRotation });

    for (let tick = 0; tick < 4; tick += 1) {
      const state = physics.advance(FIXED_DT, { pitch: 1, roll: 1 });
      const jump = quaternionDistance(previousRotation, state.rotation);
      assert.ok(jump < .01, `yaw ${yaw}, tick ${tick}: non-physical ${jump} rad attitude jump`);
      previousRotation = state.rotation;
    }
    physics.free();
  }
});

test('Rapier map colliders include rotated floating platforms', async () => {
  const physics = await configured(createPaperModel());
  physics.setMapColliders({
    spires: [{ x: 4, z: -8, h: 40, r: 5 }],
    rocks: [{ p: { x: -3, y: 50, z: -12 }, r: 6 }],
    platforms: [{ x: 20, y: 90, z: -40, w: 50, h: 14, d: 34, rotation: .4 }]
  });
  assert.equal(physics.staticColliders.length, 4, 'ground + spire + rock + platform');
  physics.free();
});

test('Rapier consumes renderer-authored compound terrain collider transforms', async () => {
  const physics = await configured(createPaperModel());
  physics.setMapColliders({
    colliders: [
      {
        type: 'tapered-segment',
        start: { x: 0, y: 10, z: 0 },
        end: { x: 16, y: 38, z: -7 },
        radius0: 5,
        radius1: 2
      },
      {
        type: 'ellipsoid',
        center: { x: 20, y: 50, z: -8 },
        radii: { x: 4, y: 9, z: 6 },
        rotation: { x: 0, y: .2, z: 0, w: Math.sqrt(.96) }
      },
      {
        type: 'elliptic-cylinder',
        center: { x: -30, y: 90, z: 16 },
        radii: { x: 22, z: 15 },
        halfHeight: 7,
        rotation: { x: 0, y: .1, z: 0, w: Math.sqrt(.99) }
      },
      {
        type: 'box',
        center: { x: 0, y: 30, z: 80 },
        half: { x: 12, y: 30, z: 8 },
        rotation: { x: 0, y: 0, z: 0, w: 1 }
      }
    ]
  });
  assert.equal(physics.staticColliders.length, 5, 'ground + four renderer-authored shapes');
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

test('mirrored asymmetric folds create opposite roll response', async () => {
  const rightHeavy = applyFold(createPaperModel(), [0.3, -1], [0.3, 1], 1);
  const leftHeavy = applyFold(createPaperModel(), [0.3, 1], [0.3, -1], 1);
  const right = await configured(rightHeavy);
  const left = await configured(leftHeavy);
  let rightState;
  let leftState;
  for (let tick = 0; tick < 180; tick += 1) {
    rightState = right.advance(FIXED_DT, {});
    leftState = left.advance(FIXED_DT, {});
  }
  assert.ok(rightState.rotation.z * leftState.rotation.z < 0);
  right.free();
  left.free();
});
