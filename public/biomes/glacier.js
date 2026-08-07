(function exposeGlacier(root, factory) {
  const helpers = typeof module === 'object' && module.exports ? require('./helpers.js') : root.planeBiomeHelpers;
  const api = factory(helpers);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) (root.planeBiomes ||= {}).glacier = api;
})(typeof globalThis === 'object' ? globalThis : this, h => {
  'use strict';

  function shard(out, x, z, rng, arena = false) {
    const yaw = rng() * Math.PI * 2;
    out.spires.push({
      x, z, h: 42 + rng() * (arena ? 128 : 76), r: 8 + rng() * 11,
      yaw, lean: (rng() - .5) * .2, variant: Math.floor(rng() * 4),
      cluster: true, silhouette: 'crystal-fan', segments: 1,
      fanYaw: yaw + (rng() - .5) * .9,
      taper: .8 + rng() * .16,
      bulge: 0,
      layoutPattern: arena ? 'crystal-grove' : 'crevasse-edge'
    });
  }

  function rock(out, x, y, z, r, i, rng) {
    out.rocks.push({ x, y, z, r, sx: .55 + rng() * .55, sy: 1.15 + rng() * 1.15, sz: .55 + rng() * .55, yaw: rng() * 6.28, pitch: (rng() - .5) * .8, variant: i % 4 });
  }

  function distance(ctx, rng) {
    const out = h.emptyLayout();
    h.addDistanceWalls(out, ctx, rng, {
      step: 38, minH: 140, maxH: 260, minW: 24, maxW: 42,
      depthMin: .88, depthMax: 1.18, offset: 8, jitter: 12, yaw: .08
    });
    for (let i = 0; i < h.distanceCount(ctx, 14); i++) {
      const z = h.distanceZ(ctx, rng, 30);
      if (h.keepAt(z, ctx, rng, .25)) shard(out, h.canyonX(ctx, z, rng, 34), z, rng);
    }
    for (let i = 0; i < h.distanceCount(ctx, 24); i++) {
      const z = h.distanceZ(ctx, rng, 25);
      if (!h.keepAt(z, ctx, rng, .2)) continue;
      rock(out, h.canyonX(ctx, z, rng, 24), 90 + Math.pow(rng(), .55) * 140, z, 5 + rng() * 7, i, rng);
    }
    for (let i = 0; i < h.distanceCount(ctx, 3); i++) {
      const z = h.distanceZ(ctx, rng, 70);
      out.thermals.push({ x: h.canyonX(ctx, z, rng, 45), z, strength: .78 });
    }
    for (let i = 0; i < h.distanceCount(ctx, 6); i++) {
      const z = h.distanceZ(ctx, rng, 55);
      out.rings.push({ x: h.canyonX(ctx, z, rng, 36), y: 55 + rng() * 145, z });
    }
    h.addClouds(out, ctx, rng, 8, { minY: 105, maxY: 245, minW: 48, maxW: 96 });
    return out;
  }

  function arena(ctx, rng) {
    const out = h.emptyLayout();
    h.addArenaWalls(out, ctx, rng, { count: 64, offset: 18, jitter: 12, minW: 24, maxW: 42, minH: 145, maxH: 255, minD: 26, maxD: 43 });
    const clusters = h.arenaClusterCenters(ctx, rng, 4, 80, 105);
    for (let i = 0; i < h.arenaCount(ctx, 12); i++) {
      const p = h.clusterPoint(rng, clusters[i % clusters.length], 48, 6);
      shard(out, p.x, p.z, rng, true);
    }
    for (let i = 0; i < h.arenaCount(ctx, 25); i++) {
      const p = h.clusterPoint(rng, clusters[i % clusters.length], 92, 18);
      rock(out, p.x, 90 + Math.pow(rng(), .55) * 140, p.z, 5 + rng() * 7, i, rng);
    }
    for (let i = 0; i < h.arenaCount(ctx, 5); i++) { const p = h.arenaPoint(rng, ctx.radius, 55, 85); out.thermals.push({ x: p.x, z: p.z, strength: .78 }); }
    for (let i = 0; i < h.arenaCount(ctx, 6); i++) { const p = h.arenaPoint(rng, ctx.radius, 35, 65); out.rings.push({ x: p.x, y: 55 + rng() * 145, z: p.z }); }
    h.addClouds(out, ctx, rng, 14, { minY: 100, maxY: 260 });
    return out;
  }

  return { id: 'glacier', recipe: (ctx, rng) => ctx.mode === 'ARENA' ? arena(ctx, rng) : distance(ctx, rng) };
});
