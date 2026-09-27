'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapGen = require('../public/map-gen.js');
const biomeHelpers = require('../public/biomes/helpers.js');

const {
  DIST_LEN,
  DIST_HALF,
  MAX_DISTANCE_WIDTH_SCALE,
  ARENA_R,
  BIOMES,
  LAYOUT_KEYS,
  sampleBiome,
  makeNoise1d,
  buildDistanceLayout,
  buildArenaLayout,
  findArenaSpawn,
  arenaTheme,
  widthScaleAt
} = mapGen;

function inBiome(items, biome) {
  return items.filter(item => item.biome === biome);
}

function crossesFlightCeiling(cloud, ceiling) {
  return cloud.y - cloud.h / 2 < ceiling && cloud.y + cloud.h / 2 > ceiling;
}

test('random arena spawns avoid every visual asset and other active pilots', () => {
  for (let seed = 0; seed < 40; seed++) {
    const layout = buildArenaLayout(seed);
    const occupied = [];
    for (let index = 0; index < 8; index++) {
      const spawn = findArenaSpawn(layout, seed * 97 + index, occupied);
      assert.ok(
        biomeHelpers.isArenaSpawnSafe(layout, spawn, { radius: ARENA_R, occupied }),
        `unsafe spawn for seed ${seed}: ${JSON.stringify(spawn)}`
      );
      occupied.push([spawn.x, spawn.y, spawn.z]);
    }
  }
});
