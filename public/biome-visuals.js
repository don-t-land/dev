import * as THREE from 'three';

const WALL_TOPS = [
  [0, .08, -.03, .13, .02, .09],
  [.06, -.02, .1, 0, .14, .04],
  [-.02, .12, .04, -.04, .1, .02],
  [.1, .01, .14, -.03, .04, .11]
];

function facetedWallGeometry(variant = 0) {
  const top = WALL_TOPS[variant % WALL_TOPS.length];
  const positions = [];
  const push = (...values) => positions.push(...values);
  const tri = (a, b, c) => push(...a, ...b, ...c);
  for (let i = 0; i < 5; i++) {
    const x0 = i / 5 - .5;
    const x1 = (i + 1) / 5 - .5;
    const y0 = .88 + top[i];
    const y1 = .88 + top[i + 1];
    const f0 = [x0, 0, .5], f1 = [x1, 0, .5], ft0 = [x0, y0, .5], ft1 = [x1, y1, .5];
    const b0 = [x0, 0, -.5], b1 = [x1, 0, -.5], bt0 = [x0, y0, -.5], bt1 = [x1, y1, -.5];
    tri(f0, f1, ft1); tri(f0, ft1, ft0);
    tri(b1, b0, bt0); tri(b1, bt0, bt1);
    tri(ft0, ft1, bt1); tri(ft0, bt1, bt0);
    tri(b0, b1, f1); tri(b0, f1, f0);
  }
  const left = -.5, right = .5;
  tri([left, 0, -.5], [left, 0, .5], [left, .88 + top[0], .5]);
  tri([left, 0, -.5], [left, .88 + top[0], .5], [left, .88 + top[0], -.5]);
  tri([right, 0, .5], [right, 0, -.5], [right, .88 + top[5], -.5]);
  tri([right, 0, .5], [right, .88 + top[5], -.5], [right, .88 + top[5], .5]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function weatheredRockGeometry(seed) {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const scale = .83 + ((Math.sin((i + 1) * (seed + 2) * 12.9898) + 1) * .5) * .26;
    position.setXYZ(i, x * scale, y * (scale * .94 + .06), z * (1.08 - (scale - .83) * .35));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function weatheredPillarGeometry() {
  const geometry = new THREE.CylinderGeometry(.5, .92, 1, 7, 7, false);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const normalizedY = y + .5;
    const ring = 1 + Math.sin(normalizedY * Math.PI * 5.2) * .045;
    const weather = 1 + Math.sin((i + 3) * 4.713) * .018;
    const brokenTop = normalizedY > .96 ? x * .11 + z * .055 : 0;
    position.setXYZ(i, x * ring * weather, y + brokenTop, z * ring / weather);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.translate(0, .5, 0);
  return geometry;
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? .91,
    metalness: options.metalness ?? 0,
    flatShading: true,
    transparent: options.opacity !== undefined,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    side: options.side ?? THREE.FrontSide,
    depthWrite: options.depthWrite ?? true
  });
}

function createMesh(root, geometry, meshMaterial, items, transform, castShadow = true) {
  if (!items.length) {
    geometry.dispose();
    return null;
  }
  const mesh = new THREE.InstancedMesh(geometry, meshMaterial, items.length);
  const object = new THREE.Object3D();
  items.forEach((item, index) => {
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.set(1, 1, 1);
    transform(object, item, index);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
  });
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function groupByBiome(layout, key, count) {
  const groups = Array.from({ length: count }, () => []);
  for (const item of layout[key] || []) groups[item.biome]?.push(item);
  return groups;
}

function addWalls(root, groups, biomes, materials) {
  groups.forEach((items, biomeIndex) => {
    if (!items.length) return;
    const palette = biomes[biomeIndex].terrain;
    const baseMat = material(palette.wall, { roughness: biomeIndex === 2 ? .68 : .96 });
    const accentMat = material(palette.wallAccent, biomeIndex === 3
      ? { emissive: palette.wallAccent, emissiveIntensity: 1.7, roughness: .65 }
      : { opacity: biomeIndex === 2 ? .34 : .72, roughness: biomeIndex === 2 ? .35 : .88 });
    materials.push(baseMat, accentMat);
    createMesh(root, facetedWallGeometry(biomeIndex), baseMat, items, (o, wall) => {
      o.position.set(wall.x, 0, wall.z);
      o.rotation.y = wall.yaw || 0;
      o.scale.set(wall.w, wall.h, wall.d);
    });
    const bandGeometry = new THREE.BoxGeometry(1, 1, 1);
    createMesh(root, bandGeometry, accentMat, items, (o, wall, index) => {
      const level = biomeIndex === 2 ? .72 : biomeIndex === 3 ? .28 + (index % 3) * .17 : .36 + (index % 2) * .25;
      o.position.set(wall.x, wall.h * level, wall.z);
      o.rotation.y = wall.yaw || 0;
      o.scale.set(wall.w * (biomeIndex === 3 ? .94 : 1.015), Math.max(.55, wall.h * (biomeIndex === 2 ? .018 : .012)), wall.d * 1.018);
    }, false);
  });
}

function spireGeometry(biome) {
  if (biome === 1) return weatheredPillarGeometry();
  if (biome === 2) return new THREE.ConeGeometry(1, 1, 5, 2);
  if (biome === 3) return new THREE.CylinderGeometry(.72, 1, 1, 8, 3, true);
  if (biome === 4) return new THREE.CylinderGeometry(.42, .88, 1, 7, 2);
  return new THREE.CylinderGeometry(.62, 1, 1, 7, 2);
}

function spirePoseAt(spire, t, biome) {
  const fallbackCurve = [0.035, .1, 0, .045, .05][biome] || 0;
  const curve = spire.curve ?? fallbackCurve;
  const bendYaw = spire.bendYaw ?? ((spire.yaw || 0) + ((spire.variant || 0) - 1.5) * .42);
  const bend = curve * spire.h * Math.pow(t, 1.58);
  const lean = Math.tan(spire.lean || 0) * spire.h * t;
  const wave = (spire.kink || 0) * spire.h * Math.sin(t * Math.PI * 1.7);
  return new THREE.Vector3(
    spire.x + Math.cos(bendYaw) * (bend + lean) + Math.cos(bendYaw + Math.PI / 2) * wave,
    spire.h * t,
    spire.z + Math.sin(bendYaw) * (bend + lean) + Math.sin(bendYaw + Math.PI / 2) * wave
  );
}

function spireRadiusAt(spire, t, biome) {
  const fallbackTaper = biome === 1 ? .34 : biome === 3 ? .18 : .72;
  const taper = spire.taper ?? fallbackTaper;
  const bulge = spire.bulge ?? (biome === 1 ? .12 : .04);
  return Math.max(.16, 1 - taper * t + Math.sin(t * Math.PI) * bulge);
}

function spireSegmentEntries(items, biome) {
  return items.flatMap((spire, index) => {
    const fallback = biome === 2 ? 1 : biome === 1 ? 4 : 3;
    const count = Math.max(1, Math.min(7, spire.segments || fallback));
    return Array.from({ length: count }, (_, segment) => ({
      spire, index, segment, count,
      t0: segment / count,
      t1: (segment + 1) / count
    }));
  });
}

function alignSpireSegment(object, entry, biome, radiusFactor = 1) {
  const p0 = spirePoseAt(entry.spire, entry.t0, biome);
  const p1 = spirePoseAt(entry.spire, entry.t1, biome);
  const direction = p1.clone().sub(p0);
  const length = Math.max(.01, direction.length());
  const mid = (entry.t0 + entry.t1) * .5;
  const radius = entry.spire.r * spireRadiusAt(entry.spire, mid, biome) * radiusFactor;
  object.position.copy(p0);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  object.rotateY((entry.spire.yaw || 0) + entry.segment * .11);
  object.scale.set(radius, length * 1.035, radius);
}

function addSpires(root, groups, biomes, materials) {
  groups.forEach((items, biomeIndex) => {
    if (!items.length) return;
    const palette = biomes[biomeIndex].terrain;
    const baseMat = material(palette.spire, { roughness: biomeIndex === 2 ? .58 : .94 });
    const accentMat = material(palette.wallAccent, biomeIndex === 3
      ? { emissive: palette.wallAccent, emissiveIntensity: 2.1, roughness: .45 }
      : { opacity: biomeIndex === 2 ? .4 : .82, roughness: .62 });
    materials.push(baseMat, accentMat);
    const primary = spireGeometry(biomeIndex);
    if (biomeIndex !== 1) primary.translate(0, .5, 0);
    const segments = spireSegmentEntries(items, biomeIndex);
    createMesh(root, primary, baseMat, segments, (o, entry) => alignSpireSegment(o, entry, biomeIndex));

    if (biomeIndex === 1) {
      const crown = new THREE.CylinderGeometry(.38, .72, .2, 6, 1);
      createMesh(root, crown, accentMat, items, (o, s) => {
        o.position.copy(spirePoseAt(s, .91, biomeIndex));
        o.rotation.y = s.yaw || 0;
        o.scale.set(s.r * 1.05, s.h * .32, s.r * 1.05);
      });
      const collars = items.flatMap((s, index) => [
        { ...s, level: .28 + (index % 3) * .04 },
        { ...s, level: .58 + (index % 2) * .07 }
      ]);
      const collar = new THREE.TorusGeometry(1, .085, 5, 7); collar.rotateX(Math.PI / 2);
      createMesh(root, collar, accentMat, collars, (o, s) => {
        const taper = 1 - s.level * .34;
        o.position.copy(spirePoseAt(s, s.level, biomeIndex));
        o.rotation.y = s.yaw || 0;
        o.scale.set(s.r * taper, s.r * taper, s.r * taper);
      });
      const roots = items.flatMap((s, index) => [0, 1, 2].map(side => ({ ...s, side, salt: index })));
      const rootShard = new THREE.ConeGeometry(1, 1, 5, 1); rootShard.translate(0, .5, 0);
      createMesh(root, rootShard, baseMat, roots, (o, s) => {
        const angle = (s.yaw || 0) + s.side * Math.PI * 2 / 3 + (s.salt % 2) * .24;
        o.position.set(s.x + Math.cos(angle) * s.r * .68, 0, s.z + Math.sin(angle) * s.r * .68);
        o.rotation.set(Math.cos(angle) * .18, angle, -Math.sin(angle) * .18);
        o.scale.set(s.r * .38, s.h * (.12 + s.side * .018), s.r * .38);
      });
      const forkItems = items.filter(s => s.fork);
      const fork = new THREE.CylinderGeometry(.24, .68, 1, 6, 2); fork.translate(0, .5, 0);
      createMesh(root, fork, baseMat, forkItems, (o, s, index) => {
        const base = spirePoseAt(s, .43 + (index % 3) * .07, biomeIndex);
        const angle = (s.bendYaw || s.yaw || 0) + (s.forkSide || 1) * (1.05 + (index % 2) * .22);
        const length = s.h * (.19 + (index % 3) * .025);
        const end = base.clone().add(new THREE.Vector3(Math.cos(angle) * length * .62, length * .78, Math.sin(angle) * length * .62));
        const direction = end.sub(base);
        o.position.copy(base);
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
        o.rotateY(s.yaw || 0);
        o.scale.set(s.r * .52, direction.length(), s.r * .52);
      });
    } else if (biomeIndex === 2) {
      const shard = new THREE.ConeGeometry(1, 1, 5, 1); shard.translate(0, .5, 0);
      const companions = items.flatMap((s, i) => [
        { ...s, side: -1, salt: i }, { ...s, side: 1, salt: i + 7 }
      ]);
      createMesh(root, shard, accentMat, companions, (o, s) => {
        const angle = (s.yaw || 0) + s.side * 1.08;
        o.position.set(s.x + Math.cos(angle) * s.r * .58, 0, s.z + Math.sin(angle) * s.r * .58);
        o.rotation.set(s.side * .15, angle, s.side * .18);
        o.scale.set(s.r * .36, s.h * (.44 + (s.salt % 3) * .08), s.r * .36);
      });
    } else if (biomeIndex === 3) {
      const glow = new THREE.CylinderGeometry(.34, .58, 1, 8, 1); glow.translate(0, .5, 0);
      createMesh(root, glow, accentMat, segments, (o, entry) => alignSpireSegment(o, entry, biomeIndex, .52), false);
      const rim = new THREE.TorusGeometry(1, .18, 6, 10); rim.rotateX(Math.PI / 2);
      createMesh(root, rim, baseMat, items, (o, s) => {
        o.position.copy(spirePoseAt(s, .96, biomeIndex));
        o.rotation.y = s.yaw || 0;
        o.scale.set(s.r * .72, s.r * .72, s.r * .72);
      });
    } else {
      const collar = new THREE.TorusGeometry(1, .1, 5, 9); collar.rotateX(Math.PI / 2);
      createMesh(root, collar, accentMat, items, (o, s, index) => {
        const level = biomeIndex === 4 ? .68 : .52 + (index % 2) * .12;
        o.position.copy(spirePoseAt(s, level, biomeIndex));
        o.scale.set(s.r * (biomeIndex === 4 ? .56 : .72), s.r * .56, s.r * (biomeIndex === 4 ? .56 : .72));
      });
    }
  });
}

function addRocks(root, groups, biomes, materials) {
  groups.forEach((items, biomeIndex) => {
    if (!items.length) return;
    const palette = biomes[biomeIndex].terrain;
    const rockMat = material(palette.rock, { roughness: biomeIndex === 2 ? .54 : .94 });
    materials.push(rockMat);
    createMesh(root, weatheredRockGeometry(biomeIndex), rockMat, items, (o, rock) => {
      o.position.set(rock.x, rock.y, rock.z);
      o.rotation.set(rock.pitch || ((rock.variant || 0) - 1.5) * .17, rock.yaw || 0, ((rock.variant || 0) - 1.5) * .21);
      o.scale.set(rock.r * (rock.sx || 1), rock.r * (rock.sy || 1), rock.r * (rock.sz || 1));
    });
    if (biomeIndex === 2 || biomeIndex === 3) {
      const accent = material(palette.wallAccent, biomeIndex === 3
        ? { emissive: palette.wallAccent, emissiveIntensity: 1.8, roughness: .5 }
        : { opacity: .42, roughness: .28 });
      materials.push(accent);
      createMesh(root, weatheredRockGeometry(biomeIndex + 11), accent, items.filter((_, i) => i % 3 === 0), (o, rock) => {
        o.position.set(rock.x, rock.y + rock.r * .14, rock.z);
        o.rotation.y = rock.yaw || 0;
        o.scale.set(rock.r * (rock.sx || 1) * .72, rock.r * (rock.sy || 1) * .74, rock.r * (rock.sz || 1) * .72);
      }, false);
    }
  });
}

function addPlatforms(root, items, biome, materials) {
  if (!items.length) return;
  const palette = biome.terrain;
  const stone = material(palette.platform, { roughness: .96 });
  const top = material(palette.top, { roughness: .88 });
  const edge = material(palette.wallAccent, { opacity: .62, roughness: .7 });
  materials.push(stone, top, edge);

  const shelf = new THREE.CylinderGeometry(1, .72, 1, 9, 2);
  createMesh(root, shelf, stone, items, (o, island) => {
    o.position.set(island.x, island.y, island.z);
    o.rotation.set((island.shelfSkew || 0) * .32, island.rotation || 0, island.shelfSkew || 0);
    o.scale.set(island.w * .5, island.h, island.d * .5);
  });
  const cap = new THREE.CylinderGeometry(1, 1, .12, 9, 1);
  createMesh(root, cap, top, items, (o, island) => {
    o.position.set(island.x, island.y + island.h * .52, island.z);
    o.rotation.y = island.rotation || 0;
    o.scale.set(island.w * .49, Math.max(1, island.h * .18), island.d * .49);
  });
  const underside = new THREE.ConeGeometry(1, 1, 9, 3); underside.rotateZ(Math.PI);
  createMesh(root, underside, stone, items, (o, island) => {
    const depth = Math.max(18, Math.min(62, island.w * (island.undersideDepth || .62)));
    o.position.set(island.x, island.y - island.h * .55 - depth * .42, island.z);
    o.rotation.set(0, island.rotation || 0, (island.shelfSkew || 0) * .22);
    o.scale.set(island.w * .43, depth, island.d * .43);
  });
  const terraceItems = items.flatMap(island => Array.from({ length: island.terraces || 2 }, (_, tier) => ({ island, tier })));
  const terrace = new THREE.CylinderGeometry(1, .92, .16, 9, 1);
  createMesh(root, terrace, edge, terraceItems, (o, entry) => {
    const { island, tier } = entry;
    const scale = .8 - tier * .13;
    o.position.set(island.x, island.y + island.h * .62 + tier * 1.6, island.z);
    o.rotation.y = (island.rotation || 0) + tier * .12;
    o.scale.set(island.w * .5 * scale, Math.max(1, island.h * .12), island.d * .5 * scale);
  }, false);
}

function addClouds(root, groups, biomes, materials) {
  groups.forEach((clouds, biomeIndex) => {
    if (!clouds.length) return;
    const color = biomes[biomeIndex].terrain.cloud;
    const cloudMat = material(color, { opacity: biomeIndex === 3 ? .68 : .82, roughness: 1, depthWrite: false, side: THREE.DoubleSide });
    const shadeColor = new THREE.Color(color).multiplyScalar(biomeIndex === 3 ? .48 : .78);
    const shadeMat = material(shadeColor, { opacity: .34, roughness: 1, depthWrite: false });
    materials.push(cloudMat, shadeMat);
    const offsets = [
      [-.3, .02, .02, .36], [-.12, .2, -.08, .43], [.14, .23, .04, .5], [.34, .04, -.04, .34], [.03, -.02, .18, .44]
    ];
    const puffs = clouds.flatMap(cloud => offsets.map((offset, index) => ({ cloud, offset, index })));
    createMesh(root, new THREE.IcosahedronGeometry(1, 1), cloudMat, puffs, (o, entry) => {
      const { cloud, offset, index } = entry;
      const cos = Math.cos(cloud.yaw || 0), sin = Math.sin(cloud.yaw || 0);
      const ox = offset[0] * cloud.w, oz = offset[2] * cloud.d;
      o.position.set(cloud.x + ox * cos - oz * sin, cloud.y + offset[1] * cloud.h, cloud.z + ox * sin + oz * cos);
      const variation = 1 + (((cloud.variant || 0) + index) % 3 - 1) * .08;
      o.scale.set(cloud.w * offset[3] * variation, cloud.h * (.55 + offset[3]) * variation, cloud.d * offset[3] * variation);
    }, false);
    createMesh(root, new THREE.IcosahedronGeometry(1, 1), shadeMat, clouds, (o, cloud) => {
      o.position.set(cloud.x, cloud.y - cloud.h * .27, cloud.z + cloud.d * .06);
      o.rotation.y = cloud.yaw || 0;
      o.scale.set(cloud.w * .42, cloud.h * .27, cloud.d * .4);
    }, false);
  });
}

function addLandmarks(root, items, biomes, materials) {
  for (const mark of items) {
    const palette = biomes[mark.biome].terrain;
    const group = new THREE.Group();
    group.position.set(mark.x, mark.y || 0, mark.z);
    group.scale.setScalar(mark.scale || 1);
    const stone = material(palette.wall, { roughness: .92 });
    const trim = material(palette.wallAccent, { roughness: .72 });
    materials.push(stone, trim);
    if (mark.type === 'wind-gate') {
      for (const side of [-1, 1]) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 8.5, 42, 7, 3), stone);
        tower.position.set(side * 18, 21, 0); tower.castShadow = true; group.add(tower);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 6.2, 4, 7), trim);
        cap.position.set(side * 18, 43, 0); group.add(cap);
      }
      const arch = new THREE.Mesh(new THREE.TorusGeometry(18, 2.4, 7, 28, Math.PI), trim);
      arch.position.y = 42; group.add(arch);
      const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(7, 19, 1, 4), material(0xe95d55, { opacity: .82, roughness: .8, side: THREE.DoubleSide }));
      materials.push(ribbon.material); ribbon.position.set(0, 32, -.4); ribbon.rotation.z = .04; group.add(ribbon);
    } else if (mark.type === 'post-office') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(27, 18, 20), stone); body.position.y = 9; body.castShadow = true; group.add(body);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 23, 4, 1, false, Math.PI / 4), trim);
      roof.rotation.z = Math.PI / 2; roof.position.y = 21; roof.scale.y = .62; group.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(7, 11, .7), material(0x694738, { roughness: .86 }));
      materials.push(door.material); door.position.set(0, 6, 10.2); group.add(door);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), material(0xf3e5c8, { side: THREE.DoubleSide }));
      materials.push(sign.material); sign.position.set(10, 16, 10.5); group.add(sign);
    } else if (mark.type === 'white-needle') {
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(.8, 7.5, 78, 7, 4), trim);
      needle.position.y = 39; needle.castShadow = true; group.add(needle);
      const deck = new THREE.Mesh(new THREE.TorusGeometry(8.5, 1.3, 7, 24), stone);
      deck.rotateX(Math.PI / 2); deck.position.y = 55; group.add(deck);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 18, 7), trim); cap.position.y = 87; group.add(cap);
    }
    root.add(group);
  }
}

