const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const {
  createPaperModel,
  applyFold,
  undoFold,
  serializeFoldCommands,
  replayFoldCommands
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

test('the UMD build exposes the same five functions in a browser-like context', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/paper-fold-model.js'), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.deepEqual(
    Object.keys(context.paperFoldModel).sort(),
    ['applyFold', 'createPaperModel', 'replayFoldCommands', 'serializeFoldCommands', 'undoFold']
  );
});

test('createPaperModel creates a square sheet and independent state arrays', () => {
  const first = createPaperModel();
  const second = createPaperModel();

  assert.deepEqual(first, {
    faces: [{
      poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
      layer: 0,
      folds: []
    }],
    folds: [],
    history: [],
    commands: []
  });
  assert.notStrictEqual(first.faces, second.faces);
  assert.notStrictEqual(first.faces[0].poly, second.faces[0].poly);
});

test('applyFold uses the drawn line itself as the crease and folds its left side', () => {
  const original = createPaperModel();
  const folded = applyFold(original, [-1, 0], [1, 0], 1);

  assert.notStrictEqual(folded, original);
  assert.equal(folded.faces.length, 2);
  assert.equal(folded.folds.length, 1);
  assert.deepEqual(roundPoint(folded.folds[0].A), [-1, 0]);
  assert.deepEqual(roundPoint(folded.folds[0].d), [1, 0]);
  assert.equal(folded.folds[0].dir, 1);
  assert.ok(folded.faces.every(face => face.poly.every(point => point[1] <= 1e-9)));
  assert.ok(Math.abs(totalArea(folded.faces) - 4) < 1e-9);

  const moved = folded.faces.find(face => face.folds.length === 1);
  const stationary = folded.faces.find(face => face.folds.length === 0);
  assert.ok(moved);
  assert.ok(stationary);
  assert.ok(moved.poly.some(point => Math.abs(point[1] + 1) < 1e-9));
  assert.equal(moved.layer, 1);
  assert.equal(stationary.layer, 0);
});

test('reversing the drawn line folds the opposite half of the square', () => {
  const folded = applyFold(createPaperModel(), [1, 0], [-1, 0], 1);

  assert.ok(folded.faces.every(face => face.poly.every(point => point[1] >= -1e-9)));
  assert.deepEqual(roundPoint(folded.folds[0].A), [1, 0]);
  assert.deepEqual(roundPoint(folded.folds[0].d), [-1, 0]);
});

test('mountain direction places reflected pieces below stationary pieces', () => {
  const folded = applyFold(createPaperModel(), [-1, 0], [1, 0], -1);
  const moved = folded.faces.find(face => face.folds.length === 1);
  const stationary = folded.faces.find(face => face.folds.length === 0);

  assert.equal(moved.layer, 0);
  assert.equal(stationary.layer, 1);
  assert.equal(folded.folds[0].dir, -1);
});

test('folding applies to every current layer', () => {
  const once = applyFold(createPaperModel(), [-1, 0], [1, 0], 1);
  const twice = applyFold(once, [0, -1], [0, 1], 1);

  assert.equal(twice.faces.length, 4);
  assert.equal(twice.folds.length, 2);
  assert.ok(twice.faces.every(face => face.poly.every(point => point[1] <= 1e-9 && point[0] >= -1e-9)));
  assert.equal(twice.faces.filter(face => face.folds.includes(1)).length, 2);
});

test('model, point inputs, and previous snapshots are never mutated', () => {
  const model = createPaperModel();
  const before = JSON.stringify(model);
  const start = Object.freeze([-1, 0]);
  const end = Object.freeze([1, 0]);
  Object.freeze(model.faces[0].poly[0]);
  Object.freeze(model.faces[0].poly);
  Object.freeze(model.faces[0]);
  Object.freeze(model.faces);
  Object.freeze(model.folds);
  Object.freeze(model.history);
  Object.freeze(model.commands);
  Object.freeze(model);

  const folded = applyFold(model, start, end, 1);

  assert.equal(JSON.stringify(model), before);
  assert.deepEqual(start, [-1, 0]);
  assert.deepEqual(end, [1, 0]);
  assert.equal(folded.history.length, 1);
  assert.deepEqual(folded.history[0].faces, createPaperModel().faces);
});

test('undoFold immutably restores the exact state before the latest fold', () => {
  const initial = createPaperModel();
  const once = applyFold(initial, [-1, 0], [1, 0], 1);
  const twice = applyFold(once, [0, -1], [0, 1], -1);
  const undone = undoFold(twice);

  assert.deepEqual(undone, once);
  assert.notStrictEqual(undone, once);
  assert.deepEqual(twice.commands.map(command => command.direction), [1, -1]);
  assert.strictEqual(undoFold(initial), initial);
});

test('serializeFoldCommands returns deterministic JSON without exposing mutable command state', () => {
  const once = applyFold(createPaperModel(), [-1, 0], [1, 0], 1);
  const twice = applyFold(once, [0, -1], [0, 1], -1);
  const serialized = serializeFoldCommands(twice);

  assert.equal(serialized, JSON.stringify([
    { start: [-1, 0], end: [1, 0], direction: 1 },
    { start: [0, -1], end: [0, 1], direction: -1 }
  ]));
  const decoded = JSON.parse(serialized);
  decoded[0].start[0] = 999;
  assert.equal(twice.commands[0].start[0], -1);
});

test('replayFoldCommands reconstructs the identical model and rejects tampered commands', () => {
  const once = applyFold(createPaperModel(), [-1, 0], [1, 0], 1);
  const original = applyFold(once, [0, -1], [0, 1], -1);
  const serialized = serializeFoldCommands(original);

  assert.deepEqual(replayFoldCommands(serialized), original);
  assert.deepEqual(replayFoldCommands(JSON.parse(serialized)), original);
  assert.equal(replayFoldCommands('{bad json'), null);
  assert.equal(replayFoldCommands([{ start: [0, 0], end: [0, 0], direction: 1 }]), null);
  assert.equal(replayFoldCommands(Array.from({ length: 11 }, () => ({
    start: [-1, 0], end: [1, 0], direction: 1
  }))), null);
});

test('small drags, invalid values, and sliver polygons are rejected atomically', () => {
  const model = createPaperModel();

  assert.strictEqual(applyFold(model, [0, 0], [0.01, 0.01], 1), model);
  assert.strictEqual(applyFold(model, [-1, 0], [1, 0], 0), model);
  assert.strictEqual(applyFold(model, [NaN, 0], [1, 0], 1), model);
  // A crease this close to the edge leaves a polygon narrower than the area threshold.
  assert.strictEqual(applyFold(model, [0.9999998, -1], [0.9999998, 1], 1), model);
  assert.deepEqual(model, createPaperModel());
});

test('at most ten folds and sixty-four faces are accepted', () => {
  let model = createPaperModel();
  for (let i = 0; i < 10; i += 1) {
    const start = i % 2 ? [1, 0] : [-1, 0];
    const end = i % 2 ? [-1, 0] : [1, 0];
    model = applyFold(model, start, end, i % 2 ? -1 : 1);
  }
  assert.equal(model.folds.length, 10);
  assert.strictEqual(applyFold(model, [-1, 0], [1, 0], 1), model);

  const tooManyFaces = createPaperModel();
  tooManyFaces.faces = Array.from({ length: 64 }, (_, layer) => ({
    poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
    layer,
    folds: []
  }));
  const before = JSON.stringify(tooManyFaces);
  assert.strictEqual(applyFold(tooManyFaces, [-1, 0], [1, 0], 1), tooManyFaces);
  assert.equal(JSON.stringify(tooManyFaces), before);
});
