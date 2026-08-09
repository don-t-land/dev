import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FLIGHT_ASSETS = Object.freeze({
  'hot-air-balloon-a': Object.freeze({ url: './assets/flight/hot-air-balloon-a.glb', rotation: [0, 0, 0], targetAxis: 'y', targetSize: 26 }),
  'hot-air-balloon-b': Object.freeze({ url: './assets/flight/hot-air-balloon-b.glb', rotation: [-Math.PI / 2, 0, 0], targetAxis: 'y', targetSize: 26 }),
  'hot-air-balloon-c': Object.freeze({ url: './assets/flight/hot-air-balloon-c.glb', rotation: [0, 0, 0], targetAxis: 'y', targetSize: 26 }),
  'airship-g': Object.freeze({ url: './assets/flight/airship-g.glb', rotation: [0, Math.PI / 2, 0], targetAxis: 'x', targetSize: 42 }),
  'airship-h': Object.freeze({ url: './assets/flight/airship-h.glb', rotation: [0, Math.PI / 2, 0], targetAxis: 'x', targetSize: 42 })
});

const flightAssetLoader = new GLTFLoader();
const flightAssetPromises = new Map();

function normalizeLoadedFlightModel(source, config) {
  const normalized = new THREE.Group();
  source.rotation.set(...config.rotation);
  normalized.add(source);
  normalized.updateMatrixWorld(true);

  let bounds = new THREE.Box3().setFromObject(normalized);
  const size = bounds.getSize(new THREE.Vector3());
  normalized.scale.setScalar(config.targetSize / Math.max(.001, size[config.targetAxis]));
  normalized.updateMatrixWorld(true);

  bounds = new THREE.Box3().setFromObject(normalized);
  normalized.position.sub(bounds.getCenter(new THREE.Vector3()));
  normalized.updateMatrixWorld(true);
  return normalized;
}

function loadFlightAsset(assetKey) {
  const config = FLIGHT_ASSETS[assetKey];
  if (!config) return Promise.reject(new Error(`Unknown flight asset: ${assetKey}`));
  if (!flightAssetPromises.has(assetKey)) {
    const promise = flightAssetLoader.loadAsync(config.url)
      .then(gltf => normalizeLoadedFlightModel(gltf.scene, config))
      .catch(error => {
        if (flightAssetPromises.get(assetKey) === promise) flightAssetPromises.delete(assetKey);
        throw error;
      });
    flightAssetPromises.set(assetKey, promise);
  }
  return flightAssetPromises.get(assetKey);
}

function cloneFlightModel(template, assetKey) {
  const clone = template.clone(true);
  clone.name = assetKey;
  clone.traverse(child => {
    if (!child.isMesh) return;
    child.geometry = child.geometry.clone();
    child.material = Array.isArray(child.material)
      ? child.material.map(material => material.clone())
      : child.material.clone();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(material => { material.userData.flightAssetOwned = true; });
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return clone;
}

function disposeFlightFallback(object) {
  const geometries = new Set();
  const materials = new Set();
  object.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
    const childMaterials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    childMaterials.forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

function standard(color, roughness = .72, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: .08, emissive, emissiveIntensity });
}

function addRopes(group, radius, top, bottom) {
  const points = [];
  for (const side of [-1, 1]) {
    for (const depth of [-1, 1]) {
      points.push(side * radius, top, depth * radius, side * radius * .42, bottom, depth * radius * .42);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x5a3823 })));
}

const AIRSHIP_PROFILE = [
  [-20, .05], [-18, .5], [-14, .86], [-8, 1], [0, 1.04],
  [8, 1], [14, .84], [18, .46], [20, .05]
];

function airshipRadiusAt(x) {
  for (let index = 1; index < AIRSHIP_PROFILE.length; index++) {
    const [nextX, nextRadius] = AIRSHIP_PROFILE[index];
    const [previousX, previousRadius] = AIRSHIP_PROFILE[index - 1];
    if (x <= nextX) {
      const t = (x - previousX) / (nextX - previousX);
      return THREE.MathUtils.lerp(previousRadius, nextRadius, t);
    }
  }
  return AIRSHIP_PROFILE[AIRSHIP_PROFILE.length - 1][1];
}

