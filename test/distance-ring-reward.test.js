'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('distance ring clear grants speed and energy through the bounded reward policy', () => {
  assert.match(html, /applyDistanceRingReward\(me\.speed, me\.energy, aeroProfile\.maxSpeed\)/);
  assert.match(html, /me\.speed = reward\.speed/);
  assert.match(html, /me\.energy = reward\.energy/);
  assert.match(html, /rapierFlight\?\.boostSpeed\(reward\.speedGain\)/);
  assert.match(html, /audioDirector\.play\('score'\)/);
  assert.match(html, /me\.ringSpeedHoldRemaining = DIST_RING_SPEED_HOLD_SECONDS/);
  assert.match(html, /maintainDistanceRingSpeed\(state\.speed, me\.ringSpeedFloor, me\.ringSpeedHoldRemaining, dt\)/);
  assert.match(html, /maintainDistanceRingSpeed\(me\.speed, me\.ringSpeedFloor, me\.ringSpeedHoldRemaining, dt\)/);
});

test('distance ring clear keeps impact feedback without a popup', () => {
  assert.doesNotMatch(html, /id="ring-reward"/);
  assert.doesNotMatch(html, /showRingReward/);
  assert.match(html, /function triggerRingImpact\(\)/);
  assert.match(html, /vortex\.classList\.add\('ring-clear'\)/);
});
