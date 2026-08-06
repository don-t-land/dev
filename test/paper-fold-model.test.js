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
  replayFoldCommands,
  applyPanelFold,
  updateFoldAngle,
  removeFold,
  flipPaper
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

test('the UMD build exposes legacy and free-edit functions in a browser-like context', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/paper-fold-model.js'), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.deepEqual(
    Object.keys(context.paperFoldModel).sort(),
    [
      'applyFold', 'applyPanelFold', 'createPaperModel', 'flipPaper', 'removeFold',
      'replayFoldCommands', 'serializeFoldCommands', 'undoFold', 'updateFoldAngle'
    ]
  );
});

test('createPaperModel creates a square sheet and independent state arrays', () => {
  const first = createPaperModel();
  const second = createPaperModel();

  assert.deepEqual(first, {
    faces: [{
      id: 'face-0',
      poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
      materialPoly: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
      vertices3d: [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]],
      layer: 0,
      folds: []
    }],
    folds: [],
    history: [],
    commands: [],
    paperSide: 'front'
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
  assert.equal(twice.faces.filter(face => face.folds.includes('fold-2')).length, 2);
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
    {
      type: 'fold', version: 2, id: 'fold-1', start: [-1, 0], end: [1, 0],
      direction: 1, targetAngle: 180
    },
    {
      type: 'fold', version: 2, id: 'fold-2', start: [0, -1], end: [0, 1],
      direction: -1, targetAngle: 180
    }
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

function physicalArea3d(faces) {
  return faces.reduce((total, face) => {
    const vertices = face.vertices3d;
    if (!Array.isArray(vertices) || vertices.length < 3) return total;
    const origin = vertices[0];
    let area = 0;
    for (let index = 1; index < vertices.length - 1; index += 1) {
      const a = vertices[index].map((value, axis) => value - origin[axis]);
      const b = vertices[index + 1].map((value, axis) => value - origin[axis]);
      const cross = [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
      ];
      area += Math.hypot(...cross) / 2;
    }
    return total + area;
  }, 0);
}

test('a versioned 90 degree panel fold rotates real 3D geometry and preserves physical area', () => {
  const folded = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], direction: 1, targetAngle: 90.0004
  });

  assert.notEqual(folded, null);
  assert.equal(folded.commands[0].type, 'fold');
  assert.equal(folded.commands[0].version, 2);
  assert.equal(folded.commands[0].id, 'fold-1');
  assert.equal(folded.commands[0].targetAngle, 90);
  assert.equal(folded.faces.length, 2);
  assert.deepEqual(folded.faces.map(face => face.id), ['face-0:fold-1:s', 'face-0:fold-1:m']);
  const moved = folded.faces.find(face => face.folds.includes('fold-1'));
  assert.ok(moved.vertices3d.some(point => Math.abs(point[2] - 1) < 1e-9));
  assert.ok(moved.vertices3d.every(point => Math.abs(point[1]) < 1e-9));
  assert.ok(Math.abs(physicalArea3d(folded.faces) - 4) < 1e-9);
  assert.ok(totalArea(folded.faces) < 4);
});

test('targetFaceIds and seedFaceId move only the selected face or layer', () => {
  const stacked = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], direction: 1, targetAngle: 180
  });
  const untouched = stacked.faces.find(face => !face.folds.length);
  const selected = stacked.faces.find(face => face.folds.length);
  const before = JSON.parse(JSON.stringify(untouched));
  const selective = applyPanelFold(stacked, {
    start: [0, -1], end: [0, 1], direction: 1, targetAngle: 90,
    targetFaceIds: [selected.id]
  });

  assert.deepEqual(selective.faces.find(face => face.id === untouched.id), before);
  assert.ok(selective.faces.filter(face => face.id.includes('fold-2')).length > 0);
  const seeded = applyPanelFold(stacked, {
    start: [0, -1], end: [0, 1], direction: -1, targetAngle: 90,
    seedFaceId: selected.id
  });
  assert.deepEqual(seeded.faces.find(face => face.id === untouched.id), before);
  assert.strictEqual(applyPanelFold(stacked, {
    start: [0, -1], end: [0, 1], direction: 1, targetAngle: 90,
    targetFaceIds: ['missing-face']
  }), stacked);
  assert.strictEqual(applyPanelFold(stacked, {
    start: [0, -1], end: [0, 1], direction: 1, targetAngle: 90,
    targetFaceIds: stacked.faces.map(face => face.id)
  }), stacked);
});

