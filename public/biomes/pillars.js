(function exposePillars(root, factory) {
  const helpers = typeof module === 'object' && module.exports ? require('./helpers.js') : root.planeBiomeHelpers;
  const api = factory(helpers);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) (root.planeBiomes ||= {}).pillars = api;
})(typeof globalThis === 'object' ? globalThis : this, h => {
  'use strict';

  function addPillar(out, x, z, i, rng, arena = false) {
    const yaw = rng() * Math.PI * 2;
    out.spires.push({
      x, z,
      h: (arena ? 58 : 64) + rng() * (arena ? 226 : 170),
      r: 5 + rng() * (arena ? 9 : 7),
      yaw,
      lean: (rng() - .5) * .055,
      variant: i % 4,
      crown: .7 + rng() * .5,
      silhouette: 'bent-column',
      segments: 3 + Math.floor(rng() * 4),
      curve: .045 + rng() * .145,
      bendYaw: yaw + (rng() - .5) * 2.2,
      kink: (rng() - .5) * .065,
      taper: .22 + rng() * .24,
      bulge: .08 + rng() * .18,
      fork: rng() > .76,
      forkSide: rng() > .5 ? 1 : -1,
      layoutPattern: arena ? 'golden-spiral' : 'alternating-slalom'
    });
  }

  function distance(ctx, rng) {
    const out = h.emptyLayout();
    h.addDistanceWalls(out, ctx, rng, {
      step: 128, minH: 40, maxH: 82, minW: 42, maxW: 74,
      depthMin: .65, depthMax: 1.08, offset: 16, jitter: 24, yaw: .22, sparse: true
    });
    const count = h.distanceCount(ctx, 55);
    const minZ = Math.min(ctx.zStart, ctx.zEnd) + 35;
    const maxZ = Math.max(ctx.zStart, ctx.zEnd) - 35;
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count;
      const z = maxZ + (minZ - maxZ) * t + (rng() - .5) * 22;
      if (!h.keepAt(z, ctx, rng, .28)) continue;
      const half = Math.max(25, ctx.halfWidthAt(z) - 26);
      const lane = (i % 2 ? 1 : -1) * half * (.34 + rng() * .42);
      addPillar(out, lane, z, i, rng);
      if (i % 7 === 0) addPillar(out, -lane * .72, z - 18, i + 1, rng);
      if (i % 4 === 1) out.rings.push({ x: -lane * .55, y: 60 + rng() * 125, z: z - 26 });
    }
    for (let i = 0; i < h.distanceCount(ctx, 6); i++) {
      const z = h.distanceZ(ctx, rng, 25);
      out.rocks.push({ x: h.canyonX(ctx, z, rng, 24), y: 45 + rng() * 120, z, r: 4 + rng() * 6, sx: .75 + rng() * .5, sy: 1 + rng(), sz: .75 + rng() * .5, yaw: rng() * 6.28, variant: i % 4 });
    }
    for (let i = 0; i < h.distanceCount(ctx, 7); i++) {
      const z = h.distanceZ(ctx, rng, 45);
      out.thermals.push({ x: h.canyonX(ctx, z, rng, 45), z, strength: 1.08 });
    }
    h.addClouds(out, ctx, rng, 7, { minY: 105, maxY: 260, minW: 38, maxW: 78 });
    return out;
  }

  function arena(ctx, rng) {
    const out = h.emptyLayout();
    h.addArenaWalls(out, ctx, rng, { count: 36, sparse: .55, offset: 26, jitter: 24, minW: 42, maxW: 72, minH: 40, maxH: 85, minD: 34, maxD: 64 });
    const count = h.arenaCount(ctx, 42);
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963 + (rng() - .5) * .12;
      const d = 42 + Math.sqrt((i + 1) / count) * (ctx.radius - 88);
      addPillar(out, Math.cos(angle) * d, Math.sin(angle) * d, i, rng, true);
      if (i % 5 === 2) out.rings.push({ x: Math.cos(angle + .22) * d * .82, y: 55 + rng() * 130, z: Math.sin(angle + .22) * d * .82 });
    }
    for (let i = 0; i < h.arenaCount(ctx, 6); i++) {
      const p = h.arenaPoint(rng, ctx.radius, 55, 90);
      out.thermals.push({ x: p.x, z: p.z, strength: 1.08 });
    }
    h.addClouds(out, ctx, rng, 10, { minY: 110, maxY: 280 });
    return out;
  }

  return { id: 'pillars', recipe: (ctx, rng) => ctx.mode === 'ARENA' ? arena(ctx, rng) : distance(ctx, rng) };
});
