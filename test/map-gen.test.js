'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapGen = require('../public/map-gen.js');

const {
  DIST_LEN,
  DIST_HALF,
  BIOMES,
  sampleBiome,
  makeNoise1d,
  buildDistanceLayout,
  arenaTheme,
  widthScaleAt
} = mapGen;

/* ---------------------------------------------------------------
   BIOMES table
--------------------------------------------------------------- */

test('BIOMES has exactly 5 entries', () => {
  assert.equal(BIOMES.length, 5);
});

test('every biome has the required shape', () => {
  for (const biome of BIOMES) {
    assert.equal(typeof biome.name, 'string');
    assert.ok(biome.name.length > 0);

    assert.equal(typeof biome.sky.top, 'number');
    assert.equal(typeof biome.sky.mid, 'number');
    assert.equal(typeof biome.sky.bottom, 'number');
    assert.equal(typeof biome.fog, 'number');

    assert.equal(typeof biome.terrain.wall, 'number');
    assert.equal(typeof biome.terrain.spire, 'number');
    assert.equal(typeof biome.terrain.rock, 'number');

    assert.equal(typeof biome.density.spires, 'number');
    assert.equal(typeof biome.density.rocks, 'number');
    assert.equal(typeof biome.density.thermals, 'number');
    assert.equal(typeof biome.density.rings, 'number');

    assert.equal(typeof biome.widthScale, 'number');
    assert.equal(typeof biome.heightScale, 'number');
  }
});

/* ---------------------------------------------------------------
   makeNoise1d
--------------------------------------------------------------- */

test('makeNoise1d output is clamped to [-1, 1]', () => {
  const noise = makeNoise1d(12345);
  for (let z = 0; z >= -DIST_LEN; z -= 17) {
    const v = noise(z);
    assert.ok(v >= -1 && v <= 1, `noise(${z}) = ${v} out of range`);
  }
});

test('makeNoise1d is deterministic for the same seed', () => {
  const noiseA = makeNoise1d(42);
  const noiseB = makeNoise1d(42);
  for (let z = 0; z >= -3000; z -= 33) {
    assert.equal(noiseA(z), noiseB(z));
  }
});

test('makeNoise1d differs across seeds', () => {
  const noiseA = makeNoise1d(1);
  const noiseB = makeNoise1d(2);
  let differs = false;
  for (let z = 0; z >= -3000; z -= 11) {
    if (noiseA(z) !== noiseB(z)) { differs = true; break; }
  }
  assert.ok(differs, 'expected noise streams to differ across seeds');
});

test('makeNoise1d is smooth (bounded delta) between nearby samples', () => {
  const noise = makeNoise1d(7);
  let prev = noise(0);
  for (let z = -1; z >= -3000; z -= 1) {
    const v = noise(z);
    assert.ok(Math.abs(v - prev) < 0.05, `discontinuity at z=${z}`);
    prev = v;
  }
});

/* ---------------------------------------------------------------
   sampleBiome
--------------------------------------------------------------- */

test('sampleBiome returns a single biome at each band center', () => {
  // Bands: 0-1500, 1500-3000, 3000-4500, 4500-6000, 6000-7500
  const centers = [-750, -2250, -3750, -5250, -6750];
  centers.forEach((z, idx) => {
    const { a, b, t } = sampleBiome(z);
    assert.equal(a, idx);
    assert.equal(b, idx);
    assert.equal(t, 0);
  });
});

test('sampleBiome blends across a band boundary with t in (0,1)', () => {
  // Boundary at z = -1500 between biome 0 and biome 1, blend zone +-150m.
  const { a, b, t } = sampleBiome(-1500);
  assert.equal(a, 0);
  assert.equal(b, 1);
  assert.ok(t > 0 && t < 1, `expected t in (0,1), got ${t}`);
});

test('sampleBiome is a=b outside the blend zone near a boundary', () => {
  const justInside = sampleBiome(-1349); // > 150m from -1500 boundary
  assert.equal(justInside.a, 0);
  assert.equal(justInside.b, 0);
  assert.equal(justInside.t, 0);
});

test('sampleBiome t approaches 0 and 1 at blend-zone edges', () => {
  const start = sampleBiome(-1351); // just entering blend zone
  const end = sampleBiome(-1649); // just before exiting blend zone into biome 1
  assert.ok(start.t < 0.05);
  assert.ok(end.t > 0.95);
});

test('sampleBiome clamps at the ends of the course', () => {
  const atStart = sampleBiome(0);
  assert.equal(atStart.a, 0);
  assert.equal(atStart.b, 0);

  const atEnd = sampleBiome(-DIST_LEN);
  assert.equal(atEnd.a, 4);
  assert.equal(atEnd.b, 4);

  const beyondStart = sampleBiome(100);
  assert.equal(beyondStart.a, 0);
  const beyondEnd = sampleBiome(-DIST_LEN - 100);
  assert.equal(beyondEnd.a, 4);
});

