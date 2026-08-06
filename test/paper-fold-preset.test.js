'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  createPresetModel,
  getPresetCommands,
  presetNames,
  undoFold,
  serializeFoldCommands
} = require('../public/paper-fold-model.js');
const { deriveAerodynamicProfile } = require('../public/paper-aero-profile.js');

test('dart 프리셋이 리플레이 검증을 통과한 모델을 만든다', () => {
  const model = createPresetModel('dart');
  assert.ok(model, 'preset replay must succeed');
  assert.strictEqual(model.commands.length, 5);
  assert.ok(serializeFoldCommands(model).length <= 4096);
  assert.ok(presetNames.includes('dart'));
});

test('dart 프리셋은 균형 잡힌 비행 프로필을 만든다', () => {
  const profile = deriveAerodynamicProfile(createPresetModel('dart'));
  assert.ok(profile.liftScale >= 0.65, `liftScale ${profile.liftScale}`);
  assert.ok(Math.abs(profile.rollBias) <= 0.01, `rollBias ${profile.rollBias}`);
  assert.ok(Math.abs(profile.pitchBias) <= 0.1, `pitchBias ${profile.pitchBias}`);
  assert.ok(profile.stability >= 1.0, `stability ${profile.stability}`);
});

test('dart 프리셋은 한 단계씩 되돌릴 수 있다', () => {
  let model = createPresetModel('dart');
  for (let remaining = 5; remaining > 0; remaining -= 1) {
    assert.strictEqual(model.commands.length, remaining);
    model = undoFold(model);
  }
  assert.strictEqual(model.commands.length, 0);
  assert.strictEqual(model.faces.length, 1);
});

test('getPresetCommands는 방어적 복사본을 준다', () => {
  const first = getPresetCommands('dart');
  first[0].start[0] = 99;
  const second = getPresetCommands('dart');
  assert.strictEqual(second[0].start[0], 0);
});

test('없는 프리셋 이름은 null을 돌려준다', () => {
  assert.strictEqual(createPresetModel('nope'), null);
  assert.strictEqual(getPresetCommands('nope'), null);
});