test('fold angles are freely editable through 180, 90, 0, and 180 with deterministic replay', () => {
  const original = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], direction: 1, targetAngle: 180
  });
  const foldId = original.commands[0].id;
  const ninety = updateFoldAngle(original, foldId, 90);
  const flat = updateFoldAngle(ninety, foldId, 0);
  const refolded = updateFoldAngle(flat, foldId, 180);

  assert.equal(ninety.commands[0].targetAngle, 90);
  assert.ok(ninety.faces.some(face => face.vertices3d.some(point => point[2] > .9)));
  assert.equal(flat.commands.length, 1);
  assert.equal(flat.commands[0].targetAngle, 0);
  assert.ok(flat.faces.every(face => face.vertices3d.every(point => Math.abs(point[2]) < 1e-9)));
  assert.deepEqual(refolded, original);
  for (const state of [ninety, flat, refolded]) {
    assert.deepEqual(replayFoldCommands(serializeFoldCommands(state)), state);
  }
  assert.strictEqual(updateFoldAngle(original, 'missing-fold', 90), original);
  assert.strictEqual(updateFoldAngle(original, foldId, NaN), original);
});

test('a fold can be removed by id and the remaining command sequence is replayed atomically', () => {
  const first = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], direction: 1, targetAngle: 180
  });
  const second = applyPanelFold(first, {
    start: [0, -1], end: [0, 1], direction: -1, targetAngle: 180
  });
  const removed = removeFold(second, second.commands[1].id);

  assert.deepEqual(removed, first);
  assert.deepEqual(replayFoldCommands(serializeFoldCommands(removed)), removed);
  assert.strictEqual(removeFold(second, 'missing-fold'), second);
  // Removing a command that created IDs referenced later cannot partially mutate state.
  const selective = applyPanelFold(first, {
    start: [0, -1], end: [0, 1], direction: 1, targetAngle: 90,
    targetFaceIds: [first.faces[0].id]
  });
  assert.strictEqual(removeFold(selective, first.commands[0].id), selective);
});

test('paper flip is a replayable physical action distinct from camera state and is involutive', () => {
  const folded = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], direction: 1, targetAngle: 90
  });
  const flipped = flipPaper(folded);
  const restored = flipPaper(flipped);

  assert.equal(folded.paperSide, 'front');
  assert.equal(flipped.paperSide, 'back');
  assert.equal(flipped.commands.at(-1).type, 'flip');
  assert.deepEqual(restored.faces, folded.faces);
  assert.equal(restored.paperSide, 'front');
  assert.deepEqual(replayFoldCommands(serializeFoldCommands(restored)), restored);
});

test('two consecutive user flips compact away and exactly restore the prior model', () => {
  const folded = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], direction: 1, targetAngle: 90
  });

  const restored = flipPaper(flipPaper(folded));

  assert.deepEqual(restored, folded);
  assert.equal(restored.commands.filter(command => command.type === 'flip').length, 0);
});

test('interleaved flips do not consume the ten-fold allowance', () => {
  let model = createPaperModel();
  const candidates = [
    [[-1, 0], [1, 0], 1],
    [[1, 0], [-1, 0], -1],
    [[-1, 0], [1, 0], -1],
    [[1, 0], [-1, 0], 1]
  ];
  const applyNextFold = current => {
    for (const [start, end, foldDirection] of candidates) {
      const next = applyFold(current, start, end, foldDirection);
      if (next !== current) return next;
    }
    return current;
  };

  for (let index = 0; index < 9; index += 1) {
    const folded = applyNextFold(model);
    assert.notStrictEqual(folded, model, `fold ${index + 1} should be accepted`);
    model = flipPaper(folded);
  }
  const tenth = applyNextFold(model);

  assert.notStrictEqual(tenth, model);
  assert.equal(tenth.folds.length, 10);
  assert.equal(tenth.commands.filter(command => command.type === 'fold').length, 10);
  assert.equal(tenth.commands.filter(command => command.type === 'flip').length, 9);
  assert.deepEqual(replayFoldCommands(serializeFoldCommands(tenth)), tenth);
});

test('replay retains required ids even when its wire payload contains consecutive flips', () => {
  const commands = [
    {
      type: 'fold', version: 2, id: 'fold-1', start: [-1, 0], end: [1, 0],
      direction: 1, targetAngle: 90
    },
    { type: 'flip', version: 2, id: 'flip-2' },
    { type: 'flip', version: 2, id: 'flip-3' }
  ];

  const replayed = replayFoldCommands(commands);

  assert.ok(replayed);
  assert.deepEqual(replayed.commands.map(command => command.id), ['fold-1', 'flip-2', 'flip-3']);
  assert.equal(serializeFoldCommands(replayed), JSON.stringify(commands));
});

