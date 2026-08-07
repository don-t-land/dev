import * as THREE from 'three';
import { animateCostumes, setCostumeOnObject } from './costume-3d.js';
import { applyPaperSurface } from './showroom-materials.js';

const UP = new THREE.Vector3(0, 1, 0);

function makeFacet(points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(point => [
    (point[0] - minX) / Math.max(.001, maxX - minX),
    (point[1] - minY) / Math.max(.001, maxY - minY)
  ]), 2));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function makeLimb(from, to, radius, material) {
  const delta = new THREE.Vector3().subVectors(to, from);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(.08, delta.length() - radius * 2), 8, 14),
    material
  );
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
  mesh.castShadow = true;
  return mesh;
}

function makeJoint(radius, material) {
  const joint = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 12), material);
  joint.castShadow = true;
  return joint;
}

function makeShoe(materials, side) {
  const shoe = new THREE.Group();
  const { upper, accent, sole } = materials;

  const upperShell = new THREE.Mesh(new THREE.CapsuleGeometry(.255, .38, 9, 18), upper);
  upperShell.rotation.x = Math.PI / 2;
  upperShell.scale.set(1.08, .76, 1);
  upperShell.position.set(0, -.03, .2);

  const toeCap = new THREE.Mesh(new THREE.SphereGeometry(.255, 20, 14), upper);
  toeCap.scale.set(1.12, .72, 1.18);
  toeCap.position.set(side * .018, -.055, .47);

  const outsole = new THREE.Mesh(new THREE.BoxGeometry(.6, .1, .84, 2, 1, 3), sole);
  outsole.position.set(0, -.235, .22);
  outsole.rotation.x = -.025;

  const sideMark = new THREE.Mesh(new THREE.BoxGeometry(.3, .045, .09), accent);
  sideMark.position.set(side * .258, -.035, .28);
  sideMark.rotation.z = side * -.16;

  for (const part of [upperShell, toeCap, outsole, sideMark]) {
    part.castShadow = true;
    part.receiveShadow = true;
    shoe.add(part);
  }
  shoe.rotation.y = side * -.08;
  return shoe;
}

function makeLeg(side, materials) {
  const rig = new THREE.Group();
  rig.name = side < 0 ? 'leftLegRig' : 'rightLegRig';

  const hip = new THREE.Group();
  hip.position.set(side * .51, -1.12, .34);
  rig.add(hip);

  const upperEnd = new THREE.Vector3(side * .075, -.66, .055);
  hip.add(makeLimb(new THREE.Vector3(), upperEnd, .145, materials.leg));

  const knee = new THREE.Group();
  knee.position.copy(upperEnd);
  hip.add(knee);
  knee.add(makeJoint(.17, materials.joint));

  const lowerEnd = new THREE.Vector3(side * .035, -.67, .16);
  knee.add(makeLimb(new THREE.Vector3(0, -.02, 0), lowerEnd, .13, materials.leg));

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.19, .18, .22, 14), materials.cuff);
  cuff.position.copy(lowerEnd).add(new THREE.Vector3(0, -.02, 0));
  cuff.castShadow = true;
  knee.add(cuff);

  const shoe = makeShoe(materials, side);
  shoe.position.copy(lowerEnd).add(new THREE.Vector3(0, -.17, .03));
  knee.add(shoe);

  rig.userData = { hip, knee, shoe };
  return rig;
}

function makeStandingPlaneMascot(costume = null) {
  const mascot = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'foldedPaperBody';

  const materials = {
    paperWhite: new THREE.MeshStandardMaterial({ color: 0xf8feff, roughness: .73, metalness: .02, side: THREE.DoubleSide, flatShading: true }),
    paperCyan: new THREE.MeshStandardMaterial({ color: 0x72e4f0, roughness: .66, metalness: .03, side: THREE.DoubleSide, flatShading: true }),
    foldBlue: new THREE.MeshStandardMaterial({ color: 0x3b77b9, roughness: .62, metalness: .06, side: THREE.DoubleSide, flatShading: true }),
    leg: new THREE.MeshStandardMaterial({ color: 0x243e77, roughness: .48, metalness: .08 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x31548e, roughness: .45, metalness: .08 }),
    cuff: new THREE.MeshStandardMaterial({ color: 0x7be1ee, roughness: .58, metalness: .03 }),
    upper: new THREE.MeshStandardMaterial({ color: 0xf7fcff, roughness: .43, metalness: .03 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x66ddeb, roughness: .4, metalness: .06 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x10265b, roughness: .5, metalness: .08 })
  };

  const nose = [0, 3.48, -.12];
  const center = [0, -1.08, .67];
  const leftTip = [-2.22, -1.39, .18];
  const rightTip = [2.22, -1.39, .18];

  body.add(
    makeFacet([nose, leftTip, center], materials.paperCyan),
    makeFacet([nose, center, rightTip], materials.paperWhite)
  );

  const ridge = makeLimb(new THREE.Vector3(0, 3.31, -.16), new THREE.Vector3(0, -1.06, .68), .038, materials.foldBlue);
  ridge.scale.x = .72;
  body.add(ridge);
  mascot.add(body);

  const leftLeg = makeLeg(-1, materials);
  const rightLeg = makeLeg(1, materials);
  mascot.add(leftLeg, rightLeg);

  mascot.userData = { body, leftLeg, rightLeg };
  applyPaperSurface(body);
  if (costume) setCostumeOnObject(mascot, costume, 'standing');
  return mascot;
}

