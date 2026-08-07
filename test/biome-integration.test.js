'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const visuals = fs.readFileSync(path.join(publicDir, 'biome-visuals.js'), 'utf8');
const showcase = fs.readFileSync(path.join(publicDir, 'biome-showcase.html'), 'utf8');
const showroomMaterials = fs.readFileSync(path.join(publicDir, 'showroom-materials.js'), 'utf8');
const biomeHelpers = fs.readFileSync(path.join(publicDir, 'biomes', 'helpers.js'), 'utf8');
const physics = fs.readFileSync(path.join(publicDir, 'flight-physics-rapier.mjs'), 'utf8');

test('browser loads pure biome recipes before the registry and renderer module', () => {
  const helpers = html.indexOf('<script src="./biomes/helpers.js"></script>');
  const desert = html.indexOf('<script src="./biomes/desert.js"></script>');
  const floating = html.indexOf('<script src="./biomes/floating.js"></script>');
  const registry = html.indexOf('<script src="./map-gen.js"></script>');
  assert.ok(helpers >= 0 && helpers < desert);
  assert.ok(desert < floating && floating < registry);
  assert.match(html, /import \{ buildBiomeEnvironment, terrainCollisionAtPoint \} from '\.\/biome-visuals\.js';/);
});

test('distance and arena consume the same recipe layout renderer', () => {
  assert.match(html, /const layout = window\.mapGen\.buildDistanceLayout\(seed\);/);
  assert.match(html, /const layout = window\.mapGen\.buildArenaLayout\(seed\);/);
  assert.equal((html.match(/installBiomeLayout\(layout\);/g) || []).length, 2);
  assert.match(html, /thermal\.strength/);
});

test('environment renderer uses layered instancing for every requested asset family', () => {
  assert.match(visuals, /function facetedWallGeometry/);
  assert.match(visuals, /function addWalls/);
  assert.match(visuals, /function addSpires/);
  assert.match(visuals, /function addRocks/);
  assert.match(visuals, /function addPlatforms/);
  assert.match(visuals, /function addClouds/);
  assert.match(visuals, /new THREE\.InstancedMesh/);
  assert.match(visuals, /wind-gate/);
  assert.match(visuals, /post-office/);
  assert.match(visuals, /white-needle/);
});

test('overlapping cloud clusters remain separate transparent sort units', () => {
  const cloudRenderer = visuals.match(/function addClouds\([\s\S]*?\n}/)?.[0] || '';

  assert.match(cloudRenderer, /clouds\.forEach\(cloud =>/);
  assert.match(cloudRenderer, /puffMesh\.position\.set\(cloud\.x, cloud\.y, cloud\.z\)/);
  assert.match(cloudRenderer, /shadeMesh\.position\.set\(cloud\.x, cloud\.y, cloud\.z\)/);
  assert.doesNotMatch(cloudRenderer, /clouds\.flatMap/);
  assert.doesNotMatch(cloudRenderer, /alphaHash/);
});

test('weathered rocks keep duplicated face corners welded during deformation', () => {
  const rockGeometry = visuals.match(/function weatheredRockGeometry[\s\S]*?\n}/)?.[0] || '';
  assert.match(rockGeometry, /const cornerNoise = Math\.sin\(/);
  assert.match(rockGeometry, /x \* 127\.1 \+ y \* 311\.7 \+ z \* 74\.7/);
  assert.doesNotMatch(rockGeometry, /Math\.sin\(\(i \+ 1\)/);
  assert.match(rockGeometry, /geometry\.computeBoundingSphere\(\)/);
});

test('showroom orbits the camera while triplanar textures stay in surface space', () => {
  assert.match(showcase, /view\.camera\.position\.set\(/);
  assert.match(showcase, /view\.camera\.lookAt\(view\.orbitTarget\)/);
  assert.doesNotMatch(showcase, /view\.environment\.root\.rotation\.y/);
  assert.match(showroomMaterials, /varying vec3 vAtlasSurfacePosition/);
  assert.match(showroomMaterials, /instanceMatrix \* vec4\(atlasSurfacePosition/);
  assert.doesNotMatch(showroomMaterials, /vAtlasWorldPosition/);
});

test('curved segmented silhouettes and spatial repacking are wired into production', () => {
  assert.match(visuals, /function spirePoseAt/);
  assert.match(visuals, /function spireSegmentEntries/);
  assert.match(visuals, /function alignSpireSegment/);
  assert.match(visuals, /forkItems/);
  assert.match(biomeHelpers, /function createSpatialHash/);
  assert.match(biomeHelpers, /function resolveLayoutOverlaps/);
  assert.match(biomeHelpers, /goldenAngle/);
});

test('rendered terrain and both physics paths consume the same compound colliders', () => {
  assert.match(visuals, /function buildTerrainColliders/);
  assert.match(visuals, /type: 'tapered-segment'/);
  assert.match(visuals, /type: 'ellipsoid'/);
  assert.match(visuals, /type: 'elliptic-cylinder'/);
  assert.match(visuals, /'platform-underside'/);
  assert.match(visuals, /export function terrainCollisionAtPoint/);
  assert.match(html, /terrainColliders = environment\.colliders/);
  assert.match(html, /terrainCollisionAtPoint\(craft\.position, terrainColliders, 1\.4\)/);
  assert.match(html, /setMapColliders\(\{ colliders: terrainColliders \}\)/);
  assert.match(physics, /setMapColliders\(\{ colliders = \[\], spires = \[\], rocks = \[\], platforms = \[\] \}/);
  assert.match(physics, /ellipticCylinderHull/);
  assert.match(physics, /quaternionFromUnitY/);
});

test('ground treatment follows biome palette and nearly disappears in floating islands', () => {
  assert.match(html, /biome\.id === 'floating' \? \.055/);
  assert.match(html, /ground\.material\.color\.setHex\(biome\.terrain\.top\)/);
  assert.match(html, /ground\.material\.opacity = THREE\.MathUtils\.lerp/);
});