function makeAirshipEnvelopeGeometry() {
  const radialSegments = 16;
  const positions = [];
  const colors = [];
  const indices = [];
  const top = new THREE.Color(0xfffbd0);
  const side = new THREE.Color(0xb7b583);
  const bottom = new THREE.Color(0x665632);
  const tint = new THREE.Color();

  AIRSHIP_PROFILE.forEach(([x, radius]) => {
    for (let segment = 0; segment < radialSegments; segment++) {
      const angle = segment / radialSegments * Math.PI * 2;
      const vertical = Math.cos(angle);
      positions.push(x, vertical * 6.9 * radius, Math.sin(angle) * 6.25 * radius);
      if (vertical >= 0) tint.copy(side).lerp(top, vertical * .94);
      else tint.copy(side).lerp(bottom, -vertical * .86);
      const longitudinalHighlight = 1 - Math.abs(x) / 22;
      tint.offsetHSL(0, 0, longitudinalHighlight * .045);
      colors.push(tint.r, tint.g, tint.b);
    }
  });

  const startCenter = positions.length / 3;
  positions.push(AIRSHIP_PROFILE[0][0], 0, 0);
  colors.push(side.r, side.g, side.b);
  const endCenter = positions.length / 3;
  positions.push(AIRSHIP_PROFILE[AIRSHIP_PROFILE.length - 1][0], 0, 0);
  colors.push(side.r, side.g, side.b);

  for (let ring = 0; ring < AIRSHIP_PROFILE.length - 1; ring++) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      const a = ring * radialSegments + segment;
      const b = (ring + 1) * radialSegments + segment;
      const c = (ring + 1) * radialSegments + next;
      const d = ring * radialSegments + next;
      indices.push(a, d, b, b, d, c);
    }
  }
  const lastRing = (AIRSHIP_PROFILE.length - 1) * radialSegments;
  for (let segment = 0; segment < radialSegments; segment++) {
    const next = (segment + 1) % radialSegments;
    indices.push(startCenter, next, segment);
    indices.push(endCenter, lastRing + segment, lastRing + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeEllipticalRibGeometry(x, halfWidth = .27) {
  const segments = 16;
  const radius = airshipRadiusAt(x) + .025;
  const positions = [];
  const indices = [];
  for (const offset of [-halfWidth, halfWidth]) {
    for (let segment = 0; segment < segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      positions.push(x + offset, Math.cos(angle) * 6.9 * radius, Math.sin(angle) * 6.25 * radius);
    }
  }
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    indices.push(segment, next, segments + segment, segments + segment, next, segments + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addStrut(group, start, end, radius, material) {
  const direction = end.clone().sub(start);
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 6), material);
  strut.position.copy(start).add(end).multiplyScalar(.5);
  strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  strut.castShadow = true;
  group.add(strut);
  return strut;
}

function makeTailFinGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(6.1, .3);
  shape.lineTo(5.1, 3.25);
  shape.lineTo(1.2, 1.65);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .45, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -.225);
  geometry.computeVertexNormals();
  return geometry;
}

function makeEnginePod(side, materials) {
  const pod = new THREE.Group();
  pod.name = 'airship-engine-pod';
  pod.position.set(7.5, -1.35, side * 4.3);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, 5, 8), materials.metal);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  pod.add(body);

  const cowling = new THREE.Mesh(new THREE.TorusGeometry(1.12, .18, 5, 12), materials.trim);
  cowling.rotation.y = Math.PI / 2;
  cowling.position.x = -2.5;
  pod.add(cowling);

  const propeller = new THREE.Group();
  propeller.name = 'airship-propeller';
  propeller.position.x = 2.72;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .65, 8), materials.trim);
  hub.rotation.z = Math.PI / 2;
  propeller.add(hub);
  for (const angle of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.18, 4.4, .44), materials.propeller);
    blade.rotation.x = angle;
    propeller.add(blade);
  }
  pod.add(propeller);
  pod.userData.propeller = propeller;
  return pod;
}

function makeHotAirBalloon(index = 0) {
  const group = new THREE.Group();
  const colors = [0xf05f4e, 0xffb238, 0x3bc5c9, 0x9b67d7];
  const envelope = new THREE.Mesh(
    new THREE.SphereGeometry(8.2, 18, 14),
    standard(colors[index % colors.length], .78)
  );
  envelope.scale.set(1, 1.22, 1);
  envelope.position.y = 8;
  envelope.castShadow = true;
  group.add(envelope);

  const band = new THREE.Mesh(new THREE.TorusGeometry(6.9, .42, 6, 24), standard(0xffe69a, .68));
  band.rotation.x = Math.PI / 2;
  band.position.y = 9.4;
  group.add(band);

  const basket = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.8, 3.2), standard(0x7a4928, .96));
  basket.position.y = -4.2;
  basket.castShadow = true;
  group.add(basket);
  addRopes(group, 4.8, 1.5, -3.2);
  group.userData.kind = 'hot-air-balloon';
  return group;
}

