'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('browser loads the authored endurance map before the Three.js game module', () => {
  const mapScript = html.indexOf('<script src="./endurance-map.js"></script>');
  const gameModule = html.indexOf('<script type="module">');

  assert.ok(mapScript > 0);
  assert.ok(mapScript < gameModule);
  assert.match(html, /const \{ createEnduranceMap \} = window\.EnduranceMap/);
  assert.match(html, /const ARENA_R = window\.EnduranceMap\.ARENA_RADIUS/);
});

test('ARENA renderer builds three authored landmarks and route dressing', () => {
  assert.match(html, /function buildWhitewindGround\(map\)/);
  assert.match(html, /function buildWindGate\(map\)/);
  assert.match(html, /function buildPostOffice\(map\)/);
  assert.match(html, /function buildWhiteNeedle\(map\)/);
  assert.match(html, /function buildRouteDressing\(map\)/);
  assert.match(html, /name = 'landmark-wind-gate'/);
  assert.match(html, /name = 'landmark-post-office'/);
  assert.match(html, /name = 'landmark-white-needle'/);
});

test('ARENA collision, lift and reward data come from one deterministic descriptor', () => {
  assert.match(html, /const map = createEnduranceMap\(seed\)/);
  assert.match(html, /for \(const descriptor of map\.spires\)/);
  assert.match(html, /for \(const descriptor of map\.rocks\)/);
  assert.match(html, /for \(const descriptor of map\.thermals\)/);
  assert.match(html, /for \(const descriptor of map\.rings\)/);
  assert.doesNotMatch(html, /const nSp = 13;[\s\S]*const nRk = 18;/);
});

test('arena dressing uses instancing and labels the authored scene for browser inspection', () => {
  assert.match(html, /new THREE\.InstancedMesh\(unitBox, routeStoneMat, map\.dressing\.routeMarkers\.length\)/);
  assert.match(html, /new THREE\.InstancedMesh\(unitGrass, grassMat, map\.dressing\.grassPatches\.length\)/);
  assert.match(html, /arenaRoot\.name = `endurance-map-\$\{map\.id\}`/);
  assert.match(html, /arenaRoot\.userData\.mapName = map\.name/);
});

test('temporary launch towers are removed before active map play', () => {
  assert.match(
    html,
    /else if \(wasLaunch\) \{\s*clearLaunchActors\(\);\s*clearLaunchTowers\(\);\s*game\.phase = 'playing'/,
  );
});

test('arena presentation frames the authored island and gives landmarks readable silhouettes', () => {
  assert.match(html, /windGateArch\.name = 'wind-gate-arch'/);
  assert.match(html, /sign\.name = 'post-office-envelope-sign'/);
  assert.match(html, /ridgeCrowns\.name = 'whitewind-ridge-crowns'/);
  assert.match(html, /edge\.name = `\$\{terrace\.id\}-retaining-edge`/);
  assert.match(html, /const cameraLookHeight = game\.phase === 'launch'\s*\? 1\.2\s*:\s*game\.mode === 'ARENA' \? -5\.5 : 1\.2/);
  assert.match(html, /ground\.position\.set\(0, game\.mode === 'ARENA' \? -6 : 0, 0\)/);
  assert.match(html, /grid\.visible = game\.mode === 'DIST'/);
});

test('thermal columns taper upward without additive walls obscuring the arena', () => {
  assert.match(html, /blending: THREE\.NormalBlending, fog: true/);
  assert.match(html, /vec4 mvPosition=modelViewMatrix/);
  assert.match(html, /new THREE\.CylinderGeometry\(THERMAL_R \* 0\.32, THERMAL_R, 220/);
  assert.doesNotMatch(html, /blending: THREE\.AdditiveBlending/);
});
