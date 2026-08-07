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
const { createPaperModel, applyFold } = require('../public/paper-fold-model.js');
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
