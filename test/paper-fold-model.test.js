const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const {
  createPaperModel,
  applyFold,
  setFoldAngle,
  undoFold,
  serializeFoldCommands,
  replayFoldCommands,
  computeFoldedGeometry
} = require('../public/paper-fold-model.js');

function roundPoint(point) {
  return point.map(value => Math.round(value * 1e9) / 1e9);
}

function totalArea(faces) {
  return faces.reduce((sum, face) => {
    let twiceArea = 0;
    for (let i = 0; i < face.poly.length; i += 1) {
      const next = (i + 1) % face.poly.length;
      twiceArea += face.poly[i][0] * face.poly[next][1]
        - face.poly[next][0] * face.poly[i][1];
    }
    return sum + Math.abs(twiceArea / 2);
  }, 0);
}

test('replayFoldCommands reconstructs the identical model and rejects tampered commands', () => {
  const once = applyFold(createPaperModel(), [-1, 0], [1, 0], Math.PI / 2);
  const original = applyFold(once, [-1, 0.5], [1, 0.5], -Math.PI / 3);
  assert.notStrictEqual(original, once);
  const serialized = serializeFoldCommands(original);

  assert.deepEqual(replayFoldCommands(serialized), original);
  assert.deepEqual(replayFoldCommands(JSON.parse(serialized)), original);
  assert.equal(replayFoldCommands('{bad json'), null);
  assert.equal(replayFoldCommands([{ start: [0, 0], end: [0, 0], angle: Math.PI / 2 }]), null);
  // The retired direction format is not accepted any more.
  assert.equal(replayFoldCommands([{ start: [-1, 0], end: [1, 0], direction: 1 }]), null);
  assert.equal(replayFoldCommands(Array.from({ length: 11 }, () => ({
    start: [-1, 0], end: [1, 0], angle: Math.PI / 2
  }))), null);
});

test('small drags, invalid angles, and sliver polygons are rejected atomically', () => {
  const model = createPaperModel();

  assert.strictEqual(applyFold(model, [0, 0], [0.01, 0.01], Math.PI / 2), model);
  assert.strictEqual(applyFold(model, [-1, 0], [1, 0], 0), model);
  assert.strictEqual(applyFold(model, [-1, 0], [1, 0], 0.04), model);
  assert.strictEqual(applyFold(model, [-1, 0], [1, 0], Math.PI + 0.001), model);
  assert.strictEqual(applyFold(model, [-1, 0], [1, 0], Number.NaN), model);
  assert.strictEqual(applyFold(model, [NaN, 0], [1, 0], Math.PI / 2), model);
  // A crease whose midpoint misses the sheet entirely cannot anchor a component.
  assert.strictEqual(applyFold(model, [5, -1], [5, 1], Math.PI / 2), model);
  // A crease this close to the edge leaves a polygon narrower than the area threshold.
  assert.strictEqual(applyFold(model, [0.9999998, -1], [0.9999998, 1], Math.PI / 2), model);
  assert.deepEqual(model, createPaperModel());
});
