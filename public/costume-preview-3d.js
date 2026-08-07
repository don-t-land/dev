import * as THREE from 'three';
import { animateCostumes, createCostumeGroup } from './costume-3d.js';

const previews = [];

function selectionFor(id) {
  return id === 'rudolph'
    ? { hat: 'none', nose: 'rudolph' }
    : { hat: id, nose: 'none' };
}

function centerObject(object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  object.position.sub(center);
  object.position.y -= size.y * .04;
  return Math.max(size.x, size.y, size.z);
}

function mountPreview(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    canvas.classList.add('costume-preview-unavailable');
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 50);
  const id = canvas.dataset.costumePreview;
  const costume = createCostumeGroup(selectionFor(id));
  const object = costume.getObjectByName(id === 'rudolph' ? 'noseCostume' : 'hatCostume');
  if (!object) return;
  costume.remove(object);
  scene.add(object);
  const extent = centerObject(object);
  camera.position.set(0, extent * .15, extent * 3.25);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xdff8ff, 0x161936, 2.7));
  const key = new THREE.DirectionalLight(0xfff2d1, 4.2);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0x6ddfff, 18, 12);
  rim.position.set(3, 1, 3);
  scene.add(rim);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  previews.push({ canvas, renderer, scene, camera, object, phase: previews.length * .7 });
}

function render(now) {
  const seconds = now * .001;
  const panelVisible = !document.getElementById('costume-panel')?.classList.contains('hide');
  if (panelVisible) {
    previews.forEach(preview => {
      preview.object.rotation.y = seconds * .72 + preview.phase;
      preview.object.rotation.x = -.08 + Math.sin(seconds * 1.15 + preview.phase) * .05;
      animateCostumes(preview.scene, seconds);
      preview.renderer.render(preview.scene, preview.camera);
    });
  }
  requestAnimationFrame(render);
}

function mountCostumePreviews() {
  document.querySelectorAll('canvas[data-costume-preview]').forEach(mountPreview);
  requestAnimationFrame(render);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountCostumePreviews, { once: true });
} else {
  mountCostumePreviews();
}

export { mountCostumePreviews };
