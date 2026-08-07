const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  getLaunchPose,
  getLaunchMotion,
  getLaunchCameraPlan,
  localDeadline,
  shouldReuseFoldedVisual,
  getLaunchLayoutKey
} = require('../public/launch-transition.js');

test('launch motion advances across the roof with an active running stride', () => {
  const waiting = getLaunchMotion(0.04);
  const earlyRun = getLaunchMotion(0.22);
  const lateRun = getLaunchMotion(0.54);
  const jumping = getLaunchMotion(0.72);

  assert.equal(waiting.runProgress, 0);
  assert.equal(waiting.stride, 0);
  assert.ok(earlyRun.runProgress > 0 && earlyRun.runProgress < lateRun.runProgress);
  assert.ok(lateRun.runProgress < 1);
  assert.ok(Math.abs(earlyRun.stride) > 0.2);
  assert.equal(jumping.runProgress, 1);
  assert.equal(jumping.stride, 0);
});

test('launch camera frames the whole roof from a fixed elevated three-quarter view', () => {
  const plan = getLaunchCameraPlan(
    { x: 0, y: 150, z: 16 },
    { x: 0, y: 150, z: 3 }
  );

  assert.deepEqual(plan.target, { x: 0, y: 152.5, z: 9.5 });
  assert.ok(plan.position.y - plan.target.y >= 30);
  assert.ok(Math.hypot(plan.position.x - plan.target.x, plan.position.z - plan.target.z) >= 7);
  assert.equal(plan.pathLength, 13);
});
test('launch keeps full-size legs visible until the rooftop drop', () => {
  const pose = getLaunchPose(0.66);
  assert.equal(pose.legsVisible, true);
  assert.equal(pose.poofProgress, 0);
  assert.equal(pose.poofOpacity, 0);
  assert.equal(pose.bodyPitch, Math.PI / 2);
  assert.equal(pose.showFlightCraft, false);
});

test('the rooftop drop hides both legs at once and triggers a short poof', () => {
  const pose = getLaunchPose(0.72);
  assert.equal(pose.legsVisible, false);
  assert.ok(pose.poofProgress > 0 && pose.poofProgress < 1);
  assert.ok(pose.poofOpacity > 0 && pose.poofOpacity <= 1);
  assert.equal(pose.showFlightCraft, false);
});

test('only the completed launch swaps to the actual flight craft', () => {
  const pose = getLaunchPose(1);
  assert.equal(pose.legsVisible, false);
  assert.equal(pose.poofOpacity, 0);
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