/* ---------------------------------------------------------------
   buildDistanceLayout — determinism
--------------------------------------------------------------- */

test('buildDistanceLayout is deterministic for the same seed (JSON equality)', () => {
  const layoutA = buildDistanceLayout(999);
  const layoutB = buildDistanceLayout(999);
  assert.equal(JSON.stringify(layoutA), JSON.stringify(layoutB));
});

test('buildDistanceLayout differs for different seeds', () => {
  const layoutA = buildDistanceLayout(1);
  const layoutB = buildDistanceLayout(2);
  assert.notEqual(JSON.stringify(layoutA), JSON.stringify(layoutB));
});

/* ---------------------------------------------------------------
   buildDistanceLayout — shape
--------------------------------------------------------------- */

test('buildDistanceLayout returns the expected top-level arrays', () => {
  const layout = buildDistanceLayout(5);
  assert.ok(Array.isArray(layout.walls));
  assert.ok(Array.isArray(layout.spires));
  assert.ok(Array.isArray(layout.rocks));
  assert.ok(Array.isArray(layout.thermals));
  assert.ok(Array.isArray(layout.rings));
});

/* ---------------------------------------------------------------
   buildDistanceLayout — bounds
--------------------------------------------------------------- */

test('all placed elements have z within [-DIST_LEN, 0]', () => {
  const layout = buildDistanceLayout(5);
  const allZ = []
    .concat(layout.walls.map(w => w.z))
    .concat(layout.spires.map(s => s.z))
    .concat(layout.rocks.map(r => r.z))
    .concat(layout.thermals.map(t => t.z))
    .concat(layout.rings.map(r => r.z));

  for (const z of allZ) {
    assert.ok(z <= 0 && z >= -DIST_LEN, `z=${z} out of bounds`);
  }
});

test('non-wall obstacles stay within the modulated canyon width', () => {
  const layout = buildDistanceLayout(5);
  // Generous cap: DIST_HALF +-25% width modulation, never wider than 1.25x DIST_HALF.
  const maxHalf = DIST_HALF * 1.25;
  for (const s of layout.spires) assert.ok(Math.abs(s.x) <= maxHalf, `spire x=${s.x}`);
  for (const r of layout.rocks) assert.ok(Math.abs(r.x) <= maxHalf, `rock x=${r.x}`);
  for (const t of layout.thermals) assert.ok(Math.abs(t.x) <= maxHalf, `thermal x=${t.x}`);
  for (const r of layout.rings) assert.ok(Math.abs(r.x) <= maxHalf, `ring x=${r.x}`);
});

test('widthScaleAt is continuous across a biome boundary (no hard-switch jump)', () => {
  // Boundary between biome 2 (설원, widthScale 1.0) and biome 3 (화산재, widthScale 0.8)
  // sits at z=-4500, inside the +-150m blend zone. A flat (zero) noise function isolates
  // the biome-lerp contribution from noise jitter, so any discontinuity here is caused
  // purely by a hard a/b switch rather than the noise term.
  const flatNoise = () => 0;
  const before = widthScaleAt(-4495, flatNoise);
  const after = widthScaleAt(-4505, flatNoise);
  const deltaHalfWidth = Math.abs(before - after) * DIST_HALF;
  assert.ok(deltaHalfWidth < DIST_HALF * 0.02,
    `expected <2% of DIST_HALF jump across boundary, got ${deltaHalfWidth} (before=${before}, after=${after})`);
});

test('widthScaleAt sweeps smoothly (no jump anywhere) across the 화산재 blend zone', () => {
  const flatNoise = () => 0;
  let prev = widthScaleAt(-4650, flatNoise);
  for (let z = -4649; z <= -4350; z += 1) {
    const v = widthScaleAt(z, flatNoise);
    const deltaHalfWidth = Math.abs(v - prev) * DIST_HALF;
    assert.ok(deltaHalfWidth < DIST_HALF * 0.005, `discontinuity at z=${z}: delta=${deltaHalfWidth}`);
    prev = v;
  }
});

test('rocks and rings keep y within the current game range', () => {
  const layout = buildDistanceLayout(5);
  for (const r of layout.rocks) {
    assert.ok(r.y >= 30 && r.y <= 30 + 145, `rock y=${r.y}`);
  }
  for (const r of layout.rings) {
    assert.ok(r.y >= 40 && r.y <= 40 + 170, `ring y=${r.y}`);
  }
});

test('every placed element carries a biome index in range [0,4]', () => {
  const layout = buildDistanceLayout(5);
  const all = []
    .concat(layout.walls)
    .concat(layout.spires)
    .concat(layout.rocks)
    .concat(layout.thermals)
    .concat(layout.rings);
  for (const el of all) {
    assert.ok(Number.isInteger(el.biome) && el.biome >= 0 && el.biome <= 4, `biome=${el.biome}`);
  }
});

