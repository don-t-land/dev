import * as THREE from 'three';

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
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(10, 22, 14),
    standard(index % 2 ? 0x6e5bd4 : 0xe46d3f, .7)
  );
  hull.scale.set(1.8, .78, .78);
  hull.position.y = 5;
  hull.castShadow = true;
  group.add(hull);

  const stripe = new THREE.Mesh(new THREE.TorusGeometry(7.7, .5, 7, 26), standard(0xffd75f, .58));
  stripe.rotation.y = Math.PI / 2;
  stripe.scale.y = 1.3;
  stripe.position.y = 5;
  group.add(stripe);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(8.5, 3.1, 3.3), standard(0x764429, .9));
  cabin.position.y = -3.1;
  cabin.castShadow = true;
  group.add(cabin);
  addRopes(group, 6.2, 1.8, -2.2);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(4.2, 8, 4), standard(0xe9d9b8, .84));
  tail.rotation.z = -Math.PI / 2;
  tail.position.x = 20;
  group.add(tail);
  group.userData.kind = 'balloon-airship';
  return group;
}

export function createArenaFlyObjects(descriptors) {
  const root = new THREE.Group();
  root.name = 'arena-fly-objects';
  descriptors.forEach((descriptor, index) => {
    const object = descriptor.type === 'balloon-airship'
      ? makeBalloonAirship(index)
      : makeHotAirBalloon(index);
    object.position.set(descriptor.x, descriptor.y, descriptor.z);
    object.scale.setScalar(descriptor.scale);
    object.rotation.y = -descriptor.angle + Math.PI / 2;
    object.userData.flight = descriptor;
    root.add(object);
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
