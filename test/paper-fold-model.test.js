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

test('the UMD build exposes the same functions in a browser-like context', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/paper-fold-model.js'), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.deepEqual(
    Object.keys(context.paperFoldModel).sort(),
    ['applyFold', 'computeFoldedGeometry', 'createPaperModel', 'createPresetModel', 'getPresetCommands', 'presetNames', 'replayFoldCommands', 'serializeFoldCommands', 'setFoldAngle', 'undoFold']
  );
});

test('createPaperModel creates a square sheet and independent state arrays', () => {
  const first = createPaperModel();
  const second = createPaperModel();

  assert.deepEqual(first, {
    faces: [{
      poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
      folds: []
    }],
    folds: [],
    history: [],
    commands: []
  });
  assert.notStrictEqual(first.faces, second.faces);
  assert.notStrictEqual(first.faces[0].poly, second.faces[0].poly);
});

test('applyFold splits along the drawn line but never alters material coordinates', () => {
  const original = createPaperModel();
  const folded = applyFold(original, [-1, 0], [1, 0], Math.PI / 2);

  assert.notStrictEqual(folded, original);
  assert.equal(folded.faces.length, 2);
  assert.equal(folded.folds.length, 1);
  assert.deepEqual(roundPoint(folded.folds[0].A), [-1, 0]);
  assert.deepEqual(roundPoint(folded.folds[0].d), [1, 0]);
  assert.equal(folded.folds[0].angle, Math.PI / 2);
  assert.deepEqual(folded.folds[0].parents, []);
  // The faces still partition the pristine sheet: no reflection, area preserved.
  assert.ok(Math.abs(totalArea(folded.faces) - 4) < 1e-9);

  const moved = folded.faces.find(face => face.folds.length === 1);
  const stationary = folded.faces.find(face => face.folds.length === 0);
  assert.ok(moved);
  assert.ok(stationary);
  assert.deepEqual(moved.folds, [0]);
  // The left side of the directed crease (y > 0) is the piece that folds.
  assert.ok(moved.poly.every(point => point[1] >= -1e-9));
  assert.ok(stationary.poly.every(point => point[1] <= 1e-9));
  assert.ok(moved.poly.some(point => Math.abs(point[1] - 1) < 1e-9));
});

test('a +90 degree fold lifts the left side to +y in the 3D placement', () => {
  const folded = applyFold(createPaperModel(), [-1, 0], [1, 0], Math.PI / 2);
  const geometry = computeFoldedGeometry(folded);

  const moved = geometry.faces.find(face => face.foldDepth === 1);
  const stationary = geometry.faces.find(face => face.foldDepth === 0);
  assert.ok(stationary.vertices3.every(vertex => Math.abs(vertex[1]) < 1e-9));
  // Material (x, 1) sits 1 unit from the crease, so it rises to exactly y = 1.
  assert.ok(moved.vertices3.some(vertex => Math.abs(vertex[1] - 1) < 1e-9));
  assert.ok(Math.abs(geometry.maxY - 1) < 1e-9);
  assert.ok(Math.abs(geometry.minY) < 1e-9);
  assert.deepEqual(moved.materialPoly.length, moved.vertices3.length);
});

test('reversing the drawn line folds the opposite half of the square', () => {
  const folded = applyFold(createPaperModel(), [1, 0], [-1, 0], Math.PI / 2);

  const moved = folded.faces.find(face => face.folds.length === 1);
  assert.ok(moved.poly.every(point => point[1] <= 1e-9));
  assert.deepEqual(roundPoint(folded.folds[0].A), [1, 0]);
  assert.deepEqual(roundPoint(folded.folds[0].d), [-1, 0]);
});

test('a negative angle folds the left side downward below the sheet', () => {
  const folded = applyFold(createPaperModel(), [-1, 0], [1, 0], -Math.PI / 2);
  const geometry = computeFoldedGeometry(folded);

  assert.equal(folded.folds[0].angle, -Math.PI / 2);
  assert.ok(Math.abs(geometry.minY + 1) < 1e-9);
  assert.ok(Math.abs(geometry.maxY) < 1e-9);
});

