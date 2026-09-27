'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  createPaperModel, applyFold, computeFoldedGeometry, replayFoldCommands
} = require('../public/paper-fold-model.js');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function vertexNear(geometry, target, eps = 1e-6) {
  return geometry.faces.some(face => face.vertices3.some(v =>
    close(v[0], target[0], eps) && close(v[1], target[1], eps) && close(v[2], target[2], eps)));
}

test('평평한 종이의 3D 배치는 y=0 평면이다', () => {
  const geometry = computeFoldedGeometry(createPaperModel());
  assert.strictEqual(geometry.faces.length, 1);
  geometry.faces[0].vertices3.forEach(v => assert.ok(close(v[1], 0)));
  assert.ok(vertexNear(geometry, [-1, 0, 1]));   // 전개도 (-1,-1) → (x,0,-y)
});

test('세로선 +90° 접기는 왼쪽 절반을 위로 세운다', () => {
  const model = applyFold(createPaperModel(), [0, -1], [0, 1], Math.PI / 2);
  assert.strictEqual(model.faces.length, 2);
  const geometry = computeFoldedGeometry(model);
  // 전개도 (-1,1): 축 x=0 기준 90° 회전 → (0, 1, -1)
  assert.ok(vertexNear(geometry, [0, 1, -1]));
  // 오른쪽 절반은 제자리: 전개도 (1,1) → (1,0,-1)
  assert.ok(vertexNear(geometry, [1, 0, -1]));
});

test('순차 접기의 축은 부모 회전을 따라간다', () => {
  // 1) x=0 세로선 +90°로 왼쪽을 세운 뒤, 2) 세워진 왼쪽 면 위 x=-0.5(전개도) 세로선을 +90° 접으면
  // 두 번째 축은 이미 세워진 평면 위에 있으므로, 전개도 (-1,y)는 (0.5, 1, -y) 근방으로 온다
  let model = applyFold(createPaperModel(), [0, -1], [0, 1], Math.PI / 2);
  model = applyFold(model, [-0.5, -1], [-0.5, 1], Math.PI / 2);
  const geometry = computeFoldedGeometry(model);
  // 전개도 (-0.5,*)는 첫 접기로 (0, 0.5, *)에 위치. 그 선이 두 번째 축.
  // 전개도 (-1,1): 두 번째 회전으로 축에서 0.5 거리만큼 +x쪽으로 → (0.5, 0.5, -1)
  assert.ok(vertexNear(geometry, [0.5, 0.5, -1]));
});

test('강체 컴포넌트만 분할된다', () => {
  // 왼쪽을 90° 세운 상태에서 오른쪽 절반(베이스)에만 선을 그으면 왼쪽 면들은 분할되지 않는다
  let model = applyFold(createPaperModel(), [0, -1], [0, 1], Math.PI / 2);
  model = applyFold(model, [0.5, -1], [0.5, 1], Math.PI / 4);
  // 면 구성: 왼쪽 1개(분할 안 됨) + 오른쪽이 2개로
  assert.strictEqual(model.faces.length, 3);
});

test('접힌 힌지를 가로지르는 접기는 거부된다', () => {
  // 코너를 접어 만든 플랩의 힌지를 가로지르는 새 접는선은 원본 모델을 반환
  let model = applyFold(createPaperModel(), [0, 1], [1, 0], Math.PI); // 우상단 코너 180°
  const before = model;
  model = applyFold(model, [0.2, -1], [0.2, 1], Math.PI / 2); // x=0.2 선은 힌지 (0,1)-(1,0)을 가로지름
  assert.strictEqual(model, before);
});

test('무효 커맨드는 거부된다', () => {
  const model = createPaperModel();
  assert.strictEqual(applyFold(model, [0, -1], [0, 1], 0.01), model);        // 각도 너무 작음
  assert.strictEqual(applyFold(model, [0, -1], [0, 1], Math.PI + 0.1), model); // 범위 초과
  assert.strictEqual(applyFold(model, [0, -1], [0, 1], Number.NaN), model);
  assert.strictEqual(applyFold(model, [0, 0], [0.01, 0], Math.PI / 2), model); // 선 너무 짧음
  assert.strictEqual(applyFold(model, [5, -1], [5, 1], Math.PI / 2), model);   // 종이 밖
});

test('직렬화 왕복과 리플레이', () => {
  let model = applyFold(createPaperModel(), [0, -1], [0, 1], Math.PI / 2);
  model = applyFold(model, [0.5, -1], [0.5, 1], -Math.PI / 3);
  const { serializeFoldCommands } = require('../public/paper-fold-model.js');
  const json = serializeFoldCommands(model);
  assert.ok(json.length <= 4096);
  const replayed = replayFoldCommands(json);
  assert.ok(replayed);
  assert.strictEqual(replayed.commands.length, 2);
  assert.ok(close(replayed.commands[1].angle, -Math.PI / 3));
});
