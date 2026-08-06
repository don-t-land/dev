const assert = require('node:assert/strict');
const test = require('node:test');

const viewport = require('../public/paper-fold-viewport.js');

const flatFace = {
  id: 'flat',
  materialPoly: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
  vertices3d: [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]],
  layer: 0
};

const standingFace = {
  id: 'standing',
  materialPoly: [[-1, 0], [1, 0], [1, 1], [-1, 1]],
  vertices3d: [[-1, 0, 0], [1, 0, 0], [1, 0, 1], [-1, 0, 1]],
  layer: 1
};

function closePoint(actual, expected, epsilon = 1e-8) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(
    Math.abs(value - expected[index]) <= epsilon,
    `${actual} != ${expected}`
  ));
}

test('UMD viewport exposes deterministic orthographic projection and hit-test math', () => {
  assert.deepEqual(Object.keys(viewport).sort(), [
    'DEFAULT_CAMERA', 'DEFAULT_ORBIT', 'cameraBasisFromOrbit', 'faceNormal', 'hitTestFaces', 'materialToScreen',
    'pointInPolygon', 'polygonArea', 'projectFace', 'projectPoint',
    'screenToMaterial'
  ]);
});

test('orbit camera basis stays orthonormal and keeps the paper center fixed', () => {
  const basis = viewport.cameraBasisFromOrbit(
    viewport.DEFAULT_ORBIT.azimuth + 0.73,
    viewport.DEFAULT_ORBIT.elevation - 0.21
  );
  const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);

  for (const axis of [basis.right, basis.up, basis.view]) {
    assert.ok(axis.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-9);
  }
  assert.ok(Math.abs(dot(basis.right, basis.up)) < 1e-9);
  assert.ok(Math.abs(dot(basis.right, basis.view)) < 1e-9);
  assert.ok(Math.abs(dot(basis.up, basis.view)) < 1e-9);

  const camera = { ...basis, scale: 120, cx: 321, cy: 234 };
  closePoint(viewport.projectPoint([0, 0, 0], camera).point, [321, 234]);
  const material = [0.23, -0.41];
  const screen = viewport.materialToScreen(flatFace, material, camera);
  closePoint(viewport.screenToMaterial(flatFace, screen, camera), material, 1e-7);
});

test('the default orbit reproduces the existing default camera basis', () => {
  const basis = viewport.cameraBasisFromOrbit(
    viewport.DEFAULT_ORBIT.azimuth,
    viewport.DEFAULT_ORBIT.elevation
  );

  closePoint(basis.right, viewport.DEFAULT_CAMERA.right);
  closePoint(basis.up, viewport.DEFAULT_CAMERA.up);
  closePoint(basis.view, viewport.DEFAULT_CAMERA.view);
});

test('flat and ninety-degree panels both have nonzero projected visible area', () => {
  const camera = { ...viewport.DEFAULT_CAMERA, scale: 120, cx: 320, cy: 240 };
  const flat = viewport.projectFace(flatFace, camera);
  const standing = viewport.projectFace(standingFace, camera);

  assert.ok(Math.abs(viewport.polygonArea(flat.points)) > 1000);
  assert.ok(Math.abs(viewport.polygonArea(standing.points)) > 1000);
  assert.ok(Math.abs(flat.facing) > 0.1);
  assert.ok(Math.abs(standing.facing) > 0.1);
});

test('hit testing picks the front projected face instead of array or layer order', () => {
  const camera = { ...viewport.DEFAULT_CAMERA, scale: 100, cx: 250, cy: 180 };
  const back = {
    ...flatFace,
    id: 'back',
    layer: 99,
    vertices3d: flatFace.vertices3d.map(([x, y]) => [x, y, -0.2])
  };
  const front = {
    ...flatFace,
    id: 'front',
    layer: -99,
    vertices3d: flatFace.vertices3d.map(([x, y]) => [x, y, 0.2])
  };
  const point = viewport.materialToScreen(front, [0, 0], camera);
  const hit = viewport.hitTestFaces([front, back], point, camera);

  assert.equal(hit.face.id, 'front');
  closePoint(hit.material, [0, 0]);
  assert.ok(hit.depth > viewport.hitTestFaces([back], point, camera).depth);
});

test('screen and material coordinates round trip on flat and standing faces', () => {
  const camera = { ...viewport.DEFAULT_CAMERA, scale: 137, cx: 412, cy: 277 };
  for (const [face, material] of [
    [flatFace, [0.31, -0.42]],
    [standingFace, [-0.27, 0.64]],
    [standingFace, [-1.2, 0.48]]
  ]) {
    const screen = viewport.materialToScreen(face, material, camera);
    assert.ok(screen, `material point should map through ${face.id}'s affine plane`);
    closePoint(viewport.screenToMaterial(face, screen, camera), material, 1e-7);
  }
});

test('flipped geometry projects deterministically without mutating input', () => {
  const camera = { ...viewport.DEFAULT_CAMERA, scale: 90, cx: 200, cy: 160 };
  const flipped = {
    ...standingFace,
    id: 'flipped',
    vertices3d: standingFace.vertices3d.map(([x, y, z]) => [-x, y, -z])
  };
  const snapshot = JSON.stringify(flipped);
  const first = viewport.projectFace(flipped, camera);
  const second = viewport.projectFace(flipped, camera);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(flipped), snapshot);
  assert.ok(Math.abs(viewport.polygonArea(first.points)) > 1000);
});
