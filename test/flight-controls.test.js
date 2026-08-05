const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  updateAttitude,
  updateFreeLook,
  keyGuideVisibleFromStorage
} = require('../public/flight-controls.js');

test('DIST flight keeps its attitude without automatic forward alignment', () => {
  const state = { yaw: 1.7, pitch: 1.2, roll: 0.8 };
  const next = updateAttitude(state, {}, 0.5, 'DIST');

  assert.ok(Math.abs(next.pitch - state.pitch) < 1e-9);
  assert.ok(Math.abs(next.roll - state.roll) < 1e-9);
  assert.ok(next.yaw > state.yaw, 'bank angle should continue turning the aircraft');
});

test('DIST flight supports complete loops and rolls instead of angle clamps', () => {
  const state = { yaw: 0, pitch: -3.05, roll: 3.05 };
  const next = updateAttitude(state, { KeyW: true, KeyA: true }, 0.2, 'DIST');

  assert.ok(next.pitch > 2.9, `pitch should wrap through -π, got ${next.pitch}`);
  assert.ok(next.roll < -2.8, `roll should wrap through π, got ${next.roll}`);
});

test('ARENA keeps its existing assisted attitude limits without pulling yaw toward zero', () => {
  const state = { yaw: 0.4, pitch: 0.5, roll: 0 };
  const next = updateAttitude(state, {}, 0.5, 'ARENA');

  assert.ok(Math.abs(next.pitch + 0.09) < Math.abs(state.pitch + 0.09));
  assert.equal(next.roll, 0);
  assert.ok(Math.abs(next.yaw - state.yaw) < 1e-12);
  assert.ok(next.pitch >= -0.95 && next.pitch <= 0.75);
  assert.ok(next.roll >= -0.95 && next.roll <= 0.95);
});

test('DIST bank-to-turn remains continuous across the full-roll wrap boundary', () => {
  const positive = updateAttitude({ yaw: 0, pitch: 0, roll: Math.PI - 0.01 }, {}, 0.05, 'DIST');
  const negative = updateAttitude({ yaw: 0, pitch: 0, roll: -Math.PI + 0.01 }, {}, 0.05, 'DIST');

  assert.ok(Math.abs(positive.yaw) < 0.002, `positive wrap turn was ${positive.yaw}`);
  assert.ok(Math.abs(negative.yaw) < 0.002, `negative wrap turn was ${negative.yaw}`);
});

test('DIST full-roll steering is effectively frame-rate independent', () => {
  function simulate(hz) {
    let state = { yaw: 0, pitch: 0, roll: 0 };
    const dt = 1 / hz;
    for (let i = 0; i < hz * 10; i++) state = updateAttitude(state, { KeyA: true }, dt, 'DIST');
    return state;
  }
  const low = simulate(20);
  const high = simulate(120);
  const yawDifference = Math.abs(Math.atan2(Math.sin(low.yaw - high.yaw), Math.cos(low.yaw - high.yaw)));
  assert.ok(yawDifference < 0.02, `20Hz/120Hz yaw differed by ${yawDifference}rad`);
});

test('mouse free-look rotates continuously and clamps only the vertical view', () => {
  const first = updateFreeLook({ yaw: 0, pitch: 0 }, 900, -900);
  const second = updateFreeLook(first, 900, 900);

  assert.ok(first.yaw < 0);
  assert.equal(first.pitch, 1.35);
  assert.ok(second.yaw !== first.yaw);
  assert.ok(second.yaw >= -Math.PI && second.yaw <= Math.PI);
  assert.ok(second.pitch >= -1.35 && second.pitch <= 1.35);
});

test('the key guide is visible by default and can be persisted off', () => {
  assert.equal(keyGuideVisibleFromStorage(null), true);
  assert.equal(keyGuideVisibleFromStorage('1'), true);
  assert.equal(keyGuideVisibleFromStorage('0'), false);
});