test('folding splits only the rigid component under the crease midpoint', () => {
  const once = applyFold(createPaperModel(), [0, -1], [0, 1], Math.PI / 2);
  const twice = applyFold(once, [0.5, -1], [0.5, 1], Math.PI / 4);

  assert.equal(twice.faces.length, 3);
  assert.equal(twice.folds.length, 2);
  assert.deepEqual(
    twice.faces.map(face => face.folds.join(',')).sort(),
    ['', '0', '1']
  );
  // The untouched left half keeps its full material polygon.
  const leftHalf = twice.faces.find(face => face.folds.join(',') === '0');
  assert.ok(Math.abs(totalArea([leftHalf]) - 2) < 1e-9);
  assert.ok(Math.abs(totalArea(twice.faces) - 4) < 1e-9);
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

  const folded = applyFold(model, start, end, Math.PI / 2);

  assert.equal(JSON.stringify(model), before);
  assert.deepEqual(start, [-1, 0]);
  assert.deepEqual(end, [1, 0]);
  assert.equal(folded.history.length, 1);
  assert.deepEqual(folded.history[0].faces, createPaperModel().faces);
});

test('undoFold immutably restores the exact state before the latest fold', () => {
  const initial = createPaperModel();
  const once = applyFold(initial, [-1, 0], [1, 0], Math.PI / 2);
  // The second crease stays parallel to the first hinge, so it folds the
  // lifted flap instead of tearing across the y=0 hinge.
  const twice = applyFold(once, [-1, 0.5], [1, 0.5], -Math.PI / 3);
  const undone = undoFold(twice);

  assert.notStrictEqual(twice, once);
  assert.deepEqual(undone, once);
  assert.notStrictEqual(undone, once);
  assert.deepEqual(twice.commands.map(command => command.angle), [Math.PI / 2, -Math.PI / 3]);
  assert.strictEqual(undoFold(initial), initial);
});

test('serializeFoldCommands returns deterministic JSON without exposing mutable command state', () => {
  const once = applyFold(createPaperModel(), [-1, 0], [1, 0], Math.PI / 2);
  const twice = applyFold(once, [-1, 0.5], [1, 0.5], -Math.PI / 3);
  const serialized = serializeFoldCommands(twice);

  assert.equal(serialized, JSON.stringify([
    { start: [-1, 0], end: [1, 0], angle: Math.PI / 2 },
    { start: [-1, 0.5], end: [1, 0.5], angle: -Math.PI / 3 }
  ]));
  const decoded = JSON.parse(serialized);
  decoded[0].start[0] = 999;
  assert.equal(twice.commands[0].start[0], -1);
});

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