function makeBalloonAirship(index = 0) {
  const group = new THREE.Group();
  group.name = 'balloon-airship-high-detail';
  const accentColor = index % 2 ? 0x5b3540 : 0x553326;
  const materials = {
    envelope: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, roughness: .38, metalness: .04,
      clearcoat: .48, clearcoatRoughness: .36, sheen: .22, sheenColor: new THREE.Color(0xfff3bd),
      specularIntensity: .72, specularColor: new THREE.Color(0xe7f4ff), flatShading: true
    }),
    trim: new THREE.MeshPhysicalMaterial({ color: accentColor, roughness: .38, metalness: .34, clearcoat: .32, clearcoatRoughness: .28, side: THREE.DoubleSide }),
    metal: new THREE.MeshPhysicalMaterial({ color: 0x3a2925, roughness: .3, metalness: .68, clearcoat: .22 }),
    cabin: new THREE.MeshPhysicalMaterial({ color: 0x50352a, roughness: .52, metalness: .2, clearcoat: .22 }),
    window: new THREE.MeshPhysicalMaterial({ color: 0xffd663, emissive: 0xff9b24, emissiveIntensity: 3.2, roughness: .2, metalness: .06, clearcoat: .7, clearcoatRoughness: .16 }),
    propeller: new THREE.MeshStandardMaterial({ color: 0x251d1b, roughness: .48, metalness: .55 }),
    fin: new THREE.MeshPhysicalMaterial({ color: 0x80624a, roughness: .46, metalness: .14, clearcoat: .3 })
  };

  const envelope = new THREE.Mesh(makeAirshipEnvelopeGeometry(), materials.envelope);
  envelope.name = 'airship-envelope';
  envelope.position.y = 6;
  envelope.castShadow = true;
  envelope.receiveShadow = true;
  group.add(envelope);

  for (const x of [-14, -5, 5, 13.5, 17]) {
    const rib = new THREE.Mesh(makeEllipticalRibGeometry(x), materials.trim);
    rib.name = 'airship-envelope-rib';
    rib.position.y = 6;
    rib.castShadow = true;
    group.add(rib);
  }

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(40.5, .48, .5), materials.trim);
    rail.name = 'airship-side-keel';
    rail.position.set(.4, 5.25, side * 6.22);
    rail.castShadow = true;
    group.add(rail);
  }

  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(11.5, .55, 4.9), materials.metal);
  cabinRoof.name = 'airship-gondola-roof';
  cabinRoof.position.set(1.8, -.35, 0);
  cabinRoof.castShadow = true;
  group.add(cabinRoof);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(9.8, 3.4, 4.2, 2, 1, 1), materials.cabin);
  cabin.name = 'airship-gondola';
  cabin.position.set(1.8, -2.15, 0);
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  group.add(cabin);

  for (const side of [-1, 1]) {
    for (const x of [-1.2, 1.55, 4.3]) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.25, .16), materials.window);
      window.name = 'airship-emissive-window';
      window.position.set(x, -2.05, side * 2.15);
      group.add(window);
    }
  }

  for (const x of [-2.7, 6.1]) {
    for (const side of [-1, 1]) {
      addStrut(group, new THREE.Vector3(x, .4, side * 4.2), new THREE.Vector3(x, -.55, side * 1.85), .13, materials.trim);
    }
  }

  const finGeometry = makeTailFinGeometry();
  const dorsalFin = new THREE.Mesh(finGeometry, materials.fin);
  dorsalFin.name = 'airship-tail-fin';
  dorsalFin.position.set(13.2, 10.75, 0);
  dorsalFin.castShadow = true;
  group.add(dorsalFin);
  for (const side of [-1, 1]) {
    const sideFin = new THREE.Mesh(finGeometry, materials.fin);
    sideFin.name = 'airship-tail-fin';
    sideFin.rotation.x = side * Math.PI / 2;
    sideFin.position.set(13.2, 6, side * 4.65);
    sideFin.castShadow = true;
    group.add(sideFin);
  }

  const propellers = [];
  for (const side of [-1, 1]) {
    const pod = makeEnginePod(side, materials);
    group.add(pod);
    propellers.push(pod.userData.propeller);
  }

  const warmReflection = new THREE.PointLight(0xffb04c, 24, 34, 2);
  warmReflection.name = 'airship-cabin-reflection';
  warmReflection.position.set(1.5, -2.7, 0);
  group.add(warmReflection);
  const coolReflection = new THREE.PointLight(0xbfe9ff, 13, 38, 2);
  coolReflection.name = 'airship-sky-reflection';
  coolReflection.position.set(-4, 17, -2);
  group.add(coolReflection);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.42, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff5d48, emissive: 0xff2818, emissiveIntensity: 4, roughness: .24 }));
  beacon.name = 'airship-navigation-beacon';
  beacon.position.set(8, 12.45, 0);
  group.add(beacon);

  group.userData.propellers = propellers;
  group.userData.kind = 'balloon-airship';
  return group;
}

