const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const projectRoot = path.join(__dirname, '..');

test('WASD and Space remain editable inside nickname inputs', () => {
  const { shouldCaptureGameKey } = require('../public/input-policy.js');
  const input = { tagName: 'INPUT', isContentEditable: false };

  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) {
    assert.equal(shouldCaptureGameKey({ code, target: input }), false, `${code} should reach the input`);
  }
});

test('game controls are still captured outside editable fields', () => {
  const { shouldCaptureGameKey } = require('../public/input-policy.js');
  const canvas = { tagName: 'CANVAS', isContentEditable: false };

  assert.equal(shouldCaptureGameKey({ code: 'KeyW', target: canvas }), true);
  assert.equal(shouldCaptureGameKey({ code: 'Escape', target: canvas }), false);
});

test('the client keyboard handler uses the editable-target policy', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /<script\s+src=['"]\.\/input-policy\.js['"]><\/script>/);
  assert.match(html, /if\s*\(!shouldCaptureGameKey\(e\)\)\s*return/);
});

test('room snapshots preserve active, crashed, and spectator roles', () => {
  const { getLocalRoundRole } = require('../public/room-state.js');
  const room = {
    order: ['active', 'crashed'],
    players: [
      { id: 'active', alive: true },
      { id: 'crashed', alive: false },
      { id: 'late', alive: false }
    ]
  };

  assert.equal(getLocalRoundRole(room, 'active'), 'active');
  assert.equal(getLocalRoundRole(room, 'crashed'), 'crashed');
  assert.equal(getLocalRoundRole(room, 'late'), 'spectator');
  assert.equal(getLocalRoundRole(room, 'missing'), 'spectator');
});

test('the lobby exposes public rooms and room-code actions', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /id="room-list"/);
  assert.match(html, /id="room-code"/);
  assert.match(html, /id="join-code-btn"/);
  assert.match(html, /data-create-mode="DIST"/);
  assert.match(html, /data-create-mode="ARENA"/);
});

test('the client implements room lifecycle and authoritative leaderboard messages', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /case ['"]rooms['"]/);
  assert.match(html, /case ['"]leaderboard['"]/);
  assert.match(html, /case ['"]error['"]/);
  assert.match(html, /send\(\{\s*t:\s*['"]create['"]/);
  assert.match(html, /send\(\{\s*t:\s*['"]join['"],\s*code/);
  assert.match(html, /send\(\{\s*t:\s*['"]start['"]/);
  assert.match(html, /send\(\{\s*t:\s*['"]leave['"]/);
  assert.match(html, /id="game-leave-btn"/);
});
