const test = require('node:test');
const assert = require('node:assert/strict');

const { createPaperModel, applyFold, applyPanelFold, flipPaper } = require('../public/paper-fold-model.js');
const { deriveAerodynamicProfile } = require('../public/paper-aero-profile.js');

function approx(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
}

test('flat square produces a finite neutral baseline profile', () => {
  const model = createPaperModel();
  const profile = deriveAerodynamicProfile(model);

  approx(profile.physicalArea, 4);
  approx(profile.planformArea, 4);
  approx(profile.areaRatio, 1);
  approx(profile.span, 2);
  approx(profile.chord, 2);
  approx(profile.aspectRatio, 1);
  approx(profile.rollBias, 0);
  approx(profile.pitchBias, 0);
  assert.ok(profile.liftScale > 0);
  assert.ok(profile.dragScale > 0);
  assert.ok(profile.stallSpeed > 0);
});

test('folding the square in half halves projected area and raises stall speed', () => {
  const flat = deriveAerodynamicProfile(createPaperModel());
  const foldedModel = applyFold(createPaperModel(), [-1, 0], [1, 0], 1);
  const folded = deriveAerodynamicProfile(foldedModel);

  approx(folded.physicalArea, 4);
  approx(folded.planformArea, 2);
  approx(folded.areaRatio, .5);
  approx(folded.span, 2);
  approx(folded.chord, 1);
  approx(folded.aspectRatio, 2);
  assert.ok(folded.stallSpeed > flat.stallSpeed);
  assert.notEqual(folded.liftScale, flat.liftScale);
  assert.notEqual(folded.dragScale, flat.dragScale);
});

test('mirrored asymmetric creases preserve scalar coefficients and reverse roll bias', () => {
  const leftFold = applyFold(createPaperModel(), [.3, -1], [.3, 1], 1);
  const rightFold = applyFold(createPaperModel(), [-.3, 1], [-.3, -1], 1);
  const left = deriveAerodynamicProfile(leftFold);
  const right = deriveAerodynamicProfile(rightFold);

  approx(left.planformArea, right.planformArea);
  approx(left.liftScale, right.liftScale);
  approx(left.dragScale, right.dragScale);
  approx(left.rollBias, -right.rollBias);
  assert.ok(Math.abs(left.rollBias) > .01);
});

test('profile calculation is deterministic, bounded, and does not mutate the fold model', () => {
  let model = createPaperModel();
  for (let index = 0; index < 8; index += 1) {
    const horizontal = index % 2 === 0;
    model = horizontal
      ? applyFold(model, [-1, index * .03 - .1], [1, index * .03 - .1], index % 3 ? -1 : 1)
      : applyFold(model, [index * .02 - .08, 1], [index * .02 - .08, -1], index % 3 ? 1 : -1);
  }
  const snapshot = JSON.stringify(model);
  const first = deriveAerodynamicProfile(model);
  const second = deriveAerodynamicProfile(model);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(model), snapshot);
  for (const value of Object.values(first)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  assert.ok(first.areaRatio >= .02 && first.areaRatio <= 1);
  assert.ok(first.liftScale >= .15 && first.liftScale <= 1.8);
  assert.ok(first.dragScale >= .25 && first.dragScale <= 2.2);
  assert.ok(first.stallSpeed >= 8 && first.stallSpeed <= 42);
  assert.ok(first.rollBias >= -.65 && first.rollBias <= .65);
  assert.ok(first.pitchBias >= -.55 && first.pitchBias <= .55);
});

test('partial 3D folds preserve physical area while horizontal planform and lift stay bounded', () => {
  const model = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], direction: 1, targetAngle: 90
  });
  const first = deriveAerodynamicProfile(model);
  const second = deriveAerodynamicProfile(model);

  approx(first.physicalArea, 4);
  approx(first.planformArea, 2);
  approx(first.areaRatio, .5);
  assert.deepEqual(first, second);
  for (const value of Object.values(first)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  assert.ok(first.liftScale >= .15 && first.liftScale <= 1.8);
  assert.ok(first.stallSpeed >= 8 && first.stallSpeed <= 42);
});

test('a tilted-face crease that needs multiple physical hinges is rejected without changing aero metrics', () => {
  const first = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], coordinateSpace: 'material',
    direction: 1, targetAngle: 90
  });
  const seed = first.faces.find(face => face.folds.includes('fold-1'));
  const second = applyPanelFold(first, {
    start: [0, 0], end: [0, 1], coordinateSpace: 'material',
    direction: 1, targetAngle: 90, seedFaceId: seed.id
  });

  assert.strictEqual(second, first);
  assert.deepEqual(deriveAerodynamicProfile(second), deriveAerodynamicProfile(first));
  approx(deriveAerodynamicProfile(second).physicalArea, 4);
});

test('flips are not aerodynamic folds and a double flip restores the entire profile', () => {
  const folded = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], direction: 1, targetAngle: 90
  });
  const before = deriveAerodynamicProfile(folded);
  const once = deriveAerodynamicProfile(flipPaper(folded));
  const twice = deriveAerodynamicProfile(flipPaper(flipPaper(folded)));

  assert.equal(before.foldCount, 1);
  assert.equal(once.foldCount, 1);
  assert.deepEqual(twice, before);
});
