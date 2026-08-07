import * as THREE from 'three';
import { makeStandingPlaneMascot } from './home-plane-3d.js';
import { animateCostumes, setCostumeOnObject } from './costume-3d.js';
import { exhibitFloorTexture } from './showroom-materials.js';

function mountCostumeShowroom() {
  const canvas = document.getElementById('costume-showroom-canvas');
  const stage = canvas?.closest('.costume-showroom-stage');
  const panel = document.getElementById('costume-panel');
  if (!canvas || !stage || !panel) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    stage.classList.add('showroom-unavailable');
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07101c);
  scene.fog = new THREE.FogExp2(0x07101c, .038);
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 80);
  camera.position.set(0, .35, 13.8);
  camera.lookAt(0, .1, 0);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(19.2, 9.6),
    new THREE.MeshStandardMaterial({ color: 0x142031, roughness: .94, metalness: .04 })
  );
  wall.position.set(0, 1.15, -4.15);
  wall.receiveShadow = true;
  scene.add(wall);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 18),
    new THREE.MeshStandardMaterial({
      map: exhibitFloorTexture(), color: 0xa9c7d7, roughness: .42, metalness: .22
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3;
  floor.receiveShadow = true;
  scene.add(floor);

  const podium = new THREE.Mesh(
    new THREE.CylinderGeometry(2.32, 2.65, .38, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x172a43, roughness: .28, metalness: .62, clearcoat: .7, clearcoatRoughness: .32
    })
  );
  podium.position.y = -2.78;
  podium.receiveShadow = true;
  podium.castShadow = true;
  scene.add(podium);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, .035, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0x6ee4ef })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -2.575;
  scene.add(ring);

  const mascot = makeStandingPlaneMascot(globalThis.costumeState?.load?.());
  mascot.scale.setScalar(.78);
  mascot.position.y = -.38;
  mascot.rotation.y = -.18;
  scene.add(mascot);

  scene.add(new THREE.HemisphereLight(0xbfeeff, 0x101b2c, 2.05));
  const key = new THREE.SpotLight(0xffe3b0, 80, 30, .56, .72, 1.15);
  key.position.set(-4.8, 7, 7);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key, key.target);
  const rim = new THREE.PointLight(0x59dcff, 37, 15);
  rim.position.set(4.5, 1.4, 3.2);
  scene.add(rim);
  const violet = new THREE.PointLight(0xb56cff, 20, 12);
  violet.position.set(-4, -1.6, 2.4);
  scene.add(violet);

  const orbit = { yaw: -.18, targetYaw: -.18, pitch: 0, targetPitch: 0, zoom: 13.8, dragging: false, x: 0, y: 0 };
  stage.addEventListener('pointerdown', event => {
    orbit.dragging = true;
    orbit.x = event.clientX;
    orbit.y = event.clientY;
    stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (!orbit.dragging) return;
    orbit.targetYaw += (event.clientX - orbit.x) * .009;
    orbit.targetPitch = THREE.MathUtils.clamp(orbit.targetPitch + (event.clientY - orbit.y) * .004, -.2, .18);
    orbit.x = event.clientX;
    orbit.y = event.clientY;
  });
  const stopDragging = () => { orbit.dragging = false; };
  stage.addEventListener('pointerup', stopDragging);
  stage.addEventListener('pointercancel', stopDragging);
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    orbit.zoom = THREE.MathUtils.clamp(orbit.zoom + event.deltaY * .008, 11.8, 16.2);
  }, { passive: false });

  window.addEventListener('paper-plane-costume-changed', event => {
    setCostumeOnObject(mascot, event.detail?.costume, 'standing');
  });

  function resize() {
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  stage.dataset.showroomReady = 'true';

  let previous = performance.now();
  function render(now) {
    const delta = Math.min(.04, (now - previous) / 1000);
    previous = now;
    if (!panel.classList.contains('hide')) {
      if (!orbit.dragging) orbit.targetYaw += delta * .12;
      orbit.yaw += (orbit.targetYaw - orbit.yaw) * .075;
      orbit.pitch += (orbit.targetPitch - orbit.pitch) * .075;
      mascot.rotation.y = orbit.yaw;
      mascot.rotation.x = orbit.pitch;
      mascot.position.y = -.38 + Math.sin(now * .0014) * .04;
      camera.position.z += (orbit.zoom - camera.position.z) * .08;
      ring.material.color.setHSL(.51 + Math.sin(now * .00035) * .025, .72, .66);
      animateCostumes(mascot, now * .001);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  addEventListener('pagehide', () => {
    observer.disconnect();
    scene.traverse(object => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach(material => material.dispose?.());
    });
    renderer.dispose();
  }, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountCostumeShowroom, { once: true });
else mountCostumeShowroom();

export { mountCostumeShowroom };
