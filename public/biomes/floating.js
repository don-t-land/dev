(function exposeFloating(root, factory) {
  const helpers = typeof module === 'object' && module.exports ? require('./helpers.js') : root.planeBiomeHelpers;
  const api = factory(helpers);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) (root.planeBiomes ||= {}).floating = api;
})(typeof globalThis === 'object' ? globalThis : this, h => {
  'use strict';

  function platform(out, x, y, z, i, rng, scale = 1) {
    const w = (32 + rng() * 40) * scale;
    const d = (26 + rng() * 34) * scale;
    out.platforms.push({
      x, y, z, w, d, h: 10 + rng() * 12,
      rotation: (rng() - .5) * .75,
      variant: i % 4,
      terraces: 2 + Math.floor(rng() * 3),
      silhouette: 'terraced-island',
      shelfSkew: (rng() - .5) * .22,
      undersideDepth: .42 + rng() * .36
    });
  }

  function addDebris(out, base, i, rng) {
    const angle = rng() * Math.PI * 2;
    const distance = 12 + rng() * Math.max(16, base.w * .72);
    out.rocks.push({
      x: base.x + Math.cos(angle) * distance,
      y: base.y - 12 + (rng() - .5) * 48,
      z: base.z + Math.sin(angle) * distance,
      r: 4 + rng() * 8,
      sx: .6 + rng() * .7,
      sy: 1 + rng() * 1.5,
      sz: .6 + rng() * .7,
      yaw: rng() * 6.28,
      pitch: (rng() - .5) * .7,
      variant: i % 4
    });
  }

  function distance(ctx, rng) {
    const out = h.emptyLayout();
    for (let i = 0; i < h.distanceCount(ctx, 4); i++) {
      const z = h.distanceZ(ctx, rng, 70);
      const yaw = rng() * Math.PI * 2;
      out.spires.push({
        x: h.canyonX(ctx, z, rng, 55), z, h: 140 + rng() * 210, r: 10 + rng() * 12,
        yaw, lean: (rng() - .5) * .08, variant: i % 4, floatingNeedle: true,
        silhouette: 'sky-needle', segments: 2 + Math.floor(rng() * 3),
        curve: .025 + rng() * .07, bendYaw: yaw + (rng() - .5) * 1.5,
        taper: .72 + rng() * .18, bulge: .03 + rng() * .09
      });
    }
    for (let i = 0; i < h.distanceCount(ctx, 18); i++) {
      const z = h.distanceZ(ctx, rng, 35);
      if (!h.keepAt(z, ctx, rng, .28)) continue;
      platform(out, h.canyonX(ctx, z, rng, 48), 60 + rng() * 140, z, i, rng);
    }
    const debrisCount = h.distanceCount(ctx, 20);
    for (let i = 0; i < debrisCount; i++) {
      const base = out.platforms[i % Math.max(1, out.platforms.length)];
      if (base) addDebris(out, base, i, rng);
    }
    for (let i = 0; i < h.distanceCount(ctx, 9); i++) {
      const z = h.distanceZ(ctx, rng, 42);
      out.thermals.push({ x: h.canyonX(ctx, z, rng, 55), z, strength: 1.3 });
    }
    for (let i = 0; i < h.distanceCount(ctx, 7); i++) {
      const z = h.distanceZ(ctx, rng, 52);
      out.rings.push({ x: h.canyonX(ctx, z, rng, 48), y: 75 + rng() * 145, z });
    }
    h.addClouds(out, ctx, rng, 24, { boundary: true, minY: 55, maxY: 245, minW: 58, maxW: 124 });
    h.addClouds(out, ctx, rng, 7, { minY: 125, maxY: 330, minW: 48, maxW: 105 });
    return out;
  }

  function arena(ctx, rng) {
    const out = h.emptyLayout();
    const archipelagos = h.arenaClusterCenters(ctx, rng, 5, 90, 120).map(center => ({
      ...center,
      y: 72 + rng() * 112
    }));
    for (let i = 0; i < h.arenaCount(ctx, 5); i++) {
      const center = archipelagos[i % archipelagos.length];
      const p = h.clusterPoint(rng, center, 58, 12);
      const yaw = rng() * Math.PI * 2;
      out.spires.push({
        x: p.x, z: p.z, h: 125 + rng() * 215, r: 10 + rng() * 12,
        yaw, lean: (rng() - .5) * .09, variant: i % 4, floatingNeedle: true,
        silhouette: 'sky-needle', segments: 2 + Math.floor(rng() * 3),
        curve: .025 + rng() * .07, bendYaw: yaw + (rng() - .5) * 1.5,
        taper: .72 + rng() * .18, bulge: .03 + rng() * .09
      });
    }
    for (let i = 0; i < h.arenaCount(ctx, 20); i++) {
      const center = archipelagos[i % archipelagos.length];
      const p = h.clusterPoint(rng, center, 86, 9);
      platform(out, p.x, center.y + (rng() - .5) * 64, p.z, i, rng, .76 + rng() * .42);
    }
    for (let i = 0; i < h.arenaCount(ctx, 24); i++) addDebris(out, out.platforms[i % out.platforms.length], i, rng);
    for (let i = 0; i < h.arenaCount(ctx, 9); i++) { const p = h.arenaPoint(rng, ctx.radius, 48, 72); out.thermals.push({ x: p.x, z: p.z, strength: 1.3 }); }
    for (let i = 0; i < h.arenaCount(ctx, 7); i++) { const p = h.arenaPoint(rng, ctx.radius, 35, 60); out.rings.push({ x: p.x, y: 70 + rng() * 150, z: p.z }); }
    h.addClouds(out, ctx, rng, 28, { boundary: true, minY: 55, maxY: 245, minW: 58, maxW: 128 });
    h.addClouds(out, ctx, rng, 8, { minY: 125, maxY: 330 });
    return out;
  }

  return { id: 'floating', recipe: (ctx, rng) => ctx.mode === 'ARENA' ? arena(ctx, rng) : distance(ctx, rng) };
});
