'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const decor = fs.readFileSync(path.join(__dirname, '..', 'public', 'flight-world-decor.js'), 'utf8');

test('balloon airship uses a faceted tapered envelope with structural ribs and side keels', () => {
  assert.match(decor, /const AIRSHIP_PROFILE = \[/);
  assert.match(decor, /function makeAirshipEnvelopeGeometry\(/);
  assert.match(decor, /new THREE\.Float32BufferAttribute\(colors, 3\)/);
  assert.match(decor, /flatShading:\s*true/);
  assert.match(decor, /function makeEllipticalRibGeometry\(/);
  assert.match(decor, /airship-envelope-rib/);
  assert.match(decor, /airship-side-keel/);
  assert.match(decor, /startCenter[\s\S]*endCenter[\s\S]*indices\.push\(startCenter/);
});

test('airship physical materials, lit windows, and local lights create layered reflections', () => {
  assert.match(decor, /new THREE\.MeshPhysicalMaterial\(\{[\s\S]*clearcoat:\s*\.48[\s\S]*sheen:\s*\.22/);
  assert.match(decor, /specularIntensity:\s*\.72/);
  assert.match(decor, /airship-emissive-window/);
  assert.match(decor, /emissiveIntensity:\s*3\.2/);
  assert.match(decor, /new THREE\.PointLight\(0xffb04c/);
  assert.match(decor, /new THREE\.PointLight\(0xbfe9ff/);
  assert.match(decor, /receiveShadow = true/);
});

test('airship silhouette includes gondola, tail fins, engine pods, and animated propellers', () => {
  for (const name of ['airship-gondola', 'airship-tail-fin', 'airship-engine-pod', 'airship-propeller']) {
    assert.match(decor, new RegExp(name));
  }
  assert.match(decor, /object\.userData\.propellers\[index\]\.rotation\.x = elapsedSeconds \* 13/);
});
