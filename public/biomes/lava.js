(function exposeLava(root, factory) {
  const helpers = typeof module === 'object' && module.exports ? require('./helpers.js') : root.planeBiomeHelpers;
  const api = factory(helpers);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) (root.planeBiomes ||= {}).lava = api;
})(typeof globalThis === 'object' ? globalThis : this, h => {
  'use strict';

  function chimney(out, x, z, i, rng, arena = false) {
    const yaw = rng() * Math.PI * 2;
    out.spires.push({
      x, z, h: 105 + rng() * (arena ? 220 : 185), r: 5 + rng() * 7,
      yaw, lean: (rng() - .5) * .07, variant: i % 4,
      crater: true, glow: .65 + rng() * .35,
      silhouette: 'crooked-chimney',
      segments: 2 + Math.floor(rng() * 3),
      curve: .02 + rng() * .075,
      bendYaw: yaw + (rng() - .5) * 1.2,
      kink: (rng() - .5) * .045,
      taper: .14 + rng() * .18,
      bulge: .04 + rng() * .12,
      layoutPattern: arena ? 'radial-fissure' : 'edge-chain'
    });
  }

  function distance(ctx, rng) {
    const out = h.emptyLayout();
    h.addDistanceWalls(out, ctx, rng, {
      step: 40, minH: 100, maxH: 185, minW: 27, maxW: 49,
      depthMin: .9, depthMax: 1.22, offset: 8, jitter: 13, yaw: .1
    });
    for (let i = 0; i < h.distanceCount(ctx, 28); i++) {
      const z = h.distanceZ(ctx, rng, 28);
      if (!h.keepAt(z, ctx, rng, .26)) continue;
      const half = Math.max(18, ctx.halfWidthAt(z) - 20);
      const side = i % 2 ? 1 : -1;
      chimney(out, side * half * (.66 + rng() * .27), z, i, rng);
    }
    for (let i = 0; i < h.distanceCount(ctx, 12); i++) {
      const z = h.distanceZ(ctx, rng, 25);
      out.rocks.push({ x: h.canyonX(ctx, z, rng, 25), y: 35 + rng() * 145, z, r: 5 + rng() * 7, sx: .8 + rng() * .55, sy: .75 + rng() * .9, sz: .8 + rng() * .55, yaw: rng() * 6.28, variant: i % 4, glow: rng() > .62 });
    }
    for (let i = 0; i < h.distanceCount(ctx, 11); i++) {
      const z = h.distanceZ(ctx, rng, 42);
      const x = h.canyonX(ctx, z, rng, 42);
      const strength = 1.6;
      out.thermals.push({ x, z, strength, hot: true });
      if (i % 2 === 0) out.rings.push({ x, y: 150 + rng() * 85, z: z - 8 });
    }
    h.addClouds(out, ctx, rng, 9, { minY: 120, maxY: 285, minW: 42, maxW: 88 });
    return out;
  }

  function arena(ctx, rng) {
    const out = h.emptyLayout();
    h.addArenaWalls(out, ctx, rng, { count: 60, offset: 16, jitter: 14, minW: 27, maxW: 48, minH: 105, maxH: 188, minD: 27, maxD: 47 });
    const fissureCount = h.arenaCount(ctx, 11, 1);
    const fissures = Array.from({ length: fissureCount }, (_, index) =>
      index / fissureCount * Math.PI * 2 + (rng() - .5) * .14);
    const chimneyCount = h.arenaCount(ctx, 24);
    const chimneySteps = Math.ceil(chimneyCount / fissureCount);
    for (let i = 0; i < chimneyCount; i++) {
      const fissure = fissures[i % fissureCount];
      const step = Math.floor(i / fissureCount);
      const distance = 72 + ((step + .35 + rng() * .3) / (chimneySteps + .3)) * (ctx.radius - 145);
      const lateral = (rng() - .5) * 34;
      const x = Math.cos(fissure) * distance + Math.cos(fissure + Math.PI / 2) * lateral;
      const z = Math.sin(fissure) * distance + Math.sin(fissure + Math.PI / 2) * lateral;
      chimney(out, x, z, i, rng, true);
    }
    for (let i = 0; i < h.arenaCount(ctx, 14); i++) {
      const fissure = fissures[i % fissureCount];
      const distance = 45 + Math.sqrt(rng()) * (ctx.radius - 100);
      const lateral = (rng() - .5) * 72;
      const x = Math.cos(fissure) * distance + Math.cos(fissure + Math.PI / 2) * lateral;
      const z = Math.sin(fissure) * distance + Math.sin(fissure + Math.PI / 2) * lateral;
      out.rocks.push({ x, y: 35 + rng() * 150, z, r: 5 + rng() * 7, sx: .8 + rng() * .55, sy: .8 + rng() * .8, sz: .8 + rng() * .55, yaw: rng() * 6.28, variant: i % 4, glow: rng() > .6 });
    }
    for (let i = 0; i < h.arenaCount(ctx, 11); i++) {
      const p = h.arenaPoint(rng, ctx.radius, 45, 76);
      out.thermals.push({ x: p.x, z: p.z, strength: 1.6, hot: true });
      if (i % 2 === 0) out.rings.push({ x: p.x, y: 150 + rng() * 80, z: p.z });
    }
    h.addClouds(out, ctx, rng, 11, { minY: 120, maxY: 290 });
    return out;
  }

  return { id: 'lava', recipe: (ctx, rng) => ctx.mode === 'ARENA' ? arena(ctx, rng) : distance(ctx, rng) };
});