export function createArenaFlyObjects(descriptors, onAssetSwap) {
  const root = new THREE.Group();
  root.name = 'arena-fly-objects';
  descriptors.forEach((descriptor, index) => {
    const object = new THREE.Group();
    const fallback = descriptor.type === 'balloon-airship'
      ? makeBalloonAirship(index)
      : makeHotAirBalloon(index);
    object.add(fallback);
    object.position.set(descriptor.x, descriptor.y, descriptor.z);
    object.scale.setScalar(descriptor.scale);
    object.rotation.y = -descriptor.angle + Math.PI / 2;
    object.userData.flight = descriptor;
    object.userData.assetKey = descriptor.assetKey;
    object.userData.propellers = fallback.userData.propellers || [];
    root.add(object);

    loadFlightAsset(descriptor.assetKey).then(template => {
      if (!root.parent || object.parent !== root) return;
      const loaded = cloneFlightModel(template, descriptor.assetKey);
      object.remove(fallback);
      object.add(loaded);
      object.userData.assetLoaded = true;
      object.userData.propellers = [];
      onAssetSwap?.({ loaded, fallback });
      disposeFlightFallback(fallback);
    }).catch(error => {
      console.warn(`Unable to load ${descriptor.assetKey}; keeping procedural fallback.`, error);
    });
  });
  return root;
}

export function animateArenaFlyObjects(root, elapsedSeconds) {
  if (!root) return;
  for (const object of root.children) {
    const flight = object.userData.flight;
    if (!flight) continue;
    const angle = flight.angle + elapsedSeconds * flight.drift;
    object.position.x = Math.cos(angle) * flight.orbitRadius;
    object.position.z = Math.sin(angle) * flight.orbitRadius;
    object.position.y = flight.y + Math.sin(elapsedSeconds * .42 + flight.phase) * 7;
    object.rotation.y = -angle + Math.PI / 2;
    object.rotation.z = Math.sin(elapsedSeconds * .28 + flight.phase) * .025;
    for (let index = 0; index < (object.userData.propellers?.length || 0); index++) {
      object.userData.propellers[index].rotation.x = elapsedSeconds * 13 + flight.phase + index * .7;
    }
  }
}

export function createFinishLine(distanceLength, halfWidth) {
  const root = new THREE.Group();
  root.name = 'distance-finish-line';
  root.position.z = -distanceLength;
  const postMaterial = standard(0x17273a, .46, 0x19b7e8, .5);
  const glowMaterial = standard(0xeefcff, .34, 0x42dfff, 2.4);
  const darkMaterial = standard(0x151b24, .82);
  const height = 45;
  const width = Math.max(70, halfWidth * 2);

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(4.2, height, 4.2), postMaterial);
    post.position.set(side * width / 2, height / 2, 0);
    post.castShadow = true;
    root.add(post);
    for (let y = 5; y < height; y += 8) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.8, 4.6), y % 16 === 5 ? glowMaterial : darkMaterial);
      light.position.set(side * width / 2, y, 0);
      root.add(light);
    }
  }

  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 4, 5.5, 4.2), postMaterial);
  beam.position.y = height;
  root.add(beam);
  for (let x = -width / 2 + 3; x < width / 2; x += 7) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 4.5), Math.round((x + width / 2) / 7) % 2 ? glowMaterial : darkMaterial);
    panel.position.set(x, height, 0);
    root.add(panel);
  }

  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 8),
    new THREE.MeshBasicMaterial({ color: 0x50e6ff, transparent: true, opacity: .78, side: THREE.DoubleSide })
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = .22;
  root.add(line);

  const banner = new THREE.Sprite(new THREE.SpriteMaterial({ map: finishLabelTexture(), transparent: true, depthTest: false }));
  banner.position.set(0, height - 9, 1.5);
  banner.scale.set(42, 11, 1);
  root.add(banner);
  return root;
}

function finishLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(4, 16, 29, .88)';
  context.fillRect(16, 18, canvas.width - 32, canvas.height - 36);
  context.strokeStyle = '#55e8ff';
  context.lineWidth = 8;
  context.strokeRect(16, 18, canvas.width - 32, canvas.height - 36);
  context.fillStyle = '#effcff';
  context.font = '900 76px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('FINISH', canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
