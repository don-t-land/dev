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
