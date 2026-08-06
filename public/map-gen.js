(function exposeMapGen(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.mapGen = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  /* ============================================================
     상수 — index.html의 실측값과 동일 (protocol/geometry parity)
     ============================================================ */
  const DIST_LEN = 7500;
  const DIST_HALF = 155;
  const ARENA_R = 240;

  const BAND_SIZE = DIST_LEN / 5; // 1500
  const BLEND_HALF = 150; // 경계 ±150m 블렌드

  /* ============================================================
     시드 난수 — public/index.html의 mulberry32와 동일 구현
     ============================================================ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ============================================================
     BIOMES — 5개 바이옴 테이블 (색은 hex, 밀도는 배수)
     ============================================================ */
  const BIOMES = [
    {
      name: '사막 협곡',
      sky: { top: 0x2b5f9e, mid: 0xa8c6e3, bottom: 0xf2d9bd },
      fog: 0xb8c9dd,
      terrain: { wall: 0x74695b, spire: 0x6e6357, rock: 0x7d7264 },
      density: { spires: 1.0, rocks: 1.0, thermals: 1.0, rings: 1.0 },
      widthScale: 1.0,
      heightScale: 1.0
    },
    {
      name: '초원 숲',
      sky: { top: 0x3f8fd1, mid: 0xbfe4b0, bottom: 0xeaf4d8 },
      fog: 0xaed3b8,
      terrain: { wall: 0x4d6b3f, spire: 0x33502c, rock: 0x5c6b4a },
      density: { spires: 1.3, rocks: 1.0, thermals: 1.4, rings: 1.0 },
      widthScale: 1.0,
      heightScale: 1.0
    },
    {
      name: '설원',
      sky: { top: 0x8fb8d8, mid: 0xdcecf5, bottom: 0xffffff },
      fog: 0xe8f2fa,
      terrain: { wall: 0xb9c4c9, spire: 0xcfe0e6, rock: 0x9fd4de },
      density: { spires: 1.0, rocks: 1.4, thermals: 1.0, rings: 1.0 },
      widthScale: 1.0,
      heightScale: 1.2
    },
    {
      name: '화산재',
      sky: { top: 0x4a1f18, mid: 0x8c3a24, bottom: 0xd9622f },
      fog: 0x7a4a3d,
      terrain: { wall: 0x2b201d, spire: 0x3a1c14, rock: 0x8a3320 },
      density: { spires: 1.0, rocks: 1.0, thermals: 1.0, rings: 1.4 },
      widthScale: 0.8,
      heightScale: 1.0
    },
    {
      name: '하늘섬 새벽',
      sky: { top: 0x5b3d8c, mid: 0xa87fd1, bottom: 0xf6cf7e },
      fog: 0xc9aee0,
      terrain: { wall: 0xd8cfe6, spire: 0xe6dcf2, rock: 0xf0e6d0 },
      density: { spires: 0.6, rocks: 1.3, thermals: 1.6, rings: 1.0 },
      widthScale: 1.0,
      heightScale: 1.0
    }
  ];

  /* ============================================================
     sampleBiome — z(0..-7500)를 5개 밴드로 나누고 경계 ±150m 블렌드
     ============================================================ */
  function sampleBiome(z) {
    // 진행 거리는 항상 0 이상으로 클램프 (z=-0 등 -0 전파 방지 위해 +0 처리 포함).
    let dist = -z + 0;
    if (dist <= 0) dist = 0;
    if (dist > DIST_LEN) dist = DIST_LEN;

    const rawIndex = dist / BAND_SIZE;
    let idx = Math.floor(rawIndex) + 0;
    if (idx > 4) idx = 4;
    if (idx <= 0) idx = 0;

    const boundaryDist = idx * BAND_SIZE; // 이 밴드의 시작 경계까지 거리
    const distFromStartBoundary = dist - boundaryDist;
    const distFromEndBoundary = (idx + 1) * BAND_SIZE - dist;

    // 밴드 시작 경계(이전 바이옴과의 경계) 블렌드 구간
    if (idx > 0 && distFromStartBoundary < BLEND_HALF) {
      const t = 0.5 + distFromStartBoundary / (2 * BLEND_HALF);
      return { a: idx - 1, b: idx, t };
    }
    // 밴드 종료 경계(다음 바이옴과의 경계) 블렌드 구간
    if (idx < 4 && distFromEndBoundary < BLEND_HALF) {
      const t = (BLEND_HALF - distFromEndBoundary) / (2 * BLEND_HALF);
      return { a: idx, b: idx + 1, t };
    }

    return { a: idx, b: idx, t: 0 };
  }

  /* ============================================================
     makeNoise1d — 격자 300m, mulberry32 값 노이즈, 코사인 보간, 2옥타브
     ============================================================ */
  function makeNoise1d(seed) {
    const lattice = new Map();
    function latticeValue(cell, octaveSalt) {
      const key = cell * 2 + octaveSalt; // octaveSalt: 0 or 1, keeps octaves independent
      let v = lattice.get(key);
      if (v === undefined) {
        const rng = mulberry32((seed ^ (cell * 0x1f123bb5) ^ (octaveSalt * 0x9e3779b9)) >>> 0);
        v = rng() * 2 - 1;
        lattice.set(key, v);
      }
      return v;
    }

    function cosineInterp(a, b, t) {
      const ft = (1 - Math.cos(t * Math.PI)) * 0.5;
      return a * (1 - ft) + b * ft;
    }

    function octave(z, gridSize, octaveSalt) {
      const pos = z / gridSize;
      const cell = Math.floor(pos);
      const frac = pos - cell;
      const a = latticeValue(cell, octaveSalt);
      const b = latticeValue(cell + 1, octaveSalt);
      return cosineInterp(a, b, frac);
    }

    return function noise(z) {
      const o1 = octave(z, 300, 0);
      const o2 = octave(z, 150, 1) * 0.5;
      let v = (o1 + o2) / 1.5;
      if (v > 1) v = 1;
      if (v < -1) v = -1;
      return v;
    };
  }

  /* ============================================================
     buildDistanceLayout — biome-0 현행 배치를 기준으로 밀도·폭 변조
     ============================================================ */
  function biomeAt(z) {
    const { a, b, t } = sampleBiome(z);
    return t < 0.5 ? BIOMES[a] : BIOMES[b];
  }

  function widthScaleAt(z, noise) {
    const biome = biomeAt(z);
    // ±25% of DIST_HALF from noise, plus per-biome widthScale (e.g. -20% in biome 3).
    const noiseFactor = 1 + noise(z) * 0.25;
    return noiseFactor * biome.widthScale;
  }

  function buildDistanceLayout(seed) {
    const rng = mulberry32(seed);
    const noise = makeNoise1d((seed ^ 0x2f6e1a3d) >>> 0);

    const walls = [];
    const spires = [];
    const rocks = [];
    const thermals = [];
    const rings = [];

    // ---- 협곡 벽 ----
    const step = 42;
    const segs = Math.ceil(DIST_LEN / step);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < segs; i++) {
        const z = -i * step;
        const scale = widthScaleAt(z, noise);
        const halfHere = DIST_HALF * scale;
        const x = side * (halfHere + 10 + rng() * 16);
        const w = 26 + rng() * 22;
        const h = 55 + rng() * 95;
        const d = step * (0.9 + rng() * 0.35);
        const clampedZ = Math.max(-DIST_LEN, Math.min(0, z));
        walls.push({ side, x, z: clampedZ, w, h, d, biome: sampleBiome(z).a });
      }
    }

    // ---- 첨탑 ----
    const baseSpireCount = Math.floor(DIST_LEN / 1000 * 22);
    const spireCap = Math.floor(baseSpireCount * 1.5);
    let spireBudget = 0;
    for (let bandIdx = 0; bandIdx < 5; bandIdx++) {
      const biome = BIOMES[bandIdx];
      const perBandBase = baseSpireCount / 5;
      let count = Math.round(perBandBase * biome.density.spires);
      if (spireBudget + count > spireCap) count = Math.max(0, spireCap - spireBudget);
      spireBudget += count;
      for (let i = 0; i < count; i++) {
        const zLocal = rng() * BAND_SIZE;
        const z = -(bandIdx * BAND_SIZE + zLocal);
        const clampedZ = Math.max(-DIST_LEN, Math.min(-1, z));
        const scale = widthScaleAt(clampedZ, noise);
        const halfHere = DIST_HALF * scale;
        const h = (45 + rng() * 125) * biome.heightScale;
        const r = 6 + rng() * 8;
        const x = (rng() * 2 - 1) * Math.max(1, halfHere - 20);
        spires.push({ x, z: clampedZ, h, r, biome: bandIdx });
      }
    }

    // ---- 공중 바위 ----
    const baseRockCount = Math.floor(DIST_LEN / 1000 * 15);
    const rockCap = Math.floor(baseRockCount * 1.5);
    let rockBudget = 0;
    for (let bandIdx = 0; bandIdx < 5; bandIdx++) {
      const biome = BIOMES[bandIdx];
      const perBandBase = baseRockCount / 5;
      let count = Math.round(perBandBase * biome.density.rocks);
      if (rockBudget + count > rockCap) count = Math.max(0, rockCap - rockBudget);
      rockBudget += count;
      for (let i = 0; i < count; i++) {
        const zLocal = rng() * BAND_SIZE;
        const z = -(bandIdx * BAND_SIZE + zLocal);
        const clampedZ = Math.max(-DIST_LEN, Math.min(-1, z));
        const scale = widthScaleAt(clampedZ, noise);
        const halfHere = DIST_HALF * scale;
        const r = 5 + rng() * 7;
        const x = (rng() * 2 - 1) * Math.max(1, halfHere - 20);
        const y = 30 + rng() * 145;
        rocks.push({ x, y, z: clampedZ, r, biome: bandIdx });
      }
    }

    // ---- 상승기류 ----
    const baseThermalCount = Math.floor(DIST_LEN / 1000 * 5);
    for (let bandIdx = 0; bandIdx < 5; bandIdx++) {
      const biome = BIOMES[bandIdx];
      const perBandBase = baseThermalCount / 5;
      const count = Math.round(perBandBase * biome.density.thermals);
      for (let i = 0; i < count; i++) {
        const zLocal = rng() * BAND_SIZE;
        const z = -(bandIdx * BAND_SIZE + zLocal);
        const clampedZ = Math.max(-DIST_LEN, Math.min(-1, z));
        const scale = widthScaleAt(clampedZ, noise);
        const halfHere = DIST_HALF * scale;
        const x = (rng() * 2 - 1) * Math.max(1, halfHere - 40);
        thermals.push({ x, z: clampedZ, biome: bandIdx });
      }
    }

    // ---- 부스트 링 ----
    const baseRingCount = Math.floor(DIST_LEN / 1000 * 7);
    for (let bandIdx = 0; bandIdx < 5; bandIdx++) {
      const biome = BIOMES[bandIdx];
      const perBandBase = baseRingCount / 5;
      const count = Math.round(perBandBase * biome.density.rings);
      for (let i = 0; i < count; i++) {
        const zLocal = rng() * BAND_SIZE;
        const z = -(bandIdx * BAND_SIZE + zLocal);
        const clampedZ = Math.max(-DIST_LEN, Math.min(-1, z));
        const scale = widthScaleAt(clampedZ, noise);
        const halfHere = DIST_HALF * scale;
        const x = (rng() * 2 - 1) * Math.max(1, halfHere - 35);
        const y = 40 + rng() * 170;
        rings.push({ x, y, z: clampedZ, biome: bandIdx });
      }
    }

    return { walls, spires, rocks, thermals, rings };
  }

  /* ============================================================
     arenaTheme — 시드의 첫 뽑기로 결정론적 바이옴 하나를 고른다
     ============================================================ */
  function arenaTheme(seed) {
    const rng = mulberry32(seed);
    const idx = Math.floor(rng() * BIOMES.length);
    return BIOMES[Math.min(idx, BIOMES.length - 1)];
  }

  return {
    DIST_LEN,
    DIST_HALF,
    ARENA_R,
    BIOMES,
    sampleBiome,
    makeNoise1d,
    buildDistanceLayout,
    arenaTheme
  };
});
