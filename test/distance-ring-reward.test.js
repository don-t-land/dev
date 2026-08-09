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

test('ring clear uses a compact craft-side feedback badge without a full-screen burst', () => {
  assert.match(html, /id="ring-clear-feedback"[^>]*role="status"/);
  assert.match(html, /<span>RING CLEAR<\/span><strong[^>]*>\+<\/strong>/);
  assert.match(html, /function showRingClearFeedback\(\)/);
  assert.match(html, /feedback\.dataset\.mode = game\.mode/);
  assert.match(html, /feedback\.classList\.add\('show'\)/);
  assert.doesNotMatch(html, /dash-vortex\.ring-clear|vortex\.classList\.add\('ring-clear'\)/);
});

test('both distance and arena ring pickups trigger the compact feedback', () => {
  assert.match(
    html,
    /if \(game\.mode === 'ARENA'\)[\s\S]*?else \{[\s\S]*?audioDirector\.play\('score'\);[\s\S]*?\}\s*showRingClearFeedback\(\);/
  );
  assert.match(html, /#ring-clear-feedback\[data-mode="ARENA"\]/);
});
