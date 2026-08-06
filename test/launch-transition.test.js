const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  getLaunchPose,
  localDeadline,
  shouldReuseFoldedVisual,
  getLaunchLayoutKey
} = require('../public/launch-transition.js');

test('launch starts with an upright folded body and fully visible legs', () => {
  const pose = getLaunchPose(0.5);
  assert.equal(pose.legFade, 0);
  assert.equal(pose.bodyPitch, Math.PI / 2);
  assert.equal(pose.showFlightCraft, false);
});

test('jump naturally folds the body into flight while fading the legs', () => {
  const pose = getLaunchPose(0.75);
  assert.ok(pose.legFade > 0 && pose.legFade < 1);
  assert.ok(pose.bodyPitch > 0 && pose.bodyPitch < Math.PI / 2);
  assert.equal(pose.showFlightCraft, false);
});

test('only the completed launch swaps to the actual flight craft', () => {
  const pose = getLaunchPose(1);
  assert.equal(pose.legFade, 1);
  assert.equal(pose.bodyPitch, 0);
  assert.equal(pose.showFlightCraft, true);
});

test('server deadlines are translated to the local clock without inheriting clock skew', () => {
  assert.equal(localDeadline(100_000, 95_000, 5_000, 4_400), 10_000);
  assert.equal(localDeadline(undefined, undefined, 5_000, 4_400), 9_400);
});

test('a cached command key is reusable only when the visual presence also matches', () => {
  assert.equal(shouldReuseFoldedVisual('[]', false, '[]', true), false);
  assert.equal(shouldReuseFoldedVisual('[]', true, '[]', true), true);
  assert.equal(shouldReuseFoldedVisual('old', true, 'new', true), false);
});

test('launch tower layout keys change when folding departures change the participant count', () => {
  assert.notEqual(
    getLaunchLayoutKey('DIST', 17, ['host', 'guest']),
    getLaunchLayoutKey('DIST', 17, ['guest'])
  );
  assert.notEqual(
    getLaunchLayoutKey('ARENA', 17, ['a', 'b', 'c', 'd']),
    getLaunchLayoutKey('ARENA', 17, ['a', 'b', 'c'])
  );
  assert.equal(
    getLaunchLayoutKey('DIST', 17, ['a', 'b']),
    getLaunchLayoutKey('DIST', 17, ['x', 'y'])
  );
});
