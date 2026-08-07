'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapGen = require('../public/map-gen.js');
const biomeHelpers = require('../public/biomes/helpers.js');

const {
  DIST_LEN,
  DIST_HALF,
  ARENA_R,
  BIOMES,
  LAYOUT_KEYS,
  sampleBiome,
  makeNoise1d,
  buildDistanceLayout,
  buildArenaLayout,
  arenaTheme,
  widthScaleAt
} = mapGen;

test('five named biome recipes expose complete visual palettes', () => {
  assert.deepEqual(BIOMES.map(biome => biome.id), ['desert', 'pillars', 'glacier', 'lava', 'floating']);
  for (const biome of BIOMES) {
    assert.equal(typeof biome.name, 'string');
    assert.equal(typeof biome.recipe, 'function');
    assert.ok(biome.widthScale > 0);
    for (const color of ['wall', 'wallAccent', 'spire', 'rock', 'platform', 'top', 'cloud']) {
      assert.equal(typeof biome.terrain[color], 'number', `${biome.id}.${color}`);
    }
  }
  assert.equal(BIOMES[3].widthScale, .72);
  assert.equal(BIOMES[4].widthScale, 1.6);
});

test('sampleBiome preserves band centers and blends both sides of boundaries', () => {
  [-750, -2250, -3750, -5250, -6750].forEach((z, index) => {
    assert.deepEqual(sampleBiome(z), { a: index, b: index, t: 0 });
  });
  const boundary = sampleBiome(-1500);
  assert.deepEqual([boundary.a, boundary.b], [0, 1]);
  assert.ok(boundary.t > 0 && boundary.t < 1);
  assert.equal(sampleBiome(200).a, 0);
  assert.equal(sampleBiome(-DIST_LEN - 200).a, 4);
});

test('noise is deterministic, smooth, seed-sensitive and clamped', () => {
  const first = makeNoise1d(41);
  const same = makeNoise1d(41);
  const other = makeNoise1d(42);
  let previous = first(0);
  let differs = false;
  for (let z = -1; z >= -3000; z--) {
    const value = first(z);
    assert.equal(value, same(z));
    assert.ok(value >= -1 && value <= 1);
    assert.ok(Math.abs(value - previous) < .05, `noise discontinuity at ${z}`);
    if (value !== other(z)) differs = true;
    previous = value;
  }
  assert.ok(differs);
});

test('width interpolation remains continuous through narrow lava and wide floating transitions', () => {
  const flat = () => 0;
  for (const boundary of [-4500, -6000]) {
    let previous = widthScaleAt(boundary - 150, flat);
    for (let z = boundary - 149; z <= boundary + 150; z++) {
      const value = widthScaleAt(z, flat);
      assert.ok(Math.abs(value - previous) * DIST_HALF < DIST_HALF * .006, `jump at ${z}`);
      previous = value;
    }
  }
});

test('distance layout is a deterministic pure result with every recipe array', () => {
  const first = buildDistanceLayout(991);
  const same = buildDistanceLayout(991);
  const other = buildDistanceLayout(992);
  assert.equal(JSON.stringify(first), JSON.stringify(same));
  assert.notEqual(JSON.stringify(first), JSON.stringify(other));
  for (const key of LAYOUT_KEYS) assert.ok(Array.isArray(first[key]), key);
});

test('all distance elements stay on course and carry their owning biome', () => {
  const layout = buildDistanceLayout(5);
  for (const key of LAYOUT_KEYS) {
    for (const item of layout[key]) {
      assert.ok(item.z <= 0 && item.z >= -DIST_LEN, `${key} z=${item.z}`);
      assert.ok(Number.isInteger(item.biome) && item.biome >= 0 && item.biome < BIOMES.length, `${key} biome=${item.biome}`);
    }
  }
  const maxHalf = DIST_HALF * 2.12;
  for (const key of ['spires', 'rocks', 'thermals', 'rings', 'platforms']) {
    for (const item of layout[key]) assert.ok(Math.abs(item.x) <= maxHalf, `${key} x=${item.x}`);
  }
});

function inBiome(items, biome) {
  return items.filter(item => item.biome === biome);
}

test('recipes produce the approved biome-specific obstacle identities', () => {
  const layout = buildDistanceLayout(77);
  const desertSpires = inBiome(layout.spires, 0).length;
  const pillarSpires = inBiome(layout.spires, 1).length;
  const desertRocks = inBiome(layout.rocks, 0).length;
  const glacierRocks = inBiome(layout.rocks, 2).length;
  assert.ok(pillarSpires > desertSpires * 1.7, `${pillarSpires} vs ${desertSpires}`);
  assert.ok(glacierRocks > desertRocks, `${glacierRocks} vs ${desertRocks}`);
  assert.ok(inBiome(layout.walls, 0).length > 0);
  assert.ok(inBiome(layout.walls, 2).length > 0);
  assert.ok(inBiome(layout.walls, 3).length > 0);
  assert.equal(inBiome(layout.walls, 4).length, 0);
  assert.equal(inBiome(layout.platforms, 0).length, 0);
  assert.ok(inBiome(layout.platforms, 4).length >= 20);
  assert.ok(inBiome(layout.thermals, 3).every(item => item.strength === 1.6));
  assert.ok(inBiome(layout.clouds, 4).filter(item => item.boundary).length >= 20);
  assert.deepEqual(inBiome(layout.landmarks, 0).map(item => item.type), ['wind-gate', 'post-office', 'white-needle']);
});

