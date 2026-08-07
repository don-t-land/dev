(function exposeBiomeHelpers(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.planeBiomeHelpers = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const KEYS = ['walls', 'spires', 'rocks', 'thermals', 'rings', 'platforms', 'clouds', 'landmarks'];
  const BASE_ARENA_RADIUS = 240;

  function emptyLayout() {
    return Object.fromEntries(KEYS.map(key => [key, []]));
  }

  function featherWeight(z, ctx) {
    if (ctx.mode !== 'DIST' || !ctx.feather) return 1;
    const fromStart = Math.abs(z - ctx.zStart);
    const fromEnd = Math.abs(z - ctx.zEnd);
    const edge = Math.min(ctx.isFirst ? Infinity : fromStart, ctx.isLast ? Infinity : fromEnd);
    return edge >= ctx.feather ? 1 : Math.max(0, edge / ctx.feather);
  }

  function keepAt(z, ctx, rng, floor = 0) {
    return rng() < Math.max(floor, featherWeight(z, ctx));
  }

  function distanceZ(ctx, rng, inset = 1) {
    const start = Math.min(ctx.zStart, ctx.zEnd) + inset;
    const end = Math.max(ctx.zStart, ctx.zEnd) - inset;
    return start + rng() * Math.max(1, end - start);
  }

  function distanceCount(ctx, perKm) {
    return Math.max(0, Math.round(Math.abs(ctx.zEnd - ctx.zStart) / 1000 * perKm));
  }

  function canyonX(ctx, z, rng, margin = 22) {
    return (rng() * 2 - 1) * Math.max(2, ctx.halfWidthAt(z) - margin);
  }

  function arenaPoint(rng, radius, inner = 0, outerMargin = 20) {
    const angle = rng() * Math.PI * 2;
    const max = Math.max(inner, radius - outerMargin);
    const distance = Math.sqrt(rng()) * (max - inner) + inner;
    return { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance, angle, distance };
  }

  function arenaScale(ctx) {
    return ctx.mode === 'ARENA' ? Math.max(1, ctx.radius / BASE_ARENA_RADIUS) : 1;
  }

  function arenaCount(ctx, baseCount, dimensions = 2) {
    return Math.max(0, Math.round(baseCount * Math.pow(arenaScale(ctx), dimensions)));
  }

  function arenaClusterCenters(ctx, rng, baseCount, inner = 50, outerMargin = 70) {
    return Array.from({ length: arenaCount(ctx, baseCount, 1) }, () =>
      arenaPoint(rng, ctx.radius, inner, outerMargin));
  }

  function clusterPoint(rng, center, spread, minDistance = 0) {
    const angle = rng() * Math.PI * 2;
    const distance = minDistance + Math.sqrt(rng()) * Math.max(0, spread - minDistance);
    return {
      x: center.x + Math.cos(angle) * distance,
      z: center.z + Math.sin(angle) * distance,
      angle,
      distance
    };
  }

  function solidBounds(item, key) {
    if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.z)) return null;
    if (key === 'spires') {
      return { x: item.x, z: item.z, radius: Math.max(2, item.r * 1.08), yMin: 0, yMax: item.h };
    }
    if (key === 'rocks') {
      const horizontal = item.r * Math.max(item.sx || 1, item.sz || 1);
      const vertical = item.r * (item.sy || 1);
      return { x: item.x, z: item.z, radius: Math.max(2, horizontal), yMin: item.y - vertical, yMax: item.y + vertical };
    }
    if (key === 'platforms') {
      return {
        x: item.x, z: item.z,
        radius: Math.hypot(item.w, item.d) * .42,
        yMin: item.y - Math.max(18, Math.min(52, item.w * .62)) - item.h * .55,
        yMax: item.y + item.h * .72
      };
    }
    if (key === 'landmarks') {
      const scale = item.scale || 1;
      const radius = item.type === 'wind-gate' ? 29 : item.type === 'post-office' ? 22 : 11;
      const height = item.type === 'white-needle' ? 98 : item.type === 'wind-gate' ? 52 : 35;
      return { x: item.x, z: item.z, radius: radius * scale, yMin: item.y || 0, yMax: (item.y || 0) + height * scale };
    }
    if (key === 'rings') {
      return { x: item.x, z: item.z, radius: 10, yMin: item.y - 10, yMax: item.y + 10 };
    }
    if (key === 'thermals') {
      return { x: item.x, z: item.z, radius: 27, yMin: 0, yMax: 340 };
    }
    return null;
  }

  function boundsOverlap(a, b, clearance = 3) {
    if (a.yMax + clearance < b.yMin || b.yMax + clearance < a.yMin) return false;
    return Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius + clearance;
  }

  function createSpatialHash(cellSize = 48) {
    const cells = new Map();
    const key = (x, z) => `${x}:${z}`;
    const range = bounds => ({
      minX: Math.floor((bounds.x - bounds.radius) / cellSize),
      maxX: Math.floor((bounds.x + bounds.radius) / cellSize),
      minZ: Math.floor((bounds.z - bounds.radius) / cellSize),
      maxZ: Math.floor((bounds.z + bounds.radius) / cellSize)
    });
    return {
      insert(entry) {
        const r = range(entry.bounds);
        for (let x = r.minX; x <= r.maxX; x++) {
          for (let z = r.minZ; z <= r.maxZ; z++) {
            const bucketKey = key(x, z);
            if (!cells.has(bucketKey)) cells.set(bucketKey, []);
            cells.get(bucketKey).push(entry);
          }
        }
      },
      query(bounds) {
        const found = new Set();
        const r = range(bounds);
        for (let x = r.minX; x <= r.maxX; x++) {
          for (let z = r.minZ; z <= r.maxZ; z++) {
            for (const entry of cells.get(key(x, z)) || []) found.add(entry);
          }
        }
        return found;
      }
    };
  }

  function hashPlacement(seed, key, index) {
    let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
    for (let i = 0; i < key.length; i++) value = Math.imul(value ^ key.charCodeAt(i), 0x85ebca6b) >>> 0;
    value ^= value >>> 16;
    return value >>> 0;
  }

  function fitsCourse(bounds, ctx) {
    if (ctx.mode === 'ARENA') return Math.hypot(bounds.x, bounds.z) + bounds.radius < ctx.radius - 8;
    const minZ = Math.min(ctx.zStart, ctx.zEnd) + 8;
    const maxZ = Math.max(ctx.zStart, ctx.zEnd) - 8;
    if (bounds.z < minZ || bounds.z > maxZ) return false;
    return Math.abs(bounds.x) + bounds.radius < Math.max(12, ctx.halfWidthAt(bounds.z) - 8);
  }

  function resolveLayoutOverlaps(layout, ctx, seed = 0) {
    const out = Object.fromEntries(KEYS.map(key => [key, (layout[key] || []).map(item => ({ ...item }))]));
    const hash = createSpatialHash();
    const solidOrder = ['landmarks', 'platforms', 'spires', 'rocks'];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    function place(item, key, index, insert = true) {
      const originalX = item.x;
      const originalZ = item.z;
      const salt = hashPlacement(seed, key, index);
      const startAngle = salt / 4294967296 * Math.PI * 2;
      for (let attempt = 0; attempt <= 96; attempt++) {
        if (attempt) {
          const ring = 1 + Math.floor((attempt - 1) / 12);
          const base = solidBounds(item, key)?.radius || 12;
          const distance = ring * Math.max(9, base * .72);
          const angle = startAngle + attempt * goldenAngle;
          item.x = originalX + Math.cos(angle) * distance;
          item.z = originalZ + Math.sin(angle) * distance;
        }
        const bounds = solidBounds(item, key);
        if (!bounds || !fitsCourse(bounds, ctx)) continue;
        let blocked = false;
        for (const other of hash.query(bounds)) {
          if (boundsOverlap(bounds, other.bounds)) { blocked = true; break; }
        }
        if (blocked) continue;
        item.placementShift = Math.hypot(item.x - originalX, item.z - originalZ);
        if (insert) hash.insert({ key, item, bounds });
        return true;
      }
      item.x = originalX;
      item.z = originalZ;
      return false;
    }

    for (const key of solidOrder) {
      out[key] = out[key].filter((item, index) => place(item, key, index));
    }
    // 링과 상승기류는 서로 겹칠 수 있지만 단단한 지형 내부에는 생성하지 않는다.
    for (const key of ['rings', 'thermals']) {
      out[key] = out[key].filter((item, index) => place(item, key, index, false));
    }
    return out;
  }

  function findSolidOverlaps(layout) {
    const entries = [];
    for (const key of ['landmarks', 'platforms', 'spires', 'rocks']) {
      (layout[key] || []).forEach((item, index) => {
        const bounds = solidBounds(item, key);
        if (bounds) entries.push({ key, index, bounds });
      });
    }
    const overlaps = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (boundsOverlap(entries[i].bounds, entries[j].bounds)) overlaps.push([entries[i], entries[j]]);
      }
    }
    return overlaps;
  }

  function addDistanceWalls(out, ctx, rng, options) {
    const step = options.step;
    const length = Math.abs(ctx.zEnd - ctx.zStart);
    const count = Math.ceil(length / step);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < count; i++) {
        const along = Math.min(length, i * step + rng() * step * 0.18);
        const z = Math.max(Math.min(ctx.zStart, ctx.zEnd), Math.min(Math.max(ctx.zStart, ctx.zEnd), Math.max(ctx.zStart, ctx.zEnd) - along));
        if (options.sparse && !keepAt(z, ctx, rng, .12)) continue;
        const half = ctx.halfWidthAt(z);
        const edgeHeight = featherWeight(z, ctx);
        const h = (options.minH + rng() * (options.maxH - options.minH)) * (.34 + .66 * edgeHeight);
        const w = options.minW + rng() * (options.maxW - options.minW);
        const d = step * (options.depthMin + rng() * (options.depthMax - options.depthMin));
        out.walls.push({
          side,
          x: side * (half + options.offset + rng() * options.jitter),
          z,
          w,
          h,
          d,
          yaw: (rng() - .5) * options.yaw,
          variant: Math.floor(rng() * 4),
          strata: rng()
        });
      }
    }
  }

  function addArenaWalls(out, ctx, rng, options) {
    if (!options.count) return;
    const count = arenaCount(ctx, options.count, 1);
    for (let i = 0; i < count; i++) {
      if (options.sparse && rng() > options.sparse) continue;
      const angle = (i / count) * Math.PI * 2 + (rng() - .5) * .035;
      const rr = ctx.radius + options.offset + rng() * options.jitter;
      out.walls.push({
        side: 0,
        x: Math.cos(angle) * rr,
        z: Math.sin(angle) * rr,
        w: options.minW + rng() * (options.maxW - options.minW),
        h: options.minH + rng() * (options.maxH - options.minH),
        d: options.minD + rng() * (options.maxD - options.minD),
        yaw: -angle,
        variant: Math.floor(rng() * 4),
        strata: rng()
      });
    }
  }

  function addClouds(out, ctx, rng, count, options = {}) {
    const scaledCount = ctx.mode === 'ARENA'
      ? arenaCount(ctx, count, options.boundary ? 1 : 2)
      : count;
    for (let i = 0; i < scaledCount; i++) {
      let x, z, boundary = false;
      if (ctx.mode === 'ARENA') {
        const angle = rng() * Math.PI * 2;
        const distance = options.boundary
          ? ctx.radius * (.88 + rng() * .25)
          : Math.sqrt(rng()) * (ctx.radius + 120);
        x = Math.cos(angle) * distance;
        z = Math.sin(angle) * distance;
        boundary = !!options.boundary;
      } else if (options.boundary) {
        z = distanceZ(ctx, rng, 10);
        const side = i % 2 ? 1 : -1;
        x = side * ctx.halfWidthAt(z) * (.86 + rng() * .13);
        boundary = true;
      } else {
        z = distanceZ(ctx, rng, 10);
        x = (rng() * 2 - 1) * (ctx.halfWidthAt(z) + 85);
      }
      const width = (options.minW || 42) + rng() * ((options.maxW || 92) - (options.minW || 42));
      out.clouds.push({
        x,
        y: (options.minY || 110) + rng() * ((options.maxY || 320) - (options.minY || 110)),
        z,
        w: width,
        h: width * (.22 + rng() * .16),
        d: width * (.42 + rng() * .28),
        yaw: rng() * Math.PI * 2,
        variant: Math.floor(rng() * 4),
        boundary
      });
    }
  }

  return {
    KEYS,
    emptyLayout,
    featherWeight,
    keepAt,
    distanceZ,
    distanceCount,
    canyonX,
    arenaPoint,
    arenaScale,
    arenaCount,
    arenaClusterCenters,
    clusterPoint,
    solidBounds,
    resolveLayoutOverlaps,
    findSolidOverlaps,
    addDistanceWalls,
    addArenaWalls,
    addClouds
  };
});
