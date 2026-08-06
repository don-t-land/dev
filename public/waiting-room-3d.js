import * as THREE from 'three';
import { makeStandingPlaneMascot } from './home-plane-3d.js';

const SLOT_EDGE_PADDING_PX = 10;
const PLAYER_INFO_CLEARANCE_PX = 56;
const MOBILE_MAX_ACTOR_SCALE = .76;
const DESKTOP_MAX_ACTOR_SCALE = .94;
const actors = [];
const raycaster = new THREE.Raycaster();
const slotPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const slotPoint = new THREE.Vector3();
let mounted = false;
let renderer;
let scene;
let camera;
let canvas;
let stage;
let resizeObserver;

function hashHue(id) {
  let value = 0;
  for (const char of String(id || '')) value = (value * 33 + char.charCodeAt(0)) >>> 0;
  return (value % 360) / 360;
}

function tintMascot(mascot, id) {
  const accent = new THREE.Color().setHSL(hashHue(id), .66, .61);
  let index = 0;
  mascot.traverse(object => {
    if (!object.isMesh || !object.material?.color) return;
    if (index === 0 || index === 2 || index === 6 || index === 10) {
      object.material = object.material.clone();
      object.material.color.lerp(accent, .48);
    }
    index += 1;
  });
}

function makeActor(index) {
  const mascot = makeStandingPlaneMascot();
  mascot.position.set(0, 0, 0);
  mascot.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(mascot);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const actor = { mascot, bounds, size, center, id: null, ready: false, host: false };
  scene.add(mascot);
  return actor;
}

function screenToWorldOnPlane(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(slotPlane, slotPoint) ? slotPoint.clone() : null;
}

function alignActorsToSlots() {
  if (!canvas || !camera) return;
  const canvasBlock = canvas.getBoundingClientRect();
  const mobile = canvasBlock.width < 760;
  const slots = document.querySelectorAll('.room-player-slot[data-slot-index]');
  slots.forEach(slot => {
    const index = Number(slot.dataset.slotIndex);
    const actor = actors[index];
    if (!actor) return;
    const block = slot.getBoundingClientRect();
    const centerX = block.left + block.width / 2;
    const feetLineY = block.bottom - PLAYER_INFO_CLEARANCE_PX;
    const fitTopY = mobile ? block.top + SLOT_EDGE_PADDING_PX : canvasBlock.top + SLOT_EDGE_PADDING_PX;
    const left = screenToWorldOnPlane(block.left + SLOT_EDGE_PADDING_PX, feetLineY);
    const right = screenToWorldOnPlane(block.right - SLOT_EDGE_PADDING_PX, feetLineY);
    const top = screenToWorldOnPlane(centerX, fitTopY);
    const bottom = screenToWorldOnPlane(centerX, feetLineY);
    if (!left || !right || !top || !bottom) return;

    const widthScale = Math.abs(right.x - left.x) / actor.size.x;
    const heightScale = Math.abs(top.y - bottom.y) / actor.size.y;
    const maxScale = mobile ? MOBILE_MAX_ACTOR_SCALE : DESKTOP_MAX_ACTOR_SCALE;
    const scale = Math.min(maxScale, widthScale, heightScale);

    actor.mascot.scale.setScalar(scale);
    actor.mascot.position.x = bottom.x - actor.center.x * scale;
    actor.mascot.position.y = bottom.y - actor.bounds.min.y * scale;
    actor.mascot.position.z = 0;
  });
}

function resize() {
  if (!canvas || !renderer) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.position.z = rect.width < 760 ? 21 : 18;
  camera.position.y = rect.width < 760 ? .15 : .4;
  camera.updateProjectionMatrix();
  alignActorsToSlots();
}

function mount() {
  if (mounted) return true;
  canvas = document.getElementById('waiting-room-canvas');
  stage = canvas?.closest('.waiting-room-stage');
  if (!canvas || !stage) return false;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return false;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  camera.position.set(0, .4, 18);
  camera.lookAt(0, .2, 0);
  scene.add(new THREE.HemisphereLight(0xbcefff, 0x141a43, 2.25));
  const key = new THREE.DirectionalLight(0xffedcd, 3.4);
  key.position.set(-4, 8, 8);
  key.castShadow = true;
  scene.add(key);
  const rim = new THREE.PointLight(0x6be6ff, 25, 30);
  rim.position.set(6, 2, 7);
  scene.add(rim);

  for (let index = 0; index < 4; index += 1) actors.push(makeActor(index));
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  resize();
  mounted = true;
  requestAnimationFrame(render);
  return true;
}

function update(players = [], hostId = null) {
  if (!mount()) return;
  actors.forEach((actor, index) => {
    const player = players[index];
    actor.mascot.visible = !!player;
    if (!player) {
      actor.id = null;
      return;
    }
    if (actor.id !== player.id) {
      actor.id = player.id;
      tintMascot(actor.mascot, player.id);
    }
    actor.ready = !!player.ready;
    actor.host = player.id === hostId;
  });
  requestAnimationFrame(alignActorsToSlots);
}

function render(now) {
  if (!mounted) return;
  const t = now * .001;
  actors.forEach((actor, index) => {
    if (!actor.mascot.visible) return;
    const { body, leftLeg, rightLeg } = actor.mascot.userData;
    const left = leftLeg.userData;
    const right = rightLeg.userData;
    const phase = t * 1.55 + index * .8;
    const bounce = actor.ready ? Math.abs(Math.sin(phase * 2.2)) * .13 : Math.sin(phase) * .045;
    actor.mascot.position.z = Math.sin(phase * .72) * .08;
    actor.mascot.rotation.y = Math.sin(phase * .58) * .08 + (index - 1.5) * -.025;
    actor.mascot.rotation.z = Math.sin(phase) * .018;
    body.position.y = bounce;
    left.hip.rotation.x = -.1 + Math.sin(phase * (actor.ready ? 2.3 : 1)) * (actor.ready ? .16 : .05);
    right.hip.rotation.x = -.1 - Math.sin(phase * (actor.ready ? 2.3 : 1)) * (actor.ready ? .16 : .05);
    left.knee.rotation.x = .18 + (actor.ready ? .12 : .03) * Math.max(0, Math.sin(phase * 2.3));
    right.knee.rotation.x = .18 + (actor.ready ? .12 : .03) * Math.max(0, -Math.sin(phase * 2.3));
  });
  if (canvas.offsetParent) renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.waitingRoomStage = { update, resize };
export { update as updateWaitingRoomStage };
