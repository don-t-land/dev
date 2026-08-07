/* 3D 접기 편집기 — 접힌 종이 위에 직접 접는 선을 긋고, 위아래 드래그로
   접는 각도를 정하는 Three.js 편집기.

   paper-fold-model의 순수 API 위에서 동작한다: applyFold는 원본을 바꾸지
   않고 새 모델을 반환하므로, 각도 미리보기는 확정 전까지 임시 결과를
   setModel 없이 그려 보기만 하면 된다. 확정 시에는 onCommitFold(start,
   end, angle)만 호출하고 실제 모델 갱신은 컨트롤러(paper-fold-ui.js)가
   맡는다.

   포인터 상태기계:
     idle → orbiting     빈 공간 pointerdown (시점 회전, 휠 줌)
     idle → drawing      종이 위 pointerdown (레이캐스트 히트) — 드래그를
                         히트 면의 3D 평면에 투영하고, 그 면의
                         vertices3 ↔ materialPoly 아핀 대응으로 전개도
                         좌표로 역매핑한다
     drawing → angleAdjust  pointerup, 선이 충분히 길 때
     angleAdjust → angleDrag  pointerdown — 세로 드래그가 각도(-π..π)
     angleDrag → idle    pointerup — 마지막으로 유효했던 각도로 확정,
                         유효한 각도가 한 번도 없었다면 onCancel
   Escape는 언제든 취소.

   시각 언어(main과 통일): 앞면 하늘색/뒷면 보라색 종이, 확정된 접는선은
   금색 점선, 그리는 중인 접는선은 각도 부호로 색이 바뀌는(양수 민트/
   음수 코랄) 네온 점선 + 화살촉, 각도 조절 중인 힌지 축은 유효할 때
   금색 점선/거부되면 빨강으로 표시한다. */
import * as THREE from 'three';

const MIN_DRAG = 0.05;   // paper-fold-model의 최소 선 길이와 동일
const MIN_ANGLE = 0.05;  // 이보다 작은 각도는 "아직 안 접음"으로 본다
const MAX_ANGLE = Math.PI;
const MIN_DISTANCE = 2.2;
const MAX_DISTANCE = 9;
const MIN_PITCH = -0.2;
const MAX_PITCH = 1.5;
const RADIANS_PER_PIXEL = Math.PI / 220; // 세로 220px 드래그 = 180°
const PREVIEW_STEP = Math.PI / 360;      // 0.5° 단위로만 미리보기 재계산
const GROUND_Y = -1.25;

// ---- 색 토큰 (main의 paper-fold-ui.js/multiplayer-flow.css 네온 접기 팔레트) ----
const FRONT_HUE = 188;              // 하늘색(앞면) — hsl(188 62% L%)
const FRONT_SAT = 0.62;
const BACK_HUE = 267;               // 보라(뒷면) — hsl(267 38% max(57,L-9)%)
const BACK_SAT = 0.38;
const OUTLINE_COLOR = 0x25477b;     // rgba(37,71,123,.78)에 대응
const CREASE_GOLD = 0xf4cd6c;       // 확정된 접는선 — 금색 점선
const CREASE_MINT = 0x69e3b6;       // 그리는 중 · 양의 각도(밸리)
const CREASE_CORAL = 0xff8d86;      // 그리는 중 · 음의 각도(마운틴)
const REJECT_COLOR = 0xff6b61;      // 접을 수 없는 각도