test('versioned replay rejects malformed, oversized, non-finite, and dangling identifiers', () => {
  const valid = {
    type: 'fold', version: 2, id: 'fold-1', start: [-1, 0], end: [1, 0],
    direction: 1, targetAngle: 90
  };
  assert.equal(replayFoldCommands([{ ...valid, targetAngle: NaN }]), null);
  assert.equal(replayFoldCommands([{ ...valid, targetFaceIds: ['missing-face'] }]), null);
  assert.equal(replayFoldCommands([{ ...valid, id: 'wrong-id' }]), null);
  assert.equal(replayFoldCommands([valid, { ...valid, start: [0, -1], end: [0, 1] }]), null);
  assert.equal(replayFoldCommands(JSON.stringify([valid]) + ' '.repeat(4097)), null);
  assert.equal(replayFoldCommands(Array.from({ length: 21 }, (_, index) => ({
    type: 'flip', version: 2, id: `flip-${index + 1}`
  }))), null);
  assert.equal(replayFoldCommands([{ type: 'flip', version: 2, id: 'fold-9' }]), null);

  const legacy = replayFoldCommands([{ start: [-1, 0], end: [1, 0], direction: 1 }]);
  assert.ok(legacy);
  assert.equal(legacy.commands[0].type, 'fold');
  assert.equal(legacy.commands[0].targetAngle, 180);
});

