const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');

function loadPolicy() {
  return require('../public/audio-policy.js');
}

test('deadline cues fire once per crossed second, avoid catch-up bursts, and skip live arena', () => {
  const { deadlineCue } = loadPolicy();

  assert.equal(deadlineCue(10.2, 9.8, { enabled: true }), 10);
  assert.equal(deadlineCue(9.8, 9.2, { enabled: true }), null);
  assert.equal(deadlineCue(9.2, 3.4, { enabled: true }), 4);
  assert.equal(deadlineCue(2.1, 0.9, { enabled: true }), 1);
  assert.equal(deadlineCue(10.2, 9.8, { enabled: false }), null);
});
