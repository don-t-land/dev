'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const visuals = fs.readFileSync(path.join(publicDir, 'biome-visuals.js'), 'utf8');
const biomeHelpers = fs.readFileSync(path.join(publicDir, 'biomes', 'helpers.js'), 'utf8');
const physics = fs.readFileSync(path.join(publicDir, 'flight-physics-rapier.mjs'), 'utf8');

test('browser loads pure biome recipes before the registry and renderer module', () => {
  const helpers = html.indexOf('<script src="./biomes/helpers.js"></script>');
  const desert = html.indexOf('<script src="./biomes/desert.js"></script>');
  const floating = html.indexOf('<script src="./biomes/floating.js"></script>');
  const registry = html.indexOf('<script src="./map-gen.js"></script>');
  assert.ok(helpers >= 0 && helpers < desert);
  assert.ok(desert < floating && floating < registry);
  assert.match(html, /import \{ buildBiomeEnvironment \} from '\.\/biome-visuals\.js';/);
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

test('curved segmented silhouettes and spatial repacking are wired into production', () => {
  assert.match(visuals, /function spirePoseAt/);
  assert.match(visuals, /function spireSegmentEntries/);
  assert.match(visuals, /function alignSpireSegment/);
  assert.match(visuals, /forkItems/);
  assert.match(biomeHelpers, /function createSpatialHash/);
  assert.match(biomeHelpers, /function resolveLayoutOverlaps/);
  assert.match(biomeHelpers, /goldenAngle/);
});

test('floating platforms are collidable in both fallback and Rapier paths', () => {
  assert.match(html, /for \(const platform of platforms\)/);
  assert.match(html, /Math\.cos\(-platform\.rotation\)/);
  assert.match(html, /setMapColliders\(\{ spires, rocks, platforms \}\)/);
  assert.match(physics, /setMapColliders\(\{ spires = \[\], rocks = \[\], platforms = \[\] \}/);
  assert.match(physics, /ColliderDesc\.cuboid\(/);
  assert.match(physics, /descriptor\.setRotation/);
});

test('ground treatment follows biome palette and nearly disappears in floating islands', () => {
  assert.match(html, /biome\.id === 'floating' \? \.055/);
  assert.match(html, /ground\.material\.color\.setHex\(biome\.terrain\.top\)/);
  assert.match(html, /ground\.material\.opacity = THREE\.MathUtils\.lerp/);
});