function approxPoint3d(actual, expected, tolerance = 1e-8) {
  assert.equal(actual.length, 3);
  actual.forEach((value, axis) => {
    assert.ok(Math.abs(value - expected[axis]) <= tolerance,
      `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  });
}

test('a sequential material-space fold on an edge-on panel preserves every face and physical area', () => {
  const first = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], coordinateSpace: 'material',
    direction: 1, targetAngle: 90
  });
  const tilted = first.faces.find(face => face.folds.includes(first.commands[0].id));
  const second = applyPanelFold(first, {
    start: [0, 0], end: [0, 1], coordinateSpace: 'material',
    direction: 1, targetAngle: 90, seedFaceId: tilted.id
  });

  assert.notStrictEqual(second, first);
  assert.equal(first.faces.length, 2);
  assert.equal(second.faces.length, 3);
  assert.ok(Math.abs(physicalArea3d(second.faces) - 4) < 1e-8);
  assert.ok(second.faces.every(face => face.materialPoly.length === face.vertices3d.length));

  // One material crease on non-coplanar panels has no single physical hinge.
  // Reject the whole command rather than silently dropping an edge-on face.
  const unsupported = applyPanelFold(first, {
    start: [0, -1], end: [0, 1], coordinateSpace: 'material',
    direction: 1, targetAngle: 90
  });
  assert.strictEqual(unsupported, first);
  assert.ok(Math.abs(physicalArea3d(first.faces) - 4) < 1e-8);
});

test('a crease on a tilted selected panel uses its material seam as the actual 3D hinge', () => {
  const first = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], coordinateSpace: 'material',
    direction: 1, targetAngle: 60
  });
  const tilted = first.faces.find(face => face.folds.includes('fold-1'));
  const second = applyPanelFold(first, {
    start: [0, 0], end: [0, 1], coordinateSpace: 'material',
    direction: -1, targetAngle: 90, seedFaceId: tilted.id
  });
  const fold = second.folds.find(item => item.id === second.commands[1].id);

  approxPoint3d(fold.axis3d[0], [0, 0, 0]);
  approxPoint3d(fold.axis3d[1], [0, .5, Math.sqrt(3) / 2]);
  assert.ok(fold.axis3d[1][2] > .8, 'the second hinge must not be forced onto z=0');

  const children = second.faces.filter(face => face.id.startsWith(`${tilted.id}:${fold.id}:`));
  assert.equal(children.length, 2);
  const seamVertices = children.map(face => face.materialPoly
    .map((point, index) => ({ material: point, spatial: face.vertices3d[index] }))
    .filter(vertex => Math.abs(vertex.material[0]) < 1e-9)
    .map(vertex => vertex.spatial));
  assert.ok(seamVertices.every(vertices => vertices.length >= 2));
  for (const expected of seamVertices[0]) {
    assert.ok(seamVertices[1].some(actual => actual.every((value, axis) =>
      Math.abs(value - expected[axis]) < 1e-8)));
  }
});

test('editing an earlier angle replays two dependent seed folds with stable topology and geometry', () => {
  const first = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], coordinateSpace: 'material',
    direction: 1, targetAngle: 90
  });
  const firstMoved = first.faces.find(face => face.folds.includes('fold-1'));
  const second = applyPanelFold(first, {
    start: [0, 0], end: [0, 1], coordinateSpace: 'material',
    direction: 1, targetAngle: 70, seedFaceId: firstMoved.id
  });
  const secondMoved = second.faces.find(face => face.folds.includes('fold-2'));
  const third = applyPanelFold(second, {
    start: [0, .5], end: [-1, .5], coordinateSpace: 'material',
    direction: -1, targetAngle: 35, seedFaceId: secondMoved.id
  });

  const edited = updateFoldAngle(third, 'fold-1', 45);
  const expectedFirst = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], coordinateSpace: 'material',
    direction: 1, targetAngle: 45, id: 'fold-1'
  });
  const expectedSecond = applyPanelFold(expectedFirst, {
    start: [0, 0], end: [0, 1], coordinateSpace: 'material',
    direction: 1, targetAngle: 70, seedFaceId: firstMoved.id, id: 'fold-2'
  });
  const expected = applyPanelFold(expectedSecond, {
    start: [0, .5], end: [-1, .5], coordinateSpace: 'material',
    direction: -1, targetAngle: 35, seedFaceId: secondMoved.id, id: 'fold-3'
  });

  assert.notStrictEqual(edited, third);
  assert.notStrictEqual(expected, expectedSecond);
  assert.deepEqual(edited, expected);
  assert.deepEqual(replayFoldCommands(serializeFoldCommands(edited)), edited);
  assert.equal(edited.commands.length, 3);
  assert.equal(edited.faces.length, third.faces.length);
  assert.deepEqual(edited.faces.map(face => face.id), third.faces.map(face => face.id));
  assert.ok(Math.abs(physicalArea3d(edited.faces) - 4) < 1e-8);
});

test('removing an earlier general fold keeps later command ids and only rejects true dangling seeds', () => {
  const first = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], coordinateSpace: 'material',
    direction: 1, targetAngle: 180
  });
  const independent = applyPanelFold(first, {
    start: [0, -1], end: [0, 1], coordinateSpace: 'material',
    direction: -1, targetAngle: 90
  });
  const removed = removeFold(independent, 'fold-1');

  assert.notStrictEqual(removed, independent);
  assert.deepEqual(removed.commands.map(command => command.id), ['fold-2']);
  assert.deepEqual(removed.folds.map(fold => fold.id), ['fold-2']);
  assert.equal(removed.faces.length, 2);
  assert.ok(Math.abs(physicalArea3d(removed.faces) - 4) < 1e-8);
  assert.deepEqual(replayFoldCommands(serializeFoldCommands(removed)), removed);

  const firstMoved = first.faces.find(face => face.folds.includes('fold-1'));
  const dependent = applyPanelFold(first, {
    start: [0, 0], end: [0, 1], coordinateSpace: 'material',
    direction: 1, targetAngle: 90, seedFaceId: firstMoved.id
  });
  assert.strictEqual(removeFold(dependent, 'fold-1'), dependent);
});

test('legacy in-memory models without 3D, face ids, or extended fold fields never throw', () => {
  const legacy = {
    faces: [
      { poly: [[-1, -1], [1, -1], [1, 0], [-1, 0]], layer: 0, folds: [] },
      { poly: [[-1, -1], [1, -1], [1, 0], [-1, 0]], layer: 1, folds: [0] }
    ],
    folds: [{ A: [-1, 0], d: [1, 0], dir: 1 }],
    history: [],
    commands: [{ start: [-1, 0], end: [1, 0], direction: 1 }]
  };
  const before = JSON.stringify(legacy);

  let folded;
  let flipped;
  assert.doesNotThrow(() => { folded = applyFold(legacy, [0, -1], [0, 1], -1); });
  assert.doesNotThrow(() => { flipped = flipPaper(legacy); });
  assert.equal(JSON.stringify(legacy), before);
  assert.ok(folded && flipped);
});

test('seedFaceId metadata defines selective unfold and preserves every other physical face', () => {
  const base = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], coordinateSpace: 'material',
    direction: 1, targetAngle: 180
  });
  const seed = base.faces.find(face => face.folds.includes('fold-1'));
  const other = base.faces.find(face => face.id !== seed.id);
  const selective = applyPanelFold(base, {
    start: [0, 0], end: [0, 1], coordinateSpace: 'material',
    direction: 1, targetAngle: 180, seedFaceId: seed.id
  });

  assert.equal(selective.commands[1].seedFaceId, seed.id);
  assert.equal(selective.folds[1].seedFaceId, seed.id);
  for (const angle of [90, 0, 180]) {
    const adjusted = updateFoldAngle(selective, 'fold-2', angle);
    assert.equal(adjusted.commands[1].targetAngle, angle);
    assert.deepEqual(adjusted.faces.find(face => face.id === other.id), other);
    assert.ok(adjusted.faces.some(face => face.folds.includes('fold-2')));
    assert.ok(Math.abs(physicalArea3d(adjusted.faces) - 4) < 1e-8);
  }
});
