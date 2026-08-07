(function exposeDesert(root, factory) {
  const helpers = typeof module === 'object' && module.exports
    ? require('./helpers.js')
    : root.planeBiomeHelpers;
  const api = factory(helpers);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) (root.planeBiomes ||= {}).desert = api;
})(typeof globalThis === 'object' ? globalThis : this, h => {
  'use strict';

  function addSpire(out, x, z, height, radius, rng) {
    const yaw = rng() * Math.PI * 2;
    out.spires.push({
      x, z, h: height, r: radius, yaw,
      lean: (rng() - .5) * .08,
      variant: Math.floor(rng() * 4),
      silhouette: 'sand-needle',
      segments: 2 + Math.floor(rng() * 3),
      curve: .018 + rng() * .055,
      bendYaw: yaw + (rng() - .5) * 1.7,
      taper: .68 + rng() * .2,
      bulge: .03 + rng() * .08
    });
  }

  function distance(ctx, rng) {
    const out = h.emptyLayout();
    h.addDistanceWalls(out, ctx, rng, {
      step: 42, minH: 55, maxH: 150, minW: 30, maxW: 54,
      depthMin: .94, depthMax: 1.28, offset: 10, jitter: 17, yaw: .12
    });
    for (let i = 0; i < h.distanceCount(ctx, 22); i++) {
      const z = h.distanceZ(ctx, rng, 35);
      if (!h.keepAt(z, ctx, rng, .2)) continue;
      addSpire(out, h.canyonX(ctx, z, rng, 28), z, 45 + rng() * 125, 6 + rng() * 8, rng);
    }
    for (let i = 0; i < h.distanceCount(ctx, 15); i++) {
      const z = h.distanceZ(ctx, rng, 30);
      if (!h.keepAt(z, ctx, rng, .2)) continue;
      out.rocks.push({ x: h.canyonX(ctx, z, rng, 25), y: 30 + rng() * 145, z, r: 5 + rng() * 7, sx: .8 + rng() * .7, sy: .65 + rng() * .55, sz: .8 + rng() * .7, yaw: rng() * 6.28, variant: i % 4 });
    }
    for (let i = 0; i < h.distanceCount(ctx, 5); i++) {
      const z = h.distanceZ(ctx, rng, 80);
      out.thermals.push({ x: h.canyonX(ctx, z, rng, 44), z, strength: 1 });
    }
    for (let i = 0; i < h.distanceCount(ctx, 7); i++) {
      const z = h.distanceZ(ctx, rng, 55);
      out.rings.push({ x: h.canyonX(ctx, z, rng, 40), y: 48 + rng() * 150, z });
    }
    const length = Math.abs(ctx.zEnd - ctx.zStart);
    const start = Math.max(ctx.zStart, ctx.zEnd);
    out.landmarks.push(
      { type: 'wind-gate', x: 0, y: 0, z: start - length * .24, scale: 1 },
      { type: 'post-office', x: ctx.halfWidthAt(start - length * .54) * .72, y: 0, z: start - length * .54, scale: .9 },
      { type: 'white-needle', x: -ctx.halfWidthAt(start - length * .79) * .48, y: 0, z: start - length * .79, scale: 1.05 }
    );
    h.addClouds(out, ctx, rng, 5, { minY: 155, maxY: 315, minW: 50, maxW: 100 });
    return out;
  }

  function arena(ctx, rng) {
    const out = h.emptyLayout();
    h.addArenaWalls(out, ctx, rng, { count: 56, offset: 20, jitter: 16, minW: 28, maxW: 48, minH: 60, maxH: 145, minD: 28, maxD: 46 });
    const clusters = h.arenaClusterCenters(ctx, rng, 5, 75, 100);
    for (let i = 0; i < h.arenaCount(ctx, 15); i++) {
      const p = h.clusterPoint(rng, clusters[i % clusters.length], 56, 8);
      addSpire(out, p.x, p.z, 55 + rng() * 125, 6 + rng() * 8, rng);
    }
    for (let i = 0; i < h.arenaCount(ctx, 18); i++) {
      const p = h.clusterPoint(rng, clusters[i % clusters.length], 82, 16);
      out.rocks.push({ x: p.x, y: 35 + rng() * 150, z: p.z, r: 5 + rng() * 7, sx: .8 + rng() * .7, sy: .7 + rng() * .5, sz: .8 + rng() * .7, yaw: rng() * 6.28, variant: i % 4 });
    }
    for (let i = 0; i < h.arenaCount(ctx, 8); i++) {
      const p = h.arenaPoint(rng, ctx.radius, 50, 80);
      out.thermals.push({ x: p.x, z: p.z, strength: 1 });
    }
    for (let i = 0; i < h.arenaCount(ctx, 6); i++) {
      const p = h.arenaPoint(rng, ctx.radius, 40, 70);
      out.rings.push({ x: p.x, y: 45 + rng() * 150, z: p.z });
    }
    out.landmarks.push({ type: 'wind-gate', x: 0, y: 0, z: -ctx.radius * .55, scale: 1.05 });
    h.addClouds(out, ctx, rng, 12, { minY: 130, maxY: 320 });
    return out;
  }

  return { id: 'desert', recipe: (ctx, rng) => ctx.mode === 'ARENA' ? arena(ctx, rng) : distance(ctx, rng) };
});
