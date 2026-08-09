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
});

test('distance ring clear presents an accessible reward callout and impact feedback', () => {
  assert.match(html, /id="ring-reward"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /function showRingReward\(reward\)/);
  assert.match(html, /ring-reward-speed/);
  assert.match(html, /ring-reward-energy/);
  assert.match(html, /vortex\.classList\.add\('ring-clear'\)/);
  assert.match(html, /@keyframes ring-reward-pop/);
  assert.match(html, /prefers-reduced-motion:[\s]*reduce[\s\S]*#ring-reward\.show/);
});