function mountHomePlane() {
  const canvas = document.getElementById('home-plane-canvas');
  const stage = canvas?.closest('.home-plane-stage');
  if (!canvas || !stage) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, .1, 100);
  camera.position.set(0, .18, 14.3);
  camera.lookAt(0, .05, 0);

  const mascot = makeStandingPlaneMascot(globalThis.costumeState?.load?.());
  mascot.position.y = .47;
  mascot.rotation.y = -.24;
  mascot.rotation.z = -.025;
  scene.add(mascot);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 48),
    new THREE.MeshBasicMaterial({ color: 0x061337, transparent: true, opacity: .42, depthWrite: false })
  );
  shadow.scale.set(1.25, .42, 1);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -2.55, .28);
  scene.add(shadow);

  scene.add(new THREE.HemisphereLight(0xc8f3ff, 0x152551, 2.35));
  const key = new THREE.DirectionalLight(0xfff3cf, 3.5);
  key.position.set(-3.5, 6.4, 7.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -4;
  scene.add(key);

  const rim = new THREE.PointLight(0x65deff, 24, 19);
  rim.position.set(4.5, 1.2, 3.5);
  scene.add(rim);
  const floorGlow = new THREE.PointLight(0x9c70ff, 13, 12);
  floorGlow.position.set(0, -3, 3.4);
  scene.add(floorGlow);

  let pointerX = 0;
  let pointerY = 0;
  const homeScreen = document.getElementById('home-screen');
  homeScreen?.addEventListener('pointermove', event => {
    const rect = homeScreen.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width - .5) * 2;
    pointerY = ((event.clientY - rect.top) / rect.height - .5) * 2;
  }, { passive: true });
  homeScreen?.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
  window.addEventListener('paper-plane-costume-changed', event => {
    setCostumeOnObject(mascot, event.detail?.costume, 'standing');
  });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.position.z = window.innerWidth <= 780 ? 16 : 14.3;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  stage.dataset.webglPlane = 'true';

  const { body, leftLeg, rightLeg } = mascot.userData;
  const left = leftLeg.userData;
  const right = rightLeg.userData;

  function render(now) {
    const t = now * .001;
    const breath = Math.sin(t * 1.8);
    const sway = Math.sin(t * .78);
    const step = Math.sin(t * 1.42);

    mascot.position.y = .47 + breath * .055;
    mascot.rotation.y += ((-.24 + pointerX * .16 + sway * .055) - mascot.rotation.y) * .045;
    mascot.rotation.x += ((pointerY * .045) - mascot.rotation.x) * .04;
    mascot.rotation.z = -.025 + sway * .025;

    body.position.y = Math.max(0, breath) * .045;
    body.rotation.z = sway * .018;
    body.rotation.x = Math.sin(t * 1.1) * .012;

    left.hip.rotation.x = -.11 + step * .085;
    right.hip.rotation.x = -.11 - step * .085;
    left.hip.rotation.z = -.035 + sway * .025;
    right.hip.rotation.z = .035 + sway * .025;
    left.knee.rotation.x = .18 + Math.max(0, -step) * .09;
    right.knee.rotation.x = .18 + Math.max(0, step) * .09;
    left.shoe.rotation.x = -.06 - Math.max(0, -step) * .07;
    right.shoe.rotation.x = -.06 - Math.max(0, step) * .07;

    shadow.material.opacity = .38 - Math.max(0, breath) * .045;
    shadow.scale.x = 1.25 - Math.max(0, breath) * .025;
    key.position.x = -3.5 + Math.sin(t * .42) * .65;
    animateCostumes(mascot, t);

    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHomePlane, { once: true });
else mountHomePlane();

export { makeStandingPlaneMascot };
