'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  createPaperModel,
  createPresetModel,
  getPresetCommands,
  presetNames,
  undoFold,
  serializeFoldCommands,
  computeFoldedGeometry
} = require('../public/paper-fold-model.js');
const { deriveAerodynamicProfile } = require('../public/paper-aero-profile.js');

test('dart 프리셋이 리플레이 검증을 통과한 모델을 만든다', () => {
  const model = createPresetModel('dart');
  assert.ok(model, 'preset replay must succeed');
  assert.strictEqual(model.commands.length, 4);
  assert.ok(serializeFoldCommands(model).length <= 4096);
  assert.ok(presetNames.includes('dart'));
});

test('dart 커맨드는 전개도 기준 좌우 대칭이다', () => {
  // 각 커맨드의 좌우 미러(시작·끝을 맞바꿔 접히는 쪽 유지)가 반드시 존재해야 한다.
  const commands = getPresetCommands('dart');
  const mirrored = command => ({
    start: [-command.end[0], command.end[1]],
    end: [-command.start[0], command.start[1]],
    angle: command.angle
  });
  commands.forEach(command => {
    const twin = mirrored(command);
    assert.ok(commands.some(other =>
      Math.abs(other.start[0] - twin.start[0]) < 1e-9 &&
      Math.abs(other.start[1] - twin.start[1]) < 1e-9 &&
      Math.abs(other.end[0] - twin.end[0]) < 1e-9 &&
      Math.abs(other.end[1] - twin.end[1]) < 1e-9 &&
      Math.abs(other.angle - twin.angle) < 1e-9
    ), `mirror of ${JSON.stringify(command)} missing`);
  });
});

test('dart 3D 기하는 좌우 대칭이고 날개 상반각을 가진다', () => {
  const geometry = computeFoldedGeometry(createPresetModel('dart'));
  const vertices = geometry.faces.flatMap(face => face.vertices3);
  // 어떤 정점 (x,y,z)에도 미러 정점 (-x,y,z)가 존재한다.
  vertices.forEach(vertex => {
    assert.ok(vertices.some(other =>
      Math.abs(other[0] + vertex[0]) < 1e-9 &&
      Math.abs(other[1] - vertex[1]) < 1e-9 &&
      Math.abs(other[2] - vertex[2]) < 1e-9
    ), `mirror of ${JSON.stringify(vertex)} missing`);
  });
  // 날개가 시트 위로 들려 상반각을 만든다 (아래로 꺼지는 부분은 없다).
  assert.ok(geometry.maxY > 0.3, `maxY ${geometry.maxY}`);
  assert.ok(geometry.minY > -1e-9, `minY ${geometry.minY}`);
  // 코너 접기(180°)가 실제로 종이를 겹친다: 깊이 2 면이 좌우로 존재한다.
  assert.strictEqual(geometry.faces.filter(face => face.foldDepth === 2).length, 2);
});

test('dart 프리셋은 균형 잡힌 비행 프로필을 만든다', () => {
  // Task 2: deriveAerodynamicProfile이 computeFoldedGeometry(3D) 기반으로
  // 바뀐 뒤 dart 프리셋 실측값(liftScale≈.716, rollBias=0, pitchBias≈.074,
  // stability≈1.13, dihedral≈.175)에 맞춰 확정한 임계값. stability는 평평한
  // 종이(≈1.12) 대비 상반각 덕분에 더 높아야 한다는 상대 비교로 검증한다.
  const profile = deriveAerodynamicProfile(createPresetModel('dart'));
  const flat = deriveAerodynamicProfile(createPaperModel());
  assert.ok(profile.liftScale >= 0.6, `liftScale ${profile.liftScale}`);
  assert.ok(Math.abs(profile.rollBias) <= 0.01, `rollBias ${profile.rollBias}`);
  assert.ok(Math.abs(profile.pitchBias) <= 0.1, `pitchBias ${profile.pitchBias}`);
  assert.ok(profile.stability > flat.stability, `stability ${profile.stability} <= flat ${flat.stability}`);
  assert.ok(profile.dihedral >= 0.1, `dihedral ${profile.dihedral}`);
});

test('dart 프리셋은 한 단계씩 되돌릴 수 있다', () => {
  let model = createPresetModel('dart');
  for (let remaining = 4; remaining > 0; remaining -= 1) {
    assert.strictEqual(model.commands.length, remaining);
    model = undoFold(model);
  }
  assert.strictEqual(model.commands.length, 0);
  assert.strictEqual(model.faces.length, 1);
});

test('getPresetCommands는 방어적 복사본을 준다', () => {
  const first = getPresetCommands('dart');
  first[0].start[0] = 99;
  first[0].angle = 99;
  const second = getPresetCommands('dart');
  assert.strictEqual(second[0].start[0], 0.5);
  assert.strictEqual(second[0].angle, 0.9);
});

test('없는 프리셋 이름은 null을 돌려준다', () => {
  assert.strictEqual(createPresetModel('nope'), null);
  assert.strictEqual(getPresetCommands('nope'), null);
});
