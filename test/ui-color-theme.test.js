'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const homeCss = fs.readFileSync(path.join(publicDir, 'home-screen.css'), 'utf8');

test('distance-mode flight rings use a vivid blue material', () => {
  assert.match(
    html,
    /const ringMat = registerLitMaterial\(new THREE\.MeshStandardMaterial\(\{ color: 0x3b82f6, emissive: 0x1d4ed8, emissiveIntensity: 2\.4, roughness: 0\.4 \}\)\);/
  );
});

test('home distance and survival buttons exchange their accent colors', () => {
  assert.match(
    homeCss,
    /\.home-mode-distance \{ --mode-accent: #59d9ff; --mode-accent-rgb: 89,217,255; \}/
  );
  assert.match(
    homeCss,
    /\.home-mode-survival \{ --mode-accent: #ffd95a; --mode-accent-rgb: 255,217,90; \}/
  );
});
