'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildStatsRows } = require('../public/fold-stats-view.js');
const { createPaperModel, createPresetModel } = require('../public/paper-fold-model.js');
const { deriveAerodynamicProfile } = require('../public/paper-aero-profile.js');

const flatProfile = deriveAerodynamicProfile(createPaperModel());
const dartProfile = deriveAerodynamicProfile(createPresetModel('dart'));

test('다섯 개 스탯 행을 순서대로 만든다', () => {
  const rows = buildStatsRows(flatProfile, null);
  assert.deepStrictEqual(
    rows.map(row => row.key),
    ['liftScale', 'dragScale', 'stability', 'stallSpeed', 'rollBias']
  );
  rows.forEach(row => {
    assert.ok(Number.isInteger(row.percent) && row.percent >= 0 && row.percent <= 100);
    assert.strictEqual(typeof row.label, 'string');
    assert.strictEqual(typeof row.text, 'string');
    assert.strictEqual(row.delta, 'same');
    assert.strictEqual(typeof row.good, 'boolean');
  });
});

test('직전 프로필 대비 증감을 표시한다', () => {
  const rows = buildStatsRows(dartProfile, flatProfile);
  const byKey = Object.fromEntries(rows.map(row => [row.key, row]));
  assert.strictEqual(byKey.liftScale.delta, dartProfile.liftScale > flatProfile.liftScale ? 'up' : 'down');
  assert.strictEqual(byKey.dragScale.delta, dartProfile.dragScale > flatProfile.dragScale ? 'up' : 'down');
});

test('rollBias는 균형/좌/우 문구로 표시한다', () => {
  const balanced = buildStatsRows(dartProfile, null).find(row => row.key === 'rollBias');
  assert.strictEqual(balanced.text, '균형');
  assert.strictEqual(balanced.good, true);
  const tilted = buildStatsRows({ ...dartProfile, rollBias: -0.3 }, null).find(row => row.key === 'rollBias');
  assert.ok(tilted.text.startsWith('좌'));
  assert.strictEqual(tilted.good, false);
});

test('프로필이 없으면 빈 배열', () => {
  assert.deepStrictEqual(buildStatsRows(null, null), []);
});