/* ---------------------------------------------------------------
   buildDistanceLayout — caps (perf protection)
--------------------------------------------------------------- */

test('wall count never exceeds current segs*2 (step=42 baseline)', () => {
  const layout = buildDistanceLayout(5);
  const step = 42;
  const segs = Math.ceil(DIST_LEN / step);
  assert.ok(layout.walls.length <= segs * 2, `walls=${layout.walls.length}`);
});

test('spires and rocks stay within 1.5x the current baseline totals', () => {
  const baselineSpires = Math.floor(DIST_LEN / 1000 * 22);
  const baselineRocks = Math.floor(DIST_LEN / 1000 * 15);

  // Sample a handful of seeds since density is randomized per-biome-band.
  for (const seed of [1, 2, 3, 4, 5, 100, 200]) {
    const layout = buildDistanceLayout(seed);
    assert.ok(layout.spires.length <= baselineSpires * 1.5,
      `seed ${seed}: spires=${layout.spires.length} > cap ${baselineSpires * 1.5}`);
    assert.ok(layout.rocks.length <= baselineRocks * 1.5,
      `seed ${seed}: rocks=${layout.rocks.length} > cap ${baselineRocks * 1.5}`);
  }
});

test('total element count stays within +-40% of the current baseline', () => {
  const baselineTotal =
    Math.ceil(DIST_LEN / 42) * 2 +
    Math.floor(DIST_LEN / 1000 * 22) +
    Math.floor(DIST_LEN / 1000 * 15) +
    Math.floor(DIST_LEN / 1000 * 5) +
    Math.floor(DIST_LEN / 1000 * 7);

  for (const seed of [1, 2, 3, 4, 5]) {
    const layout = buildDistanceLayout(seed);
    const total = layout.walls.length + layout.spires.length + layout.rocks.length +
      layout.thermals.length + layout.rings.length;
    assert.ok(total <= baselineTotal * 1.4, `seed ${seed}: total=${total} exceeds +40% cap`);
    assert.ok(total >= baselineTotal * 0.6, `seed ${seed}: total=${total} below -40% cap`);
  }
});

/* ---------------------------------------------------------------
   buildDistanceLayout — density multipliers reflected in per-biome counts
--------------------------------------------------------------- */

function countInBand(elements, zMin, zMax) {
  return elements.filter(el => el.z <= zMax && el.z >= zMin).length;
}

test('forest band (biome 1) has more spires per km than desert band (biome 0)', () => {
  // Average across several seeds to smooth out per-seed noise in width/placement,
  // since density multipliers are directional trends, not exact per-seed guarantees.
  let desertTotal = 0, forestTotal = 0;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const seed of seeds) {
    const layout = buildDistanceLayout(seed);
    desertTotal += countInBand(layout.spires, -1500, 0);
    forestTotal += countInBand(layout.spires, -3000, -1500);
  }
  const desertPerKm = desertTotal / seeds.length / 1.5;
  const forestPerKm = forestTotal / seeds.length / 1.5;
  assert.ok(forestPerKm > desertPerKm,
    `expected forest spire density (${forestPerKm}) > desert (${desertPerKm})`);
});

test('snow band (biome 2) has more rocks per km than desert band (biome 0)', () => {
  let desertTotal = 0, snowTotal = 0;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const seed of seeds) {
    const layout = buildDistanceLayout(seed);
    desertTotal += countInBand(layout.rocks, -1500, 0);
    snowTotal += countInBand(layout.rocks, -4500, -3000);
  }
  const desertPerKm = desertTotal / seeds.length / 1.5;
  const snowPerKm = snowTotal / seeds.length / 1.5;
  assert.ok(snowPerKm > desertPerKm,
    `expected snow rock density (${snowPerKm}) > desert (${desertPerKm})`);
});

/* ---------------------------------------------------------------
   arenaTheme
--------------------------------------------------------------- */

test('arenaTheme is deterministic for the same seed', () => {
  const themeA = arenaTheme(777);
  const themeB = arenaTheme(777);
  assert.equal(JSON.stringify(themeA), JSON.stringify(themeB));
});

test('arenaTheme returns one of the BIOMES entries', () => {
  const theme = arenaTheme(321);
  assert.ok(BIOMES.some(b => JSON.stringify(b) === JSON.stringify(theme)));
});

test('arenaTheme can select different biomes across seeds', () => {
  const seen = new Set();
  for (let seed = 0; seed < 50; seed++) {
    seen.add(JSON.stringify(arenaTheme(seed)));
  }
  assert.ok(seen.size > 1, 'expected arenaTheme to vary across many seeds');
});
