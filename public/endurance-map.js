(function initEnduranceMap(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EnduranceMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
  'use strict';

  const ARENA_RADIUS = 210;
  const SPAWN_CLEARANCE = Object.freeze({ minRadius: 108, maxRadius: 158 });

  const LANDMARKS = Object.freeze([
    Object.freeze({ id: 'wind-gate', kind: 'wind-gate', silhouette: 'twin-vertical', x: 0, z: 5, height: 78 }),
    Object.freeze({ id: 'cliff-post-office', kind: 'post-office', silhouette: 'low-horizontal', x: -182, z: -52, rotation: 0.24 }),
    Object.freeze({ id: 'white-needle', kind: 'white-needle', silhouette: 'single-spire-ring', x: 170, z: -35, height: 66 }),
  ]);

  const RIDGE = Object.freeze([
    [-194, -116, 66, 26, 70, -0.74, 0],
    [-158, -164, 72, 28, 82, -0.50, 1],
    [-106, -193, 70, 30, 68, -0.26, 0],
    [-47, -208, 72, 28, 76, -0.08, 1],
    [18, -214, 70, 30, 64, 0.08, 0],
    [82, -202, 70, 28, 78, 0.28, 1],
    [137, -178, 68, 30, 88, 0.48, 0],
    [180, -139, 64, 28, 72, 0.68, 1],
    [207, -88, 58, 26, 62, 0.92, 0],
  ].map(([x, z, length, width, height, rotation, tone], index) => Object.freeze({
    id: `ridge-${index + 1}`, x, z, length, width, height, rotation, tone,
  })));

  const TERRACES = Object.freeze([
    [-96, 76, 90, 18, -0.10, 0],
    [-88, 94, 100, 18, -0.08, 1],
    [-76, 112, 106, 18, -0.05, 2],
    [-61, 130, 102, 18, -0.02, 3],
    [-42, 148, 88, 18, 0.02, 4],
  ].map(([x, z, width, depth, rotation, level], index) => Object.freeze({
    id: `terrace-${index + 1}`, x, z, width, depth, rotation, level,
  })));

  const SPIRES = Object.freeze([
    ['gate-west', -14, 5, 78, 7.5, 'wind-gate'],
    ['gate-east', 14, 5, 70, 7, 'wind-gate'],
    ['white-needle-core', 170, -35, 66, 8, 'white-needle'],
    ['post-crag', -178, -58, 48, 9, 'post-office'],
    ['northwest-pillar', -171, -91, 52, 7, 'ridge'],
    ['northeast-pillar', 151, -126, 58, 7.5, 'ridge'],
    ['south-channel-west', -169, 76, 42, 6.5, 'channel'],
    ['south-channel-east', 181, 62, 46, 7, 'channel'],
  ].map(([id, x, z, h, r, role]) => Object.freeze({ id, x, z, h, r, role })));

  const ROCKS = Object.freeze([
    ['gate-drift-a', 47, 62, -34, 7, 'basin'],
    ['gate-drift-b', -56, 84, 31, 6, 'basin'],
    ['gate-drift-c', 29, 112, 72, 5.5, 'basin'],
    ['post-drift-a', -182, 78, -16, 7, 'post'],
    ['post-drift-b', -170, 112, -84, 6, 'post'],
    ['needle-drift-a', 178, 88, 4, 6.5, 'needle'],
    ['needle-drift-b', 164, 126, -76, 5, 'needle'],
    ['ridge-drift-a', -78, 152, -169, 7, 'ridge'],
    ['ridge-drift-b', 76, 176, -174, 8, 'ridge'],
    ['channel-drift-a', 72, 56, 178, 5.5, 'channel'],
    ['channel-drift-b', -82, 96, 174, 6, 'channel'],
    ['high-center', 4, 188, -7, 5, 'basin'],
  ].map(([id, x, y, z, r, role]) => Object.freeze({ id, x, y, z, r, role })));

  const THERMALS = Object.freeze([
    Object.freeze({ id: 'terrace-thermal', x: -76, z: 102, role: 'terrace-core' }),
    Object.freeze({ id: 'gate-thermal', x: 0, z: 4, role: 'gate-lift' }),
    Object.freeze({ id: 'needle-thermal', x: 164, z: -42, role: 'needle-spiral' }),
    Object.freeze({ id: 'ridge-thermal', x: -44, z: -172, role: 'ridge-lift' }),
    Object.freeze({ id: 'post-thermal', x: -171, z: -57, role: 'post-recovery' }),
  ]);

  const RINGS = Object.freeze([
    Object.freeze({ id: 'terrace-ring', x: -70, y: 76, z: 99, rotationY: -0.18, role: 'route' }),
    Object.freeze({ id: 'south-channel-ring', x: 52, y: 82, z: 166, rotationY: 0.22, role: 'route' }),
    Object.freeze({ id: 'needle-ring', x: 158, y: 104, z: -34, rotationY: 0.42, role: 'route' }),
    Object.freeze({ id: 'north-flags-ring', x: 44, y: 124, z: -164, rotationY: -0.28, role: 'route' }),
    Object.freeze({ id: 'ridge-ring', x: -103, y: 106, z: -139, rotationY: -0.44, role: 'route' }),
    Object.freeze({ id: 'gate-shortcut-ring', x: 0, y: 92, z: 4, rotationY: 0, role: 'shortcut' }),
  ]);

  const ROUTE_PATH = Object.freeze([
    [-155, 62], [-126, 86], [-92, 111], [-46, 145], [12, 169], [72, 159],
    [128, 119], [166, 63], [174, -2], [150, -68], [103, -123], [46, -159],
    [-18, -173], [-80, -151], [-132, -111], [-168, -71],
  ]);

  const PALETTE = Object.freeze({
    sky: 0x79bbd0,
    haze: 0xd9ded7,
    sandstone: 0xc8b998,
    sandstoneLight: 0xddd1b5,
    sandstoneShadow: 0x817967,
    rock: 0x747d79,
    basin: 0x657579,
    plaster: 0xe4e0d2,
    metal: 0x4d4940,
    grass: 0xa49b61,
    route: 0xa95643,
    routeLight: 0xd28a69,
  });

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state |= 0;
      state = state + 0x6d2b79f5 | 0;
      let value = Math.imul(state ^ state >>> 15, 1 | state);
      value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function jitter(rng, amount) {
    return (rng() * 2 - 1) * amount;
  }

  function clone(items) {
    return items.map(item => ({ ...item }));
  }

  function createRouteMarkers(rng) {
    return ROUTE_PATH.map(([x, z], index) => ({
      id: `route-marker-${index + 1}`,
      x: x + jitter(rng, 2.2),
      z: z + jitter(rng, 2.2),
      height: 7.5 + rng() * 2.5,
      rotation: Math.atan2(-x, -z) + jitter(rng, 0.08),
      cluster: index % 4 === 0 ? 'double' : 'single',
    }));
  }

  function createGroundRocks(rng) {
    const items = [];
    for (let index = 0; index < 32; index += 1) {
      const inner = index < 10;
      const radius = inner ? 38 + rng() * 48 : 168 + rng() * 32;
      const angle = rng() * Math.PI * 2;
      items.push({
        id: `ground-rock-${index + 1}`,
        x: Math.cos(angle) * radius,
        y: 0.7 + rng() * 1.2,
        z: Math.sin(angle) * radius,
        scale: 0.8 + rng() * 2.4,
        rotation: rng() * Math.PI,
        tone: index % 3,
      });
    }
    return items;
  }

  function createGrassPatches(rng) {
    const items = [];
    for (let index = 0; index < 64; index += 1) {
      const terrace = TERRACES[index % TERRACES.length];
      const outer = index >= 44;
      const angle = rng() * Math.PI * 2;
      const radius = 176 + rng() * 22;
      items.push({
        id: `grass-${index + 1}`,
        x: outer ? Math.cos(angle) * radius : terrace.x + jitter(rng, terrace.width * 0.42),
        z: outer ? Math.sin(angle) * radius : terrace.z + jitter(rng, terrace.depth * 0.36),
        scale: 0.65 + rng() * 0.9,
        rotation: -0.37 + jitter(rng, 0.11),
      });
    }
    return items;
  }

  function createClouds(rng) {
    return Array.from({ length: 8 }, (_, index) => {
      const angle = rng() * Math.PI * 2;
      const radius = 55 + rng() * 245;
      return {
        id: `cloud-${index + 1}`,
        x: Math.cos(angle) * radius,
        y: 135 + rng() * 150,
        z: Math.sin(angle) * radius,
        scale: 0.75 + rng() * 0.75,
      };
    });
  }

  function createEnduranceMap(seed = 0) {
    const normalizedSeed = Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : 0;
    const rng = mulberry32((normalizedSeed ^ 0x8f32d41b) >>> 0);
    return {
      id: 'whitewind-post-canyon',
      name: '백풍 우편협곡',
      seed: normalizedSeed,
      radius: ARENA_RADIUS,
      palette: { ...PALETTE },
      landmarks: clone(LANDMARKS),
      ridge: clone(RIDGE),
      terraces: clone(TERRACES),
      spires: clone(SPIRES),
      rocks: clone(ROCKS),
      thermals: clone(THERMALS),
      rings: clone(RINGS),
      dressing: {
        routeMarkers: createRouteMarkers(rng),
        groundRocks: createGroundRocks(rng),
        grassPatches: createGrassPatches(rng),
      },
      clouds: createClouds(rng),
    };
  }

  function isSpawnCorridorClear(map) {
    const obstacles = [...(map?.spires || []), ...(map?.rocks || [])];
    return obstacles.every(obstacle => {
      const radius = Math.hypot(Number(obstacle.x) || 0, Number(obstacle.z) || 0);
      const extent = Math.max(0, Number(obstacle.r) || 0);
      return radius + extent < SPAWN_CLEARANCE.minRadius
        || radius - extent > SPAWN_CLEARANCE.maxRadius;
    });
  }

  return Object.freeze({
    ARENA_RADIUS,
    SPAWN_CLEARANCE,
    createEnduranceMap,
    isSpawnCorridorClear,
  });
});
