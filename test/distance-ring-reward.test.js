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

test('ring clear keeps reward copy in a compact craft-side badge', () => {
  assert.match(html, /id="ring-clear-feedback"[^>]*role="status"/);
  assert.match(html, />RING CLEAR<\/span><strong[^>]*>\+<\/strong>/);
  assert.match(html, /id="ring-clear-energy-effect"[^>]*>ENERGY CHARGE<\/span>/);
  assert.match(html, /id="ring-clear-speed-effect"[^>]*>MAX SPEED/);
  assert.match(html, /function showRingClearFeedback\(energyGain\)/);
  assert.match(html, /ENERGY CHARGE \+\$\{roundedEnergyGain\}/);
  assert.match(html, /'ENERGY FULL'/);
  assert.match(html, /feedback\.dataset\.mode = game\.mode/);
  assert.match(html, /feedback\.classList\.add\('show'\)/);
  assert.match(html, /function updateRingClearFeedback\(\)/);
  assert.doesNotMatch(html, /dash-vortex\.ring-clear|vortex\.classList\.add\('ring-clear'\)/);
});

test('the four-second distance ring boost reuses dash camera, wind, impact, and audio feedback', () => {
  assert.match(html, /function isDistanceRingBoostActive\(\)/);
  assert.match(html, /ringBoostActive \? \.9 : 0/);
  assert.match(html, /speedBoostVisualActive = me\.dashing \|\| isDistanceRingBoostActive\(\)/);
  assert.match(html, /speedFov\(me\.speed, \(me\.dashing \|\| isDistanceRingBoostActive\(\)\) && me\.alive\)/);
  assert.match(html, /audioDirector\.setFlight\(\{[\s\S]*?dashing: me\.dashing \|\| isDistanceRingBoostActive\(\)/);
  assert.match(html, /audioDirector\.play\('score'\);\s*triggerDashImpact\(\);/);
});

test('both distance and arena ring pickups trigger the compact feedback', () => {
  assert.match(
    html,
    /if \(game\.mode === 'ARENA'\)[\s\S]*?else \{[\s\S]*?audioDirector\.play\('score'\);[\s\S]*?\}\s*showRingClearFeedback\(ringEnergyGain\);/
  );
  assert.match(html, /#ring-clear-feedback\[data-mode="ARENA"\]/);
});