test('replayFoldCommands rejects coordinates far outside the sheet', () => {
  // Sheet coordinates live in [-1,1]; tolerate edge dragging but reject wildly
  // out-of-range wire input (e.g. 1e300) before it reaches the geometry code.
  assert.equal(replayFoldCommands([{ start: [1e300, 0], end: [1, 0], angle: Math.PI / 2 }]), null);
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

test('setFoldAngle re-folds an existing hinge and actually moves the geometry', () => {
  const folded = applyFold(createPaperModel(), [-1, 0], [1, 0], Math.PI / 2);
  const adjusted = setFoldAngle(folded, 0, Math.PI / 4);

  assert.notStrictEqual(adjusted, folded);
  assert.equal(adjusted.folds[0].angle, Math.PI / 4);
  assert.equal(adjusted.commands[0].angle, Math.PI / 4);
  // Face splits are angle-independent: material partition is untouched.
  assert.deepEqual(adjusted.faces, folded.faces);
  // Material (x, 1) sat at y = 1 under 90°; at 45° it drops to sin(45°).
  const before = computeFoldedGeometry(folded);
  const after = computeFoldedGeometry(adjusted);
  assert.ok(Math.abs(before.maxY - 1) < 1e-9);
  assert.ok(Math.abs(after.maxY - Math.sin(Math.PI / 4)) < 1e-9);
  // The original model is untouched (immutable-style, like applyFold).
  assert.equal(folded.folds[0].angle, Math.PI / 2);
  assert.equal(folded.commands[0].angle, Math.PI / 2);
});

test('setFoldAngle rejects bad indices and invalid angles by returning the same object', () => {
  const folded = applyFold(createPaperModel(), [-1, 0], [1, 0], Math.PI / 2);
  const before = JSON.stringify(folded);

  assert.strictEqual(setFoldAngle(folded, -1, Math.PI / 4), folded);
  assert.strictEqual(setFoldAngle(folded, 1, Math.PI / 4), folded);
  assert.strictEqual(setFoldAngle(folded, 0.5, Math.PI / 4), folded);
  assert.strictEqual(setFoldAngle(folded, 0, 0), folded);
  assert.strictEqual(setFoldAngle(folded, 0, 0.04), folded);
  assert.strictEqual(setFoldAngle(folded, 0, Math.PI + 0.001), folded);
  assert.strictEqual(setFoldAngle(folded, 0, Number.NaN), folded);
  // The angle it already has is a no-op, not a new history entry.
  assert.strictEqual(setFoldAngle(folded, 0, Math.PI / 2), folded);
  const flat = createPaperModel();
  assert.strictEqual(setFoldAngle(flat, 0, Math.PI / 4), flat);
  assert.equal(JSON.stringify(folded), before);
});

test('setFoldAngle keeps serialize→replay faithful to the adjusted angle', () => {
  const once = applyFold(createPaperModel(), [-1, 0], [1, 0], Math.PI / 2);
  const twice = applyFold(once, [-1, 0.5], [1, 0.5], -Math.PI / 3);
  const adjusted = setFoldAngle(twice, 0, Math.PI / 3);

  const replayed = replayFoldCommands(serializeFoldCommands(adjusted));
  assert.ok(replayed);
  assert.deepEqual(replayed.faces, adjusted.faces);
  assert.deepEqual(replayed.folds, adjusted.folds);
  assert.deepEqual(replayed.commands, adjusted.commands);
  assert.equal(replayed.folds[0].angle, Math.PI / 3);
  assert.equal(replayed.folds[1].angle, -Math.PI / 3);
});

test('undoFold restores the angle a hinge had before the adjustment', () => {
  const folded = applyFold(createPaperModel(), [-1, 0], [1, 0], Math.PI / 2);
  const adjusted = setFoldAngle(folded, 0, Math.PI / 4);

  assert.equal(adjusted.history.length, folded.history.length + 1);
  const undone = undoFold(adjusted);
  assert.deepEqual(undone, folded);
  assert.equal(undone.folds[0].angle, Math.PI / 2);
});

test('computeFoldedGeometry exposes one transformed hinge axis per fold', () => {
  assert.deepEqual(computeFoldedGeometry(createPaperModel()).hinges, []);
  assert.deepEqual(computeFoldedGeometry(null).hinges, []);

  const once = applyFold(createPaperModel(), [-1, 0], [1, 0], Math.PI / 2);
  const twice = applyFold(once, [-1, 0.5], [1, 0.5], -Math.PI / 3);
  const geometry = computeFoldedGeometry(twice);

  assert.equal(geometry.hinges.length, twice.folds.length);
  assert.deepEqual(geometry.hinges.map(hinge => hinge.foldIndex), [0, 1]);
  assert.deepEqual(geometry.hinges.map(hinge => hinge.angle), [Math.PI / 2, -Math.PI / 3]);
  const round3 = point => roundPoint(point).map(value => (value === 0 ? 0 : value));
  // Fold 0 has no parents: its axis is the material line lifted to (x, 0, -y).
  assert.deepEqual(round3(geometry.hinges[0].origin3), [-1, 0, 0]);
  assert.deepEqual(round3(geometry.hinges[0].dir3), [1, 0, 0]);
  // Fold 1 was drawn at material y = 0.5 on the flap lifted by fold 0 (+90°):
  // the axis is carried to height y = 0.5 on the vertical plane z = 0.
  assert.deepEqual(round3(geometry.hinges[1].origin3), [-1, 0.5, 0]);
  assert.deepEqual(round3(geometry.hinges[1].dir3), [1, 0, 0]);
});

test('at most ten folds and sixty-four faces are accepted', () => {
  let model = createPaperModel();
  for (let i = 0; i < 10; i += 1) {
    const x = 0.5 - i * 0.05;
    model = applyFold(model, [x, -1], [x, 1], Math.PI / 2);
  }
  assert.equal(model.folds.length, 10);
  assert.equal(model.faces.length, 11);
  assert.strictEqual(applyFold(model, [-0.05, -1], [-0.05, 1], Math.PI / 2), model);

  const tooManyFaces = createPaperModel();
  tooManyFaces.faces = Array.from({ length: 64 }, () => ({
    poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
    folds: []
  }));
  const before = JSON.stringify(tooManyFaces);
  assert.strictEqual(applyFold(tooManyFaces, [-1, 0], [1, 0], Math.PI / 2), tooManyFaces);
  assert.equal(JSON.stringify(tooManyFaces), before);
});
