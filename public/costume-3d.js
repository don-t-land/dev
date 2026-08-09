import * as THREE from 'three';
import './costume-template.js';

const COSTUME_NAME = 'planeCostume';
const costumeTemplates = globalThis.costumeTemplates;

const palette = Object.freeze({
  red: 0xe93645,
  redDark: 0x8d1325,
  white: 0xfffcf0,
  black: 0x111420,
  blackSoft: 0x262a38,
  gold: 0xf4c95d,
  silver: 0xaeb9c8,
  jetDark: 0x303846,
  jetGlow: 0xff8a2c,
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

function makeJetEngine() {
  const engine = new THREE.Group();
  const shell = mesh(
    new THREE.CylinderGeometry(.13, .16, .56, 18),
    material(palette.silver, { metalness: .68, roughness: .26 })
  );
  shell.rotation.x = Math.PI / 2;
  const intake = mesh(
    new THREE.TorusGeometry(.13, .032, 8, 20),
    material(palette.jetDark, { metalness: .72, roughness: .22 })
  );
  intake.position.z = -.28;
  const nozzle = mesh(
    new THREE.TorusGeometry(.15, .035, 8, 20),
    material(palette.black, { metalness: .6, roughness: .3 })
  );
  nozzle.position.z = .28;
  const flame = mesh(
    new THREE.ConeGeometry(.1, .38, 16),
    material(palette.jetGlow, {
      emissive: palette.jetGlow, emissiveIntensity: 2.2, transparent: true, opacity: .9
    })
  );
  flame.rotation.x = Math.PI / 2;
  flame.position.z = .47;
  flame.userData.costumeJetFlame = true;
  engine.add(shell, intake, nozzle, flame);
  return engine;
}

const COSTUME_FACTORIES = Object.freeze({
  santa: makeSantaHat,
  magic: makeMagicHat,
  police: makePoliceLight,
  rudolph: makeRudolphNose,
  jet: makeJetEngine
});

function normalizeCostume(value) {
  return globalThis.costumeState?.normalize?.(value) || {
    hat: ['santa', 'magic', 'police'].includes(value?.hat) ? value.hat : 'none',
    nose: value?.nose === 'rudolph' ? 'rudolph' : 'none',
    wings: value?.wings === 'twin-jets' ? 'twin-jets' : 'none'
  };
}

function createCostumeItem(itemId, layout) {
  const template = costumeTemplates?.ITEMS?.[itemId];
  const factory = template && COSTUME_FACTORIES[template.mesh];
  if (!template || !factory) return null;

  const group = new THREE.Group();
  group.name = template.slot === 'wings' ? 'wingCostume' : `${template.slot}Costume`;
  group.userData.costumeId = template.id;
  group.userData.costumeType = template.type;

  for (const attachment of costumeTemplates.resolveAttachments(itemId, layout)) {
    const object = factory();
    object.name = attachment.name;
    object.position.fromArray(attachment.position);
    object.rotation.fromArray(attachment.rotation);
    object.scale.multiplyScalar(attachment.scale);
    group.add(object);
  }
  return group;
}

function createCostumeGroup(value, layout = 'flight') {
  const costume = normalizeCostume(value);
  const root = new THREE.Group();
  root.name = COSTUME_NAME;
  root.userData.costume = costume;

  for (const slot of costumeTemplates?.SLOT_ORDER || ['hat', 'nose', 'wings']) {
    if (costume[slot] === 'none') continue;
    const item = createCostumeItem(costume[slot], layout);
    if (item) root.add(item);
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
  const key = `${layout}:${(costumeTemplates?.SLOT_ORDER || ['hat', 'nose', 'wings']).map(slot => costume[slot]).join(':')}`;
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
    if (object.userData?.costumeJetFlame && object.material) {
      object.material.emissiveIntensity = 1.7 + Math.sin(seconds * 15) * .5;
      object.scale.z = .9 + Math.sin(seconds * 19) * .12;
    }
    const beacon = object.userData?.costumeBeacon;
    if (!beacon || !object.material) return;
    const active = beacon === 'red' ? redOn : !redOn;
    object.material.emissiveIntensity = active ? 2.4 : .18;
    object.material.opacity = active ? 1 : .58;
  });
}

export {
  costumeTemplates,
  animateCostumes,
  createCostumeGroup,
  createCostumeItem,
  setCostumeOnObject
};
