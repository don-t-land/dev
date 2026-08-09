'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildStatsRows } = require('../public/fold-stats-view.js');
const { createPaperModel, createPresetModel } = require('../public/paper-fold-model.js');
const { deriveAerodynamicProfile } = require('../public/paper-aero-profile.js');

const flatProfile = deriveAerodynamicProfile(createPaperModel());
const dartProfile = deriveAerodynamicProfile(createPresetModel('dart'));

test('일곱 개 스탯 행에 최고속도와 선회력을 포함한다', () => {
  const rows = buildStatsRows(flatProfile, null);
  assert.deepStrictEqual(
    rows.map(row => row.key),
    ['maxSpeed', 'liftScale', 'dragScale', 'rollRateScale', 'stability', 'stallSpeed', 'rollBias']
  );
  rows.forEach(row => {
    assert.ok(Number.isInteger(row.percent) && row.percent >= 0 && row.percent <= 100);
    assert.strictEqual(typeof row.label, 'string');
    assert.strictEqual(typeof row.text, 'string');
    assert.strictEqual(row.delta, 'same');
    assert.strictEqual(typeof row.good, 'boolean');
  });
  assert.strictEqual(rows.find(row => row.key === 'maxSpeed').text, `${Math.round(flatProfile.maxSpeed * 3.6)} km/h`);
  assert.strictEqual(rows.find(row => row.key === 'rollRateScale').text, `${Math.round(flatProfile.rollRateScale * 100)}%`);
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
