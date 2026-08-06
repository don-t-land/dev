import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  FIXED_DT,
  createPaperFlightPhysics,
  makeColliderVertices
} from '../public/flight-physics-rapier.mjs';

const require = createRequire(import.meta.url);
const {
  createPaperModel,
  applyFold,
  applyPanelFold
} = require('../public/paper-fold-model.js');
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

test('square paper produces a non-degenerate folded-shape collider hull', () => {
  const vertices = makeColliderVertices(createPaperModel());
  assert.equal(vertices.length, 24);
  assert.ok([...vertices].every(Number.isFinite));
  assert.ok(new Set([...vertices].map(value => value.toFixed(3))).size > 3);
});

function axisExtent(vertices, axis) {
  const values = [];
  for (let index = axis; index < vertices.length; index += 3) values.push(vertices[index]);
  return Math.max(...values) - Math.min(...values);
}

test('90 degree and sequential selected-face folds retain their 3D height in collider vertices', () => {
  const first = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], coordinateSpace: 'material',
    direction: 1, targetAngle: 90
  });
  const standing = first.faces.find(face => face.folds.includes('fold-1'));
  const sequential = applyPanelFold(first, {
    start: [0, 0], end: [0, 1], coordinateSpace: 'material',
    direction: 1, targetAngle: 90, seedFaceId: standing.id
  });

  assert.ok(axisExtent(makeColliderVertices(first), 1) > 1.3,
    'a standing panel must have flight-space vertical extent');
  assert.ok(axisExtent(makeColliderVertices(sequential), 1) > 1.3,
    'a sequential selected-face fold must preserve flight-space vertical extent');
});

test('collider generation retains the legacy 2D face fallback', () => {
  const vertices = makeColliderVertices({
    faces: [{ poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]], layer: 2 }]
  });

  assert.equal(vertices.length, 24);
  assert.ok(axisExtent(vertices, 0) > 2.6);
  assert.ok(axisExtent(vertices, 1) >= .07 - 1e-6);
  assert.ok(axisExtent(vertices, 2) > 2.6);
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
