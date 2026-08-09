'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const decor = fs.readFileSync(path.join(__dirname, '..', 'public', 'flight-world-decor.js'), 'utf8');

test('hot-air balloon uses a tapered multi-panel envelope with structural seams', () => {
  assert.match(decor, /const BALLOON_PROFILE = \[/);
  assert.match(decor, /const BALLOON_PALETTES = \[/);
  assert.match(decor, /function makeBalloonEnvelopeGeometry\(/);
  assert.match(decor, /new THREE\.Float32BufferAttribute\(colors, 3\)/);
  assert.match(decor, /hot-air-balloon-high-detail/);
  assert.match(decor, /balloon-gore-seam/);
  assert.match(decor, /balloon-horizontal-band/);
});

test('hot-air balloon has reflective fabric, a wicker basket, rigging, and sandbags', () => {
  assert.match(decor, /fabric: new THREE\.MeshPhysicalMaterial\(\{[\s\S]*sheen:\s*\.34/);
  assert.match(decor, /specularIntensity:\s*\.38/);
  assert.match(decor, /balloon-wicker-basket/);
  assert.match(decor, /function makeBasketGeometry\(/);
  assert.match(decor, /function addBasketBand\(/);
  assert.match(decor, /balloon-sandbag/);
  assert.match(decor, /balloon-basket-rig/);
});

test('hot-air balloon burner emits light and animates independently from basket sway', () => {
  assert.match(decor, /balloon-burner-skirt/);
  assert.match(decor, /balloon-burner-flame/);
  assert.match(decor, /new THREE\.PointLight\(0xff812d/);
  assert.match(decor, /const burnerPulse =/);
  assert.match(decor, /object\.userData\.flames/);
  assert.match(decor, /object\.userData\.burnerGlow\.intensity/);
  assert.match(decor, /object\.userData\.basketRig\.rotation/);
  assert.match(decor, /object\.userData\.flames = fallback\.userData\.flames/);
});
