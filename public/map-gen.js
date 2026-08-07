(function exposeMapGen(root, factory) {
  const recipes = typeof module === 'object' && module.exports
    ? {
        desert: require('./biomes/desert.js'),
        pillars: require('./biomes/pillars.js'),
        glacier: require('./biomes/glacier.js'),
        lava: require('./biomes/lava.js'),
        floating: require('./biomes/floating.js')
      }
    : root.planeBiomes;
  const helpers = typeof module === 'object' && module.exports
    ? require('./biomes/helpers.js')
    : root.planeBiomeHelpers;
  const api = factory(recipes, helpers);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.mapGen = api;
})(typeof globalThis === 'object' ? globalThis : this, (recipes, helpers) => {
  'use strict';

  const DIST_LEN = 7500;
  const DIST_HALF = 155;
  // 오래 날기 경기장은 기존 240m 반경의 3배 크기다.
  const ARENA_R = 720;
  const FLIGHT_CEILING = helpers.FLIGHT_CEILING;
  const BAND_SIZE = DIST_LEN / 5;
  const BLEND_HALF = 150;
  const LAYOUT_KEYS = ['walls', 'spires', 'rocks', 'thermals', 'rings', 'platforms', 'clouds', 'landmarks'];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const BIOMES = [
    {
      id: 'desert', name: '사막 협곡', widthScale: 1.15,
      sky: { top: 0x2b5f9e, mid: 0xa8c6e3, bottom: 0xf2d9bd }, fog: 0xb8c9dd,
      terrain: { wall: 0x8b6847, wallAccent: 0xd0a16d, spire: 0x806044, rock: 0x947454, platform: 0xb98a58, top: 0xd4ad79, cloud: 0xfff4de },
      recipe: recipes?.desert?.recipe
    },
    {
      id: 'pillars', name: '기둥숲', widthScale: 1.06,
      sky: { top: 0x3f8fd1, mid: 0xbfe4b0, bottom: 0xeaf4d8 }, fog: 0x9ebda8,
      terrain: { wall: 0x496141, wallAccent: 0x779069, spire: 0x334b32, rock: 0x5b6d50, platform: 0x5f7750, top: 0x9db77d, cloud: 0xe9f4dc },
      recipe: recipes?.pillars?.recipe
    },
    {
      id: 'glacier', name: '빙하 크레바스', widthScale: .9,
      sky: { top: 0x739ec3, mid: 0xdcecf5, bottom: 0xffffff }, fog: 0xdcecf5,
      terrain: { wall: 0xa9c6d3, wallAccent: 0xe8fbff, spire: 0xccecf5, rock: 0x83b9ca, platform: 0x9bc8d5, top: 0xe9fbff, cloud: 0xf5fdff },
      recipe: recipes?.glacier?.recipe
    },
    {
      id: 'lava', name: '용암 굴뚝', widthScale: .72,
      sky: { top: 0x3b1716, mid: 0x8c3a24, bottom: 0xd9622f }, fog: 0x684139,
      terrain: { wall: 0x281d1b, wallAccent: 0xd64b22, spire: 0x351b18, rock: 0x68281f, platform: 0x38201c, top: 0xa63b20, cloud: 0x917067 },
      recipe: recipes?.lava?.recipe
    },
    {
      id: 'floating', name: '부유섬 새벽', widthScale: 1.6,
      sky: { top: 0x5b3d8c, mid: 0xa87fd1, bottom: 0xf6cf7e }, fog: 0xc9aee0,
      terrain: { wall: 0x8e7d9f, wallAccent: 0xd8cfe6, spire: 0x8f7b9e, rock: 0xc6b8cf, platform: 0x887394, top: 0xb9ca8b, cloud: 0xffedf8 },
      recipe: recipes?.floating?.recipe
    }
  ];

  for (const biome of BIOMES) {
    if (typeof biome.recipe !== 'function') throw new Error(`Missing biome recipe: ${biome.id}`);
  }

  function sampleBiome(z) {
    let dist = Math.max(0, Math.min(DIST_LEN, -Number(z) || 0));
    let idx = Math.min(4, Math.max(0, Math.floor(dist / BAND_SIZE)));
    const boundaryDist = idx * BAND_SIZE;
    const fromStart = dist - boundaryDist;
    const fromEnd = (idx + 1) * BAND_SIZE - dist;
    if (idx > 0 && fromStart < BLEND_HALF) return { a: idx - 1, b: idx, t: .5 + fromStart / (2 * BLEND_HALF) };
    if (idx < 4 && fromEnd < BLEND_HALF) return { a: idx, b: idx + 1, t: (BLEND_HALF - fromEnd) / (2 * BLEND_HALF) };
    return { a: idx, b: idx, t: 0 };
  }

  function makeNoise1d(seed) {
    const lattice = new Map();
    function value(cell, salt) {
      const key = `${cell}:${salt}`;
      if (!lattice.has(key)) {
        const rng = mulberry32((seed ^ Math.imul(cell, 0x1f123bb5) ^ Math.imul(salt, 0x9e3779b9)) >>> 0);
        lattice.set(key, rng() * 2 - 1);
      }
      return lattice.get(key);
    }
    function octave(z, grid, salt) {
      const pos = z / grid;
      const cell = Math.floor(pos);
      const t = (1 - Math.cos((pos - cell) * Math.PI)) * .5;
      return value(cell, salt) * (1 - t) + value(cell + 1, salt) * t;
    }
    return z => Math.max(-1, Math.min(1, (octave(z, 300, 0) + octave(z, 150, 1) * .5) / 1.5));
  }

  function widthScaleAt(z, noise) {
    const s = sampleBiome(z);
    const scale = BIOMES[s.a].widthScale + (BIOMES[s.b].widthScale - BIOMES[s.a].widthScale) * s.t;
    return (1 + noise(z) * .25) * scale;
  }

  function blankLayout() {
    return Object.fromEntries(LAYOUT_KEYS.map(key => [key, []]));
  }

  function mergePart(out, part, biome) {
    for (const key of LAYOUT_KEYS) {
      for (const item of part[key] || []) out[key].push({ ...item, biome });
    }
  }

  function buildDistanceLayout(seed) {
    const out = blankLayout();
    const noise = makeNoise1d((seed ^ 0x2f6e1a3d) >>> 0);
    for (let band = 0; band < BIOMES.length; band++) {
      const zStart = -band * BAND_SIZE;
      const zEnd = -(band + 1) * BAND_SIZE;
      const ctx = {
        mode: 'DIST', zStart, zEnd, feather: BLEND_HALF,
        isFirst: band === 0, isLast: band === BIOMES.length - 1,
        halfWidthAt: z => DIST_HALF * widthScaleAt(z, noise)
      };
      const bandSeed = (seed ^ Math.imul(0x9e3779b9, band + 1)) >>> 0;
      const part = BIOMES[band].recipe(ctx, mulberry32(bandSeed), noise);
      mergePart(out, helpers.resolveLayoutOverlaps(part, ctx, bandSeed ^ 0x4f1bbcdc), band);
    }
    return out;
  }

  function arenaThemeIndex(seed) {
    return Math.min(BIOMES.length - 1, Math.floor(mulberry32(seed)() * BIOMES.length));
  }

  function buildArenaLayout(seed) {
    const biome = arenaThemeIndex(seed);
    const out = blankLayout();
    const ctx = { mode: 'ARENA', radius: ARENA_R };
    const recipeSeed = (seed ^ Math.imul(0x85ebca6b, biome + 1)) >>> 0;
    const part = BIOMES[biome].recipe(ctx, mulberry32(recipeSeed), () => 0);
    mergePart(out, helpers.resolveLayoutOverlaps(part, ctx, recipeSeed ^ 0x4f1bbcdc), biome);
    out.biome = biome;
    return out;
  }

  function arenaTheme(seed) {
    return BIOMES[arenaThemeIndex(seed)];
  }

  function findArenaSpawn(layout, seed, occupied = []) {
    return helpers.findArenaSpawn(
      layout,
      { mode: 'ARENA', radius: ARENA_R },
      mulberry32(seed >>> 0),
      occupied
    );
  }

  return {
    DIST_LEN, DIST_HALF, ARENA_R, FLIGHT_CEILING, BAND_SIZE, BLEND_HALF, LAYOUT_KEYS,
    BIOMES, mulberry32, sampleBiome, makeNoise1d, widthScaleAt,
    buildDistanceLayout, buildArenaLayout, arenaTheme,
    findArenaSpawn,
    resolveLayoutOverlaps: helpers.resolveLayoutOverlaps
  };
});
