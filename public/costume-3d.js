import * as THREE from 'three';

const COSTUME_NAME = 'planeCostume';

const palette = Object.freeze({
  red: 0xe93645,
  redDark: 0x8d1325,
  white: 0xfffcf0,
  black: 0x111420,
  blackSoft: 0x262a38,
  gold: 0xf4c95d,
  silver: 0xaeb9c8,
  policeRed: 0xff304f,
  policeBlue: 0x2f7dff
});

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .48, metalness: .04, ...options });
}

function mesh(geometry, surface) {
  const part = new THREE.Mesh(geometry, surface);
  part.castShadow = true;
  return part;
}

function makeSantaHat() {
  const hat = new THREE.Group();
  const red = material(palette.red, { roughness: .7 });
  const white = material(palette.white, { roughness: .86 });
  const brim = mesh(new THREE.TorusGeometry(.38, .105, 10, 28), white);
  brim.rotation.x = Math.PI / 2;
  brim.position.y = .08;
  const cone = mesh(new THREE.ConeGeometry(.34, .8, 24), red);
  cone.position.y = .5;
  cone.rotation.z = -.16;
  const tip = mesh(new THREE.SphereGeometry(.14, 18, 12), white);
  tip.position.set(-.13, .88, 0);
  hat.add(brim, cone, tip);
  return hat;
}

function makeMagicHat() {
  const hat = new THREE.Group();
  const black = material(palette.black, { roughness: .4, metalness: .08 });
  const band = material(palette.redDark, { roughness: .5 });
  const brim = mesh(new THREE.CylinderGeometry(.55, .55, .08, 32), black);
  brim.position.y = .08;
  const crown = mesh(new THREE.CylinderGeometry(.31, .38, .72, 28), black);
  crown.position.y = .47;
  const ribbon = mesh(new THREE.CylinderGeometry(.385, .385, .15, 28), band);
  ribbon.position.y = .2;
  hat.add(brim, crown, ribbon);
  return hat;
}

function makePoliceLight() {
  const light = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(.52, .58, .14, 28), material(palette.blackSoft, { metalness: .38 }));
  base.position.y = .08;
  const rail = mesh(new THREE.BoxGeometry(.92, .12, .28), material(palette.silver, { metalness: .55, roughness: .3 }));
  rail.position.y = .19;
  const red = mesh(
    new THREE.CapsuleGeometry(.16, .2, 8, 16),
    material(palette.policeRed, { transparent: true, opacity: .88, emissive: palette.policeRed, emissiveIntensity: 1.8 })
  );
  red.rotation.z = Math.PI / 2;
  red.position.set(-.25, .34, 0);
  red.userData.costumeBeacon = 'red';
  const blue = mesh(
    new THREE.CapsuleGeometry(.16, .2, 8, 16),
    material(palette.policeBlue, { transparent: true, opacity: .88, emissive: palette.policeBlue, emissiveIntensity: .25 })
  );
  blue.rotation.z = Math.PI / 2;
  blue.position.set(.25, .34, 0);
  blue.userData.costumeBeacon = 'blue';
  light.add(base, rail, red, blue);
  return light;
}

function makeRudolphNose() {
  const nose = mesh(
    new THREE.SphereGeometry(.23, 24, 16),
    material(palette.red, { roughness: .3, emissive: 0x7d0712, emissiveIntensity: .45 })
  );
  nose.scale.set(1, .88, 1);
  return nose;
}

const FLIGHT_ANCHORS = Object.freeze({
  hat: Object.freeze({ position: [.79, .18, .47], scale: .72 }),
  nose: Object.freeze({ position: [0, .02, -1.96], scale: 1 })
});

const STANDING_ANCHORS = Object.freeze({
  hat: Object.freeze({ position: [1.24, -.33, .31], scale: .82 }),
  nose: Object.freeze({ position: [0, 3.52, -.2], scale: 1.18 })
});

function normalizeCostume(value) {
  return globalThis.costumeState?.normalize?.(value) || {
    hat: ['santa', 'magic', 'police'].includes(value?.hat) ? value.hat : 'none',
    nose: value?.nose === 'rudolph' ? 'rudolph' : 'none'
  };
}

function createCostumeGroup(value, layout = 'flight') {
  const costume = normalizeCostume(value);
  const anchors = layout === 'standing' ? STANDING_ANCHORS : FLIGHT_ANCHORS;
  const root = new THREE.Group();
  root.name = COSTUME_NAME;
  root.userData.costume = costume;

  const hat = costume.hat === 'santa' ? makeSantaHat()
    : costume.hat === 'magic' ? makeMagicHat()
      : costume.hat === 'police' ? makePoliceLight() : null;
  if (hat) {
    hat.name = 'hatCostume';
    hat.position.fromArray(anchors.hat.position);
    hat.scale.setScalar(anchors.hat.scale);
    root.add(hat);
  }

  if (costume.nose === 'rudolph') {
    const nose = makeRudolphNose();
    nose.name = 'noseCostume';
    nose.position.fromArray(anchors.nose.position);
    nose.scale.multiplyScalar(anchors.nose.scale);
    root.add(nose);
  }
  return root;
}

function disposeCostume(root) {
  root?.traverse?.(object => {
    object.geometry?.dispose?.();
    const surfaces = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    surfaces.forEach(surface => surface.dispose?.());
  });
  root?.removeFromParent?.();
}

function setCostumeOnObject(owner, value, layout = 'flight') {
  if (!owner) return null;
  const costume = normalizeCostume(value);
  const key = `${layout}:${costume.hat}:${costume.nose}`;
  const current = owner.getObjectByName(COSTUME_NAME);
  if (current?.userData.costumeKey === key) return current;
  disposeCostume(current);
  const group = createCostumeGroup(costume, layout);
  group.userData.costumeKey = key;
  owner.add(group);
  return group;
}

function animateCostumes(root, seconds) {
  const redOn = Math.floor(seconds * 3.5) % 2 === 0;
  root?.traverse?.(object => {
    const beacon = object.userData?.costumeBeacon;
    if (!beacon || !object.material) return;
    const active = beacon === 'red' ? redOn : !redOn;
    object.material.emissiveIntensity = active ? 2.4 : .18;
    object.material.opacity = active ? 1 : .58;
  });
}

export {
  FLIGHT_ANCHORS,
  STANDING_ANCHORS,
  animateCostumes,
  createCostumeGroup,
  setCostumeOnObject
};