test('floating platforms have usable collision dimensions and clustered debris', () => {
  const layout = buildDistanceLayout(123);
  const platforms = inBiome(layout.platforms, 4);
  const debris = inBiome(layout.rocks, 4);
  for (const platform of platforms) {
    assert.ok(platform.w >= 30 && platform.w <= 74);
    assert.ok(platform.d >= 25 && platform.d <= 62);
    assert.ok(platform.h >= 10 && platform.h <= 22);
    assert.ok(platform.y >= 60 && platform.y <= 200);
  }
  assert.ok(debris.length >= platforms.length);
});

test('distance render budget remains bounded despite layered visual dressing', () => {
  for (const seed of [1, 2, 3, 4, 5, 100]) {
    const layout = buildDistanceLayout(seed);
    assert.ok(layout.walls.length <= 280, `walls ${layout.walls.length}`);
    assert.ok(layout.spires.length <= 210, `spires ${layout.spires.length}`);
    assert.ok(layout.rocks.length <= 135, `rocks ${layout.rocks.length}`);
    assert.ok(layout.platforms.length <= 30, `platforms ${layout.platforms.length}`);
    assert.ok(layout.clouds.length <= 70, `clouds ${layout.clouds.length}`);
  }
});

test('arena layouts are deterministic, single-biome and reuse the selected recipe', () => {
  assert.equal(ARENA_R, 720, '오래 날기 경기장 반경은 기존 240m의 3배여야 한다');
  for (const seed of [0, 1, 4, 10, 18, 33]) {
    const first = buildArenaLayout(seed);
    assert.equal(JSON.stringify(first), JSON.stringify(buildArenaLayout(seed)));
    assert.equal(first.biome, BIOMES.indexOf(arenaTheme(seed)));
    for (const key of LAYOUT_KEYS) {
      assert.ok(first[key].every(item => item.biome === first.biome), `${key} mixed biome`);
    }
  }
});

test('arena object density follows the 3x perimeter and 9x playable area', () => {
  const seen = new Map();
  for (let seed = 0; seed < 500 && seen.size < BIOMES.length; seed++) {
    seen.set(arenaTheme(seed).id, seed);
  }
  const expected = {
    desert: { walls: 168, spires: 135, rocks: 162, thermals: 72, rings: 54, clouds: 108 },
    pillars: { spires: 378, thermals: 54, rings: 76, clouds: 90 },
    glacier: { walls: 192, spires: 108, rocks: 225, thermals: 45, rings: 54, clouds: 126 },
    lava: { walls: 180, spires: 216, rocks: 126, thermals: 99, rings: 50, clouds: 99 },
    floating: { spires: 45, rocks: 216, thermals: 81, rings: 63, platforms: 180, clouds: 156 }
  };

  for (const [id, counts] of Object.entries(expected)) {
    const layout = buildArenaLayout(seen.get(id));
    for (const [key, count] of Object.entries(counts)) {
      assert.equal(layout[key].length, count, `${id}.${key}`);
    }
    const descriptorCount = LAYOUT_KEYS.reduce((total, key) => total + layout[key].length, 0);
    assert.ok(descriptorCount < 800, `${id} render budget ${descriptorCount}`);
    for (const key of ['spires', 'rocks', 'thermals', 'rings', 'platforms']) {
      for (const item of layout[key]) {
        assert.ok(Math.hypot(item.x, item.z) < ARENA_R, `${id}.${key} outside arena`);
      }
    }
  }
});

test('solid biome assets are deterministically repacked without visual overlaps', () => {
  for (let seed = 0; seed < 40; seed++) {
    const layout = buildArenaLayout(seed);
    const overlaps = biomeHelpers.findSolidOverlaps(layout);
    assert.equal(overlaps.length, 0, `seed ${seed}: ${JSON.stringify(overlaps[0])}`);
  }
});

test('each arena biome carries a distinct silhouette and placement grammar', () => {
  const seen = new Map();
  for (let seed = 0; seed < 500 && seen.size < BIOMES.length; seed++) {
    seen.set(arenaTheme(seed).id, seed);
  }
  const layouts = Object.fromEntries([...seen].map(([id, seed]) => [id, buildArenaLayout(seed)]));
  assert.ok(layouts.desert.spires.every(item => item.silhouette === 'sand-needle' && item.layoutPattern === 'desert-cluster'));
  assert.ok(layouts.pillars.spires.every(item => item.silhouette === 'bent-column' && item.layoutPattern === 'golden-spiral'));
  assert.ok(layouts.glacier.spires.every(item => item.silhouette === 'crystal-fan' && item.layoutPattern === 'crystal-grove'));
  assert.ok(layouts.lava.spires.every(item => item.silhouette === 'crooked-chimney' && item.layoutPattern === 'radial-fissure'));
  assert.ok(layouts.floating.platforms.every(item => item.silhouette === 'terraced-island' && item.layoutPattern === 'archipelago'));

  const pillars = layouts.pillars.spires;
  assert.ok(Math.max(...pillars.map(item => item.h)) - Math.min(...pillars.map(item => item.h)) > 190);
  assert.ok(new Set(pillars.map(item => item.segments)).size >= 4);
  assert.ok(pillars.some(item => item.fork));
  assert.ok(pillars.every(item => item.curve >= .045 && item.curve <= .19));
});

test('arena themes cover all five identities and floating arena has no wall mesh', () => {
  const seen = new Map();
  for (let seed = 0; seed < 500 && seen.size < BIOMES.length; seed++) {
    seen.set(arenaTheme(seed).id, seed);
  }
  assert.deepEqual([...seen.keys()].sort(), BIOMES.map(biome => biome.id).sort());
  const floating = buildArenaLayout(seen.get('floating'));
  assert.equal(floating.walls.length, 0);
  assert.ok(floating.platforms.length >= 18);
  assert.ok(floating.clouds.filter(item => item.boundary).length >= 24);
  for (const item of floating.platforms) assert.ok(Math.hypot(item.x, item.z) < ARENA_R);
});