export function createFoldEditor({ canvas, onCommitFold, onCancel }) {
  const api = typeof window !== 'undefined' ? window.paperFoldModel : null;

  let renderer = null;
  let scene = null;
  let camera = null;
  let paperGroup = null;
  let creaseLine = null;
  let creaseGlowLine = null;
  let creaseArrow = null;
  let hingeLine = null;
  let committedCreaseGroup = null;
  let badge = null;
  let frame = 0;
  let started = false;
  let interactive = true;
  let disposed = false;

  let model = null;         // 확정된 모델 (컨트롤러가 setModel로 소유권 유지)
  let previewShown = false; // paperGroup이 임시(미리보기) 형상을 그리는 중인지

  const orbit = { yaw: 0.5, pitch: 0.95, distance: 4.2 };
  const orbitTarget = new THREE.Vector3(0, 0.35, 0);

  let mode = 'idle'; // idle | orbiting | drawing | angleAdjust | angleDrag
  let orbitDrag = null;
  let drawState = null;
  let pending = null;
  let angleDrag = null;

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  function setOrbiting(active) {
    canvas?.classList.toggle('orbiting', Boolean(active));
  }

  /* ---------- 씬 구성 ---------- */

  function ensureScene() {
    if (renderer) return true;
    if (!canvas) return false;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      renderer = null;
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(2.6, 5, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -3;
    sun.shadow.camera.right = 3;
    sun.shadow.camera.top = 3;
    sun.shadow.camera.bottom = -3;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 12;
    scene.add(sun);

    // 은은한 바닥 그림자 + 그리드
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShadowMaterial({ opacity: 0.22 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_Y;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(10, 20, 0x4d79b0, 0x27406e);
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
    grid.position.y = GROUND_Y + 0.002;
    scene.add(grid);

    paperGroup = new THREE.Group();
    scene.add(paperGroup);

    committedCreaseGroup = new THREE.Group();
    scene.add(committedCreaseGroup);

    // 긋는 중인 접는선 — 네온 점선(양/음 각도에 따라 민트/코랄) + 아래
    // additive-blend로 깔리는 넓고 옅은 "glow" 선으로 canvas shadowBlur를
    // 흉내낸다.
    creaseGlowLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: CREASE_MINT, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, linewidth: 6
      })
    );
    creaseGlowLine.visible = false;
    creaseGlowLine.frustumCulled = false;
    scene.add(creaseGlowLine);

    creaseLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: CREASE_MINT, dashSize: 0.11, gapSize: 0.07 })
    );
    creaseLine.visible = false;
    creaseLine.frustumCulled = false;
    scene.add(creaseLine);

    creaseArrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.028, 0.09, 10),
      new THREE.MeshBasicMaterial({ color: CREASE_MINT })
    );
    creaseArrow.visible = false;
    scene.add(creaseArrow);

    hingeLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: CREASE_GOLD, dashSize: 0.07, gapSize: 0.06 })
    );
    hingeLine.visible = false;
    hingeLine.frustumCulled = false;
    scene.add(hingeLine);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    return true;
  }

  function ensureBadge() {
    if (badge || !canvas || !canvas.parentElement) return;
    badge = document.createElement('div');
    badge.className = 'fold-angle-badge';
    badge.style.display = 'none';
    canvas.parentElement.appendChild(badge);
  }

  function clearGroup(group) {
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach(mat => mat?.dispose?.());
      else child.material?.dispose?.();
    }
  }

  /* 게임 내 makeFoldedCraftVisual과 같은 시각 언어(접힘 깊이 명암·양면·
     겹침 방지용 법선 오프셋)로 종이를 그린다. 스케일은 전개도 단위 그대로.
     main의 네온 팔레트를 따라 앞면은 하늘색, 뒷면은 보라색으로 그린다 —
     MeshStandardMaterial은 side별로 다른 색을 낼 수 없으므로, 앞면용
     FrontSide 메시와 뒷면용 BackSide 메시를 겹쳐 그린다. */
  function rebuildPaper(sourceModel) {
    if (!paperGroup) return;
    clearGroup(paperGroup);
    if (!sourceModel || !api) return;
    const geometry3d = api.computeFoldedGeometry(sourceModel);
    const faces = Array.isArray(geometry3d?.faces) ? geometry3d.faces : [];
    if (!faces.length) return;
    const maxFoldDepth = Math.max(1, ...faces.map(face => Number(face.foldDepth) || 0));
    faces.forEach((face, faceIndex) => {
      const poly3 = Array.isArray(face.vertices3) ? face.vertices3 : [];
      if (poly3.length < 3) return;
      const foldDepth = Number(face.foldDepth) || 0;

      // 첫 삼각형의 법선 방향으로 접힘 깊이만큼 미세 오프셋 — ±180° 접기로
      // 겹친 면들의 z-fighting을 막는다 (makeFoldedCraftVisual과 동일).
      const a = new THREE.Vector3(poly3[0][0], poly3[0][1], poly3[0][2]);
      const b = new THREE.Vector3(poly3[1][0], poly3[1][1], poly3[1][2]);
      const c = new THREE.Vector3(poly3[2][0], poly3[2][1], poly3[2][2]);
      const normal = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
      const offset = normal.clone().multiplyScalar(0.012 * foldDepth);

      const vertices = [];
      for (let index = 1; index < poly3.length - 1; index += 1) {
        for (const point of [poly3[0], poly3[index], poly3[index + 1]]) {
          vertices.push(point[0] + offset.x, point[1] + offset.y, point[2] + offset.z);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();

      // main과 같은 밝기 곡선: depthRatio가 커질수록(더 깊이 접힐수록)
      // 앞면은 살짝 어두워지고, 뒷면 L은 최소 57%로 바닥을 둔다.
      const depthRatio = foldDepth / maxFoldDepth;
      const brightness = 72 - depthRatio * 8 - Math.min(8, faceIndex * 0.45);
      const frontColor = new THREE.Color().setHSL(FRONT_HUE / 360, FRONT_SAT, clamp(brightness / 100, 0.4, 0.92));
      const backLightness = Math.max(57, brightness - 9);
      const backColor = new THREE.Color().setHSL(BACK_HUE / 360, BACK_SAT, clamp(backLightness / 100, 0.4, 0.92));

      const frontMaterial = new THREE.MeshStandardMaterial({
        color: frontColor, roughness: 0.72, side: THREE.FrontSide, flatShading: true
      });
      const backMaterial = new THREE.MeshStandardMaterial({
        color: backColor, roughness: 0.72, side: THREE.BackSide, flatShading: true
      });

      const frontMesh = new THREE.Mesh(geometry, frontMaterial);
      frontMesh.castShadow = true;
      frontMesh.userData.face = face;
      paperGroup.add(frontMesh);

      // 뒷면은 같은 지오메트리를 공유하는 별도 메시 — BackSide만 그리므로
      // z-fighting 없이 겹쳐진다. 레이캐스트 히트 판정은 앞면 메시(userData.
      // face 보유)만으로 충분하므로 뒷면 메시는 그리기 판정에서 제외한다.
      const backMesh = new THREE.Mesh(geometry, backMaterial);
      backMesh.raycast = () => {};
      paperGroup.add(backMesh);

      // 면 윤곽선 — main의 outline 색(rgba(37,71,123,.78))에 대응.
      const edges = new THREE.EdgesGeometry(geometry, 1);
      const outline = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, transparent: true, opacity: 0.78 })
      );
      paperGroup.add(outline);
    });
  }

  /* 확정된 접는선을 금색 점선 힌지로 그린다. 각 fold의 (A, d)는 전개도
     좌표의 직선이며, computeFoldedGeometry의 axisFor와 동일한 방식으로
     그 fold의 parents(생성 당시 힌지가 얹혀 있던 접힘들)를 통해 3D로
     끌어올려야 실제로 접힌 후의 위치가 나온다. 이 함수는 그 변환을 순수
     읽기 전용으로 재현할 뿐, 모델을 갱신하거나 엔진 동작을 바꾸지 않는다. */
  function rebuildCommittedCreases(sourceModel) {
    if (!committedCreaseGroup) return;
    clearGroup(committedCreaseGroup);
    if (!sourceModel || !Array.isArray(sourceModel.folds) || !sourceModel.folds.length) return;

    const basePoint3 = point => new THREE.Vector3(point[0], 0, -point[1]);
    const axisCache = new Array(sourceModel.folds.length).fill(null);

    function transformThrough(point3, foldIndices) {
      let current = point3;
      for (const index of foldIndices) {
        const fold = sourceModel.folds[index];
        if (!fold) continue;
        const axis = axisFor(index);
        current = rotateAround(current, axis.origin3, axis.dir3, fold.angle);
      }
      return current;
    }

    function rotateAround(point3, origin3, dir3, angle) {
      const local = point3.clone().sub(origin3);
      local.applyAxisAngle(dir3, angle);
      return local.add(origin3);
    }

    function axisFor(index) {
      if (axisCache[index]) return axisCache[index];
      const fold = sourceModel.folds[index];
      const parents = fold.parents.slice().sort((left, right) => left - right);
      const origin3 = transformThrough(basePoint3(fold.A), parents);
      const tip3 = transformThrough(basePoint3([fold.A[0] + fold.d[0], fold.A[1] + fold.d[1]]), parents);
      const dir3 = tip3.clone().sub(origin3).normalize();
      axisCache[index] = { origin3, dir3 };
      return axisCache[index];
    }

    const commands = Array.isArray(sourceModel.commands) ? sourceModel.commands : [];
    sourceModel.folds.forEach((fold, index) => {
      const parents = fold.parents.slice().sort((left, right) => left - right);
      // 힌지 선분 자체는 실제로 그려졌던 start/end(model.commands[index])를
      // 쓴다 — fold.d는 방향 단위벡터일 뿐 실제 그은 길이가 아니다. 이
      // 선도 그 힌지가 생성될 때 얹혀 있던 부모 접힘들만 통과해 3D로
      // 끌어올린다 (computeFoldedGeometry의 axisFor와 동일한 부모 체인).
      const command = commands[index];
      const rawStart = command ? command.start : fold.A;
      const rawEnd = command ? command.end : [fold.A[0] + fold.d[0], fold.A[1] + fold.d[1]];
      const start3 = transformThrough(basePoint3(rawStart), parents);
      const end3 = transformThrough(basePoint3(rawEnd), parents);
      // paperGroup의 법선-오프셋(겹침 방지)과 같은 결의 미세 리프트 —
      // 힌지 선이 종이 표면과 z-fighting 없이 살짝 위에 뜨도록 한다.
      const lift = new THREE.Vector3(0, 0.006 * (fold.parents.length + 1), 0);
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        start3.clone().add(lift), end3.clone().add(lift)
      ]);
      const line = new THREE.Line(
        lineGeometry,
        new THREE.LineDashedMaterial({ color: CREASE_GOLD, dashSize: 0.07, gapSize: 0.06, transparent: true, opacity: 0.68 })
      );
      line.computeLineDistances();
      line.frustumCulled = false;
      line.userData.foldIndex = index;
      committedCreaseGroup.add(line);
    });
  }

  /* ---------- 전개도 좌표 역매핑 ---------- */

  /* 면의 vertices3 ↔ materialPoly 아핀 대응을 세 꼭짓점(전개도에서 가장
     넓은 삼각형)으로 세운다. 반환된 toMaterial은 면 평면 위 3D 점을
     전개도 좌표 [x, y]로 되돌린다. */
  function makeMaterialMapper(face) {
    const pts = Array.isArray(face?.vertices3) ? face.vertices3 : [];
    const mat = Array.isArray(face?.materialPoly) ? face.materialPoly : [];
    if (pts.length < 3 || pts.length !== mat.length) return null;
    let best = null;
    let bestArea = 1e-9;
    for (let i = 0; i < mat.length; i += 1) {
      for (let j = i + 1; j < mat.length; j += 1) {
        for (let k = j + 1; k < mat.length; k += 1) {
          const area = Math.abs(
            (mat[j][0] - mat[i][0]) * (mat[k][1] - mat[i][1])
            - (mat[j][1] - mat[i][1]) * (mat[k][0] - mat[i][0])
          );
          if (area > bestArea) { bestArea = area; best = [i, j, k]; }
        }
      }
    }
    if (!best) return null;
    const [i, j, k] = best;
    const p0 = new THREE.Vector3(pts[i][0], pts[i][1], pts[i][2]);
    const e1 = new THREE.Vector3(pts[j][0], pts[j][1], pts[j][2]).sub(p0);
    const e2 = new THREE.Vector3(pts[k][0], pts[k][1], pts[k][2]).sub(p0);
    const g11 = e1.dot(e1);
    const g12 = e1.dot(e2);
    const g22 = e2.dot(e2);
    const det = g11 * g22 - g12 * g12;
    if (Math.abs(det) < 1e-12) return null;
    const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();
    const m0 = mat[i];
    const m1 = mat[j];
    const m2 = mat[k];
    return {
      normal,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, p0),
      toMaterial(point3) {
        const d = point3.clone().sub(p0);
        const b1 = d.dot(e1);
        const b2 = d.dot(e2);
        const u = (b1 * g22 - b2 * g12) / det;
        const v = (b2 * g11 - b1 * g12) / det;
        return [
          m0[0] + u * (m1[0] - m0[0]) + v * (m2[0] - m0[0]),
          m0[1] + u * (m1[1] - m0[1]) + v * (m2[1] - m0[1])
        ];
      }
    };
  }

  /* ---------- 보조 표시 ---------- */

  function setLine(line, from, to, normal) {
    const lift = normal ? normal.clone().multiplyScalar(0.02) : new THREE.Vector3();
    line.geometry.setFromPoints([from.clone().add(lift), to.clone().add(lift)]);
    line.computeLineDistances();
    line.visible = true;
  }

  /* 긋는 중인 접는선(네온 점선 + glow + 화살촉)을 갱신한다. angleSign이
     음수면 코랄(마운틴), 그 외(양수 또는 아직 각도 없음)에는 민트(밸리)를
     쓴다. */
  function setCreasePreview(from, to, normal, angleSign) {
    const color = angleSign < 0 ? CREASE_CORAL : CREASE_MINT;
    creaseLine.material.color.setHex(color);
    creaseGlowLine.material.color.setHex(color);
    creaseArrow.material.color.setHex(color);
    setLine(creaseLine, from, to, normal);
    const lift = normal ? normal.clone().multiplyScalar(0.02) : new THREE.Vector3();
    creaseGlowLine.geometry.setFromPoints([from.clone().add(lift), to.clone().add(lift)]);
    creaseGlowLine.visible = true;

    const dir = to.clone().sub(from);
    const length = dir.length();
    if (length > 1e-6) {
      dir.normalize();
      creaseArrow.position.copy(to).add(lift).addScaledVector(dir, 0.045);
      creaseArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      creaseArrow.visible = true;
    } else {
      creaseArrow.visible = false;
    }
  }

  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
    );
    raycaster.setFromCamera(pointerNdc, camera);
  }

  function resetInteraction() {
    mode = 'idle';
    orbitDrag = null;
    drawState = null;
    angleDrag = null;
    pending = null;
    setOrbiting(false);
    if (creaseLine) creaseLine.visible = false;
    if (creaseGlowLine) creaseGlowLine.visible = false;
    if (creaseArrow) creaseArrow.visible = false;
    if (hingeLine) hingeLine.visible = false;
    if (badge) badge.style.display = 'none';
    if (previewShown) {
      previewShown = false;
      rebuildPaper(model);
    }
  }

  function cancelInteraction(notify) {
    const wasFolding = mode === 'drawing' || mode === 'angleAdjust' || mode === 'angleDrag';
    resetInteraction();
    if (notify && wasFolding && typeof onCancel === 'function') onCancel();
  }

  /* ---------- 각도 미리보기 ---------- */

  function previewFold(nextAngle) {
    if (!pending) return;
    pending.angle = clamp(nextAngle, -MAX_ANGLE, MAX_ANGLE);
    const step = Math.round(pending.angle / PREVIEW_STEP);
    if (step === pending.lastStep) return;
    pending.lastStep = step;
    const angle = step * PREVIEW_STEP;
    if (badge) badge.textContent = `${Math.round(angle * 180 / Math.PI)}°`;

    if (!api || !model || Math.abs(angle) < MIN_ANGLE) {
      // 0° 근처로 되돌리면 "접지 않음"으로 초기화 — pointerup 시 취소된다.
      pending.lastValidAngle = null;
      if (previewShown) {
        previewShown = false;
        rebuildPaper(model);
      }
      hingeLine.material.color.setHex(CREASE_GOLD);
      return;
    }

    const next = api.applyFold(model, pending.startMaterial, pending.endMaterial, angle);
    // 거부(원본 반환)뿐 아니라, 종이 전체가 통째로 도는 접기(면이 늘지
    // 않는 경우 — 시트 가장자리를 따라 그은 선)도 편집기에서는 무효로 본다.
    const valid = next !== model && next.faces.length > model.faces.length;
    if (valid) {
      pending.lastValidAngle = angle;
      previewShown = true;
      rebuildPaper(next);
      hingeLine.material.color.setHex(CREASE_GOLD);
    } else {
      hingeLine.material.color.setHex(REJECT_COLOR);
    }
  }

  /* ---------- 포인터 상태기계 ---------- */

  function onPointerDown(event) {
    if (!started || !renderer) return;
    if (typeof event.button === 'number' && event.button !== 0) return;
    canvas.setPointerCapture?.(event.pointerId);

    if (mode === 'angleAdjust') {
      if (!interactive) { cancelInteraction(true); return; }
      mode = 'angleDrag';
      angleDrag = { pointerId: event.pointerId, lastY: event.clientY };
      return;
    }
    if (mode !== 'idle') return;

    if (interactive && model && paperGroup) {
      setPointer(event);
      const hit = raycaster.intersectObjects(paperGroup.children, false)
        .find(entry => entry.object?.userData?.face);
      if (hit) {
        const mapper = makeMaterialMapper(hit.object.userData.face);
        if (mapper) {
          mode = 'drawing';
          const startMaterial = mapper.toMaterial(hit.point);
          drawState = {
            pointerId: event.pointerId,
            mapper,
            start3: hit.point.clone(),
            end3: hit.point.clone(),
            startMaterial,
            endMaterial: startMaterial.slice()
          };
          setCreasePreview(drawState.start3, drawState.end3, mapper.normal, 1);
          return;
        }
      }
    }

    mode = 'orbiting';
    orbitDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setOrbiting(true);
  }

  function onPointerMove(event) {
    if (!started || !renderer) return;

    if (mode === 'orbiting' && orbitDrag && event.pointerId === orbitDrag.pointerId) {
      orbit.yaw -= (event.clientX - orbitDrag.x) * 0.0085;
      orbit.pitch = clamp(orbit.pitch + (event.clientY - orbitDrag.y) * 0.007, MIN_PITCH, MAX_PITCH);
      orbitDrag.x = event.clientX;
      orbitDrag.y = event.clientY;
      return;
    }

    if (mode === 'drawing' && drawState && event.pointerId === drawState.pointerId) {
      setPointer(event);
      const point = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(drawState.mapper.plane, point)) {
        drawState.end3.copy(point);
        drawState.endMaterial = drawState.mapper.toMaterial(point);
        setCreasePreview(drawState.start3, drawState.end3, drawState.mapper.normal, 1);
      }
      return;
    }

    if (mode === 'angleDrag' && angleDrag && event.pointerId === angleDrag.pointerId && pending) {
      const deltaY = angleDrag.lastY - event.clientY;
      angleDrag.lastY = event.clientY;
      previewFold(pending.angle + deltaY * RADIANS_PER_PIXEL);
    }
  }

  function onPointerUp(event) {
    if (!started || !renderer) return;

    if (mode === 'orbiting' && orbitDrag && event.pointerId === orbitDrag.pointerId) {
      mode = 'idle';
      orbitDrag = null;
      setOrbiting(false);
      return;
    }

    if (mode === 'drawing' && drawState && event.pointerId === drawState.pointerId) {
      const dx = drawState.endMaterial[0] - drawState.startMaterial[0];
      const dy = drawState.endMaterial[1] - drawState.startMaterial[1];
      if (Math.hypot(dx, dy) < MIN_DRAG) {
        resetInteraction(); // 너무 짧은 선 — 조용히 원위치
        return;
      }
      pending = {
        startMaterial: drawState.startMaterial,
        endMaterial: drawState.endMaterial,
        start3: drawState.start3.clone(),
        end3: drawState.end3.clone(),
        normal: drawState.mapper.normal.clone(),
        angle: 0,
        lastValidAngle: null,
        lastStep: 0
      };
      drawState = null;
      mode = 'angleAdjust';
      creaseLine.visible = false;
      creaseGlowLine.visible = false;
      creaseArrow.visible = false;
      hingeLine.material.color.setHex(CREASE_GOLD);
      setLine(hingeLine, pending.start3, pending.end3, pending.normal);
      ensureBadge();
      if (badge) {
        badge.textContent = '0°';
        badge.style.display = 'block';
      }
      return;
    }

    if (mode === 'angleDrag' && angleDrag && event.pointerId === angleDrag.pointerId) {
      const commitAngle = pending?.lastValidAngle;
      if (typeof commitAngle === 'number') {
        const { startMaterial, endMaterial } = pending;
        resetInteraction();
        onCommitFold?.(startMaterial, endMaterial, commitAngle);
      } else {
        cancelInteraction(true); // 유효한 각도가 한 번도 없었음 (클릭 포함)
      }
    }
  }

  function onPointerCancel() {
    if (!started) return;
    cancelInteraction(true);
  }

  function onKeyDown(event) {
    if (!started || event.key !== 'Escape') return;
    if (mode === 'drawing' || mode === 'angleAdjust' || mode === 'angleDrag') {
      cancelInteraction(true);
    }
  }

  function onWheel(event) {
    if (!started || !renderer) return;
    event.preventDefault();
    const factor = Math.exp((event.deltaY || 0) * 0.0011);
    orbit.distance = clamp(orbit.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
  }

  /* ---------- 렌더 루프 ---------- */

  function tick() {
    if (!started || !renderer) { frame = 0; return; }
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    const ratio = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const horizontal = Math.cos(orbit.pitch) * orbit.distance;
    camera.position.set(
      orbitTarget.x + Math.sin(orbit.yaw) * horizontal,
      orbitTarget.y + Math.sin(orbit.pitch) * orbit.distance,
      orbitTarget.z + Math.cos(orbit.yaw) * horizontal
    );
    camera.lookAt(orbitTarget);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }

  /* ---------- 공개 API ---------- */

  function setModel(nextModel) {
    model = nextModel || null;
    previewShown = false;
    resetInteraction();
    if (renderer) {
      rebuildPaper(model);
      rebuildCommittedCreases(model);
    }
  }

  function setInteractive(value) {
    interactive = Boolean(value);
    if (!interactive && (mode === 'drawing' || mode === 'angleAdjust' || mode === 'angleDrag')) {
      cancelInteraction(false);
    }
  }

  function start() {
    if (disposed) return false;
    if (!ensureScene()) return false;
    ensureBadge();
    if (!started) {
      started = true;
      rebuildPaper(model);
      rebuildCommittedCreases(model);
      if (!frame) frame = requestAnimationFrame(tick);
    }
    return true;
  }

  function stop() {
    started = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    resetInteraction();
  }

  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
    if (renderer) {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      clearGroup(paperGroup);
      clearGroup(committedCreaseGroup);
      creaseLine.geometry.dispose();
      creaseLine.material.dispose();
      creaseGlowLine.geometry.dispose();
      creaseGlowLine.material.dispose();
      creaseArrow.geometry.dispose();
      creaseArrow.material.dispose();
      hingeLine.geometry.dispose();
      hingeLine.material.dispose();
      renderer.dispose();
      renderer = null;
    }
    if (badge) {
      badge.remove();
      badge = null;
    }
  }

  return { setModel, setInteractive, start, stop, dispose };
}