export function buildBiomeEnvironment({ layout, biomes }) {
  const root = new THREE.Group();
  root.name = 'biome-environment';
  const materials = [];
  const wallGroups = groupByBiome(layout, 'walls', biomes.length);
  const spireGroups = groupByBiome(layout, 'spires', biomes.length);
  const rockGroups = groupByBiome(layout, 'rocks', biomes.length);
  const cloudGroups = groupByBiome(layout, 'clouds', biomes.length);
  addWalls(root, wallGroups, biomes, materials);
  addSpires(root, spireGroups, biomes, materials);
  addRocks(root, rockGroups, biomes, materials);
  addClouds(root, cloudGroups, biomes, materials);
  for (let i = 0; i < biomes.length; i++) addPlatforms(root, (layout.platforms || []).filter(item => item.biome === i), biomes[i], materials);
  addLandmarks(root, layout.landmarks || [], biomes, materials);
  root.userData.dispose = () => {
    root.traverse(object => object.geometry?.dispose?.());
    for (const item of new Set(materials)) item.dispose?.();
  };
  return {
    root,
    spires: (layout.spires || []).map(s => ({ x: s.x, z: s.z, h: s.h, r: s.r })),
    rocks: (layout.rocks || []).map(r => ({ p: new THREE.Vector3(r.x, r.y, r.z), r: r.r * Math.max(r.sx || 1, r.sy || 1, r.sz || 1) })),
    platforms: (layout.platforms || []).map(p => ({ x: p.x, y: p.y, z: p.z, w: p.w, h: p.h, d: p.d, rotation: p.rotation || 0 }))
  };
}
