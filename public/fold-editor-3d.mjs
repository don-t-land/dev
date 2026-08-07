/* 3D 접기 편집기 — 접힌 종이 위에 직접 접는 선을 긋고, 힌지 축 둘레에
   뜨는 호(arc) 화살표 핸들을 잡아 끌어 "종이를 잡고 접듯이" 각도를
   정하는 Three.js 편집기.

   paper-fold-model의 순수 API 위에서 동작한다: applyFold는 원본을 바꾸지
   않고 새 모델을 반환하므로, 각도 미리보기는 확정 전까지 임시 결과를
   setModel 없이 그려 보기만 하면 된다. 확정 시에는 onCommitFold(start,
   end, angle)만 호출하고 실제 모델 갱신은 컨트롤러(paper-fold-ui.js)가
   맡는다.

   포인터 상태기계:
     idle → hingeAdjust  확정된 금색 힌지 위 pointerdown (화면 좌표
                         점-선분 거리 히트) — 힌지를 네온 시안으로
                         선택하고 움직이는 플랩에 호 화살표 기즈모가
                         뜨며, 같은 드래그로 플랩이 커서를 축 둘레로
                         따라 돈다. pointerup에 onAdjustHinge(foldIndex,
                         angle), 각도가 그대로면 콜백 없이 원상 복귀
     idle → orbiting     빈 공간 pointerdown (시점 회전, 휠 줌)
     idle → drawing      종이 위 pointerdown (레이캐스트 히트) — 드래그를
                         히트 면의 3D 평면에 투영하고, 그 면의
                         vertices3 ↔ materialPoly 아핀 대응으로 전개도
                         좌표로 역매핑한다
     drawing → angleAdjust  pointerup, 선이 충분히 길 때 — 선 양쪽 조각의
                         무게중심에 그립 구슬이 하나씩 떠서 "어느 쪽을
                         잡아 접을지"를 고르게 한다
     angleAdjust → angleDrag  pointerdown — 잡은 쪽(전개도 좌표에서 선의
                         부호 있는 쪽 판정)이 움직이는 쪽이 된다. 오른쪽을
                         잡았으면 편집기 차원에서 start/end를 뒤집어
                         적용하고(모델 규약은 "왼쪽이 움직임" 그대로),
                         드래그하면 플랩이 커서를 힌지 축 둘레로 따라
                         접힌다(-π..π)
     angleDrag → idle    pointerup — 마지막으로 유효했던 각도로 확정,
                         유효한 각도가 한 번도 없었다면 onCancel
   Escape는 언제든 취소.

   각도-커서 대응(hingeAdjust·angleDrag 공통): 포인터 레이를 플랩 무게중심의
   회전 평면(법선 = 힌지 축)과 교차시키고, 평면이 시선에 거의 평행하면
   레이-축 최근접점으로 대체한 뒤, 축에 수직인 반지름 벡터의 방위각 변화량을
   누적해 0.5° 단위로 양자화한다(atan2((r0×w)·u, r0·w)).

   시각 언어(main과 통일): 앞면 하늘색/뒷면 보라색 종이 — 윤곽선은 시트의
   바깥 테두리에만 그려 접어도 종이가 "잘린" 것처럼 보이지 않게 한다.
   확정된 접는선은 금색 점선이며 종이처럼 영구히 다시 접을 수 있는
   힌지다(선택 시 네온 시안 #65eee9 + glow), 그리는 중인 접는선은 각도
   부호로 색이 바뀌는 (양수 민트/음수 코랄) 네온 점선 + 화살촉, 각도 조절
   중인 힌지 축은 유효할 때 금색 점선/거부되면 빨강으로 표시한다. 각도
   기즈모(회전 가이드 원 + 0°→현재 각도 진행 호 + 진행 방향 화살촉 + 플랩
   무게중심 그립 구슬)도 같은 색 규약(민트/코랄/거부 빨강)에 additive-blend
   glow를 따른다. */
import * as THREE from 'three';

const MIN_DRAG = 0.05;   // paper-fold-model의 최소 선 길이와 동일
const MIN_ANGLE = 0.05;  // 이보다 작은 각도는 "아직 안 접음"으로 본다
const MAX_ANGLE = Math.PI;
const MIN_DISTANCE = 2.2;
const MAX_DISTANCE = 9;
const MIN_PITCH = -0.2;
const MAX_PITCH = 1.5;
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
const HINGE_SELECT = 0x65eee9;      // 선택된 힌지 — 네온 시안 (선택 하이라이트 규약)
const HINGE_PICK_PX = 14;           // 힌지 클릭 판정 반경 (화면 px)

export function createFoldEditor({ canvas, onCommitFold, onCancel, onAdjustHinge }) {
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
  let hingeSelectGlow = null;
  let gizmoGroup = null;      // 각도 기즈모 — 가이드 원 + 진행 호 + 화살촉 + 그립 구슬
  let gizmoGuide = null;
  let gizmoArcGlow = null;
  let gizmoArc = null;
  let gizmoArrow = null;
  let gizmoGrabs = [];        // [0] 선택된 플랩(호 끝), [1] angleAdjust의 반대쪽 후보
  let badge = null;
  let frame = 0;
  let started = false;
  let interactive = true;
  let disposed = false;

  let model = null;         // 확정된 모델 (컨트롤러가 setModel로 소유권 유지)
  let previewShown = false; // paperGroup이 임시(미리보기) 형상을 그리는 중인지

  const orbit = { yaw: 0.5, pitch: 0.95, distance: 4.2 };
  const orbitTarget = new THREE.Vector3(0, 0.35, 0);

  let mode = 'idle'; // idle | orbiting | drawing | angleAdjust | angleDrag | hingeAdjust
  let orbitDrag = null;
  let drawState = null;
  let pending = null;
  let angleDrag = null;
  let hingeAdjustDrag = null;
  let hingeSegments = []; // rebuildCommittedCreases가 채우는 픽킹용 3D 선분들

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

    // 선택된 힌지 밑에 깔리는 네온 시안 glow — creaseGlowLine과 같은
    // additive-blend 방식의 선택 하이라이트.
    hingeSelectGlow = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: HINGE_SELECT, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false, linewidth: 6
      })
    );
    hingeSelectGlow.visible = false;
    hingeSelectGlow.frustumCulled = false;
    scene.add(hingeSelectGlow);

    // 각도 기즈모 — 힌지 축 둘레의 회전 가이드 원, 0°→현재 각도의 진행 호
    // (+ additive glow), 진행 끝의 화살촉, 플랩 무게중심의 그립 구슬로
    // 이루어진 "종이를 잡고 돌리는" 핸들. 접는선 미리보기와 같은 네온
    // 색 규약을 쓴다.
    gizmoGroup = new THREE.Group();
    gizmoGroup.visible = false;
    gizmoGuide = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: CREASE_MINT, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    gizmoArcGlow = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: CREASE_MINT, transparent: true, opacity: 0.38,
        blending: THREE.AdditiveBlending, depthWrite: false, linewidth: 6
      })
    );
    gizmoArc = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: CREASE_MINT, transparent: true, opacity: 0.9 })
    );
    gizmoArrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.036, 0.11, 12),
      new THREE.MeshBasicMaterial({ color: CREASE_MINT, transparent: true, opacity: 0.95 })
    );
    gizmoGrabs = [0, 1].map(() => {
      const grab = new THREE.Group();
      grab.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 16, 12),
        new THREE.MeshBasicMaterial({ color: CREASE_MINT, transparent: true, opacity: 0.95 })
      ));
      grab.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 16, 12),
        new THREE.MeshBasicMaterial({
          color: CREASE_MINT, transparent: true, opacity: 0.3,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      ));
      return grab;
    });
    [gizmoGuide, gizmoArcGlow, gizmoArc].forEach(line => { line.frustumCulled = false; });
    gizmoGroup.add(gizmoGuide, gizmoArcGlow, gizmoArc, gizmoArrow, gizmoGrabs[0], gizmoGrabs[1]);
    // 3D 툴 회전 핸들 규약대로 기즈모는 종이에 가려지지 않고 항상 위에
    // 그린다 — 접힌 플랩 면 위에 반쯤 파묻히는 그립 구슬이 사라지지 않도록.
    gizmoGroup.traverse(node => {
      if (node.material) {
        node.material.depthTest = false;
        node.renderOrder = 10;
      }
    });
    scene.add(gizmoGroup);

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

  /* 전개도 변이 원판 시트 [-1,1]²의 테두리 위에 있는지 — 면들은 항상
     시트를 그대로 분할하므로(접기는 전개도 좌표를 바꾸지 않는다), 테두리
     위 변 = 종이의 바깥 윤곽, 나머지 변 = 접기로 생긴 안쪽 이음선이다. */
  function isSheetBorderEdge(a, b) {
    const EDGE_EPS = 1e-6;
    return (Math.abs(a[0] - 1) < EDGE_EPS && Math.abs(b[0] - 1) < EDGE_EPS)
      || (Math.abs(a[0] + 1) < EDGE_EPS && Math.abs(b[0] + 1) < EDGE_EPS)
      || (Math.abs(a[1] - 1) < EDGE_EPS && Math.abs(b[1] - 1) < EDGE_EPS)
      || (Math.abs(a[1] + 1) < EDGE_EPS && Math.abs(b[1] + 1) < EDGE_EPS);
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

      // 종이 윤곽선 — main의 outline 색(rgba(37,71,123,.78))에 대응하되,
      // 시트의 바깥 테두리에 놓인 변만 그린다. 접기로 나뉜 면 사이 안쪽
      // 변까지 그리면 한 장의 종이가 "잘린" 것처럼 보인다(힌지 양쪽 면은
      // 같은 3D 꼭짓점을 공유하므로, 안쪽 윤곽선이 없으면 연속된 한 장으로
      // 읽힌다 — 접는 자국 표시는 금색 점선 힌지의 몫).
      const materialPoly = Array.isArray(face.materialPoly) ? face.materialPoly : [];
      const outlinePositions = [];
      for (let index = 0; index < poly3.length && index < materialPoly.length; index += 1) {
        const next = (index + 1) % poly3.length;
        if (!isSheetBorderEdge(materialPoly[index], materialPoly[next])) continue;
        outlinePositions.push(
          poly3[index][0] + offset.x, poly3[index][1] + offset.y, poly3[index][2] + offset.z,
          poly3[next][0] + offset.x, poly3[next][1] + offset.y, poly3[next][2] + offset.z
        );
      }
      if (outlinePositions.length) {
        const outlineGeometry = new THREE.BufferGeometry();
        outlineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outlinePositions, 3));
        const outline = new THREE.LineSegments(
          outlineGeometry,
          new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, transparent: true, opacity: 0.78 })
        );
        paperGroup.add(outline);
      }
    });
  }

  /* 확정된 접는선을 금색 점선 힌지로 그린다. 각 fold의 변환된 3D 축은
     computeFoldedGeometry(model).hinges가 그대로 내려주므로(origin3/dir3),
     여기서는 축 위 선분 범위만 정하면 된다. 회전은 등거리 변환이라 접는선
     위의 점은 전개도에서의 선상 파라미터 t = (P−A)·d 그대로
     origin3 + t·dir3 에 온다 — 실제로 그은 start/end(model.commands)를
     그 방식으로 끌어올린다. 그린 선분들은 hingeSegments에 담아 화면 좌표
     픽킹(pickHinge)에도 쓴다. */
  function rebuildCommittedCreases(sourceModel) {
    if (!committedCreaseGroup) return;
    clearGroup(committedCreaseGroup);
    hingeSegments = [];
    if (!sourceModel || !api || !Array.isArray(sourceModel.folds) || !sourceModel.folds.length) return;

    const hinges = api.computeFoldedGeometry(sourceModel).hinges || [];
    const commands = Array.isArray(sourceModel.commands) ? sourceModel.commands : [];
    hinges.forEach(hinge => {
      const fold = sourceModel.folds[hinge.foldIndex];
      if (!fold) return;
      // 힌지 선분 자체는 실제로 그려졌던 start/end(model.commands)를 쓴다 —
      // fold.d는 방향 단위벡터일 뿐 실제 그은 길이가 아니다.
      const command = commands[hinge.foldIndex];
      const rawStart = command ? command.start : fold.A;
      const rawEnd = command ? command.end : [fold.A[0] + fold.d[0], fold.A[1] + fold.d[1]];
      const origin3 = new THREE.Vector3(hinge.origin3[0], hinge.origin3[1], hinge.origin3[2]);
      const dir3 = new THREE.Vector3(hinge.dir3[0], hinge.dir3[1], hinge.dir3[2]);
      const tOf = point => (point[0] - fold.A[0]) * fold.d[0] + (point[1] - fold.A[1]) * fold.d[1];
      // paperGroup의 법선-오프셋(겹침 방지)과 같은 결의 미세 리프트 —
      // 힌지 선이 종이 표면과 z-fighting 없이 살짝 위에 뜨도록 한다.
      const lift = new THREE.Vector3(0, 0.006 * (fold.parents.length + 1), 0);
      const start3 = origin3.clone().addScaledVector(dir3, tOf(rawStart)).add(lift);
      const end3 = origin3.clone().addScaledVector(dir3, tOf(rawEnd)).add(lift);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start3, end3]),
        new THREE.LineDashedMaterial({ color: CREASE_GOLD, dashSize: 0.07, gapSize: 0.06, transparent: true, opacity: 0.68 })
      );
      line.computeLineDistances();
      line.frustumCulled = false;
      line.userData.foldIndex = hinge.foldIndex;
      committedCreaseGroup.add(line);
      hingeSegments.push({ foldIndex: hinge.foldIndex, start3, end3, line });
    });
  }

  /* ---------- 힌지 픽킹 · 재조절 ---------- */

  /* 포인터 좌표에서 HINGE_PICK_PX 이내인 가장 가까운 확정 힌지 선분.
     선분 양 끝을 화면 좌표로 투영해 점-선분 거리로 판정한다. */
  function pickHinge(event) {
    if (!hingeSegments.length || !camera) return null;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const halfWidth = Math.max(1, rect.width) / 2;
    const halfHeight = Math.max(1, rect.height) / 2;
    let best = null;
    for (const segment of hingeSegments) {
      const a = segment.start3.clone().project(camera);
      const b = segment.end3.clone().project(camera);
      if (a.z > 1 || b.z > 1) continue; // 카메라 뒤/절두체 밖
      const ax = (a.x + 1) * halfWidth;
      const ay = (1 - a.y) * halfHeight;
      const bx = (b.x + 1) * halfWidth;
      const by = (1 - b.y) * halfHeight;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1) : 0;
      const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (distance <= HINGE_PICK_PX && (!best || distance < best.distance)) {
        best = { segment, distance };
      }
    }
    return best ? best.segment : null;
  }

  /* 선택 중인 힌지를 네온 시안(거부 시 빨강)으로 칠하고 glow를 깐다.
     preview로 힌지 선들이 재생성돼도 foldIndex로 다시 찾아 칠한다. */
  function applyHingeSelection() {
    if (!hingeAdjustDrag || !hingeSelectGlow) return;
    const segment = hingeSegments.find(entry => entry.foldIndex === hingeAdjustDrag.foldIndex);
    if (!segment) { hingeSelectGlow.visible = false; return; }
    const color = hingeAdjustDrag.rejected ? REJECT_COLOR : HINGE_SELECT;
    segment.line.material.color.setHex(color);
    segment.line.material.opacity = 1;
    hingeSelectGlow.material.color.setHex(color);
    hingeSelectGlow.geometry.setFromPoints([segment.start3, segment.end3]);
    hingeSelectGlow.visible = true;
  }

  /* 힌지 재조절 미리보기 — 각도 미리보기(previewFold)와 같은 감도·양자화.
     확정 전까지는 setFoldAngle의 임시 결과를 그려 보기만 한다. */
  function previewHinge(nextAngle) {
    if (!hingeAdjustDrag || !api || !model) return;
    hingeAdjustDrag.angle = clamp(nextAngle, -MAX_ANGLE, MAX_ANGLE);
    const step = Math.round(hingeAdjustDrag.angle / PREVIEW_STEP);
    if (step === hingeAdjustDrag.lastStep) return;
    hingeAdjustDrag.lastStep = step;
    const angle = step * PREVIEW_STEP;
    if (badge) badge.textContent = `${Math.round(angle * 180 / Math.PI)}°`;

    if (Math.abs(angle) < MIN_ANGLE) {
      // 0° 근처 — 힌지를 완전히 펴는 것은 한 번 펴기(undo)의 몫이라 거부.
      hingeAdjustDrag.rejected = true;
      applyHingeSelection();
      updateGizmo(hingeAdjustDrag.arc, angle, REJECT_COLOR);
      return;
    }
    const next = api.setFoldAngle(model, hingeAdjustDrag.foldIndex, angle);
    // 같은 각도로 되돌아온 경우(next === model)도 유효한 상태다.
    const sameAngle = angle === model.folds[hingeAdjustDrag.foldIndex]?.angle;
    if (next === model && !sameAngle) {
      hingeAdjustDrag.rejected = true;
      applyHingeSelection();
      updateGizmo(hingeAdjustDrag.arc, angle, REJECT_COLOR);
      return;
    }
    hingeAdjustDrag.rejected = false;
    hingeAdjustDrag.lastValidAngle = angle;
    previewShown = true;
    rebuildPaper(next);
    rebuildCommittedCreases(next); // 자식 힌지들도 새 각도를 따라 움직인다
    applyHingeSelection();
    updateGizmo(hingeAdjustDrag.arc, angle, angle < 0 ? CREASE_CORAL : CREASE_MINT);
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
    // 전개도 기저의 행렬식 — 넓이 최대 삼각형을 골랐으므로 0이 아니다.
    const matDet = (m1[0] - m0[0]) * (m2[1] - m0[1]) - (m1[1] - m0[1]) * (m2[0] - m0[0]);
    return {
      normal,
      materialPoly: mat,
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
      },
      // toMaterial의 역방향 — 전개도 점을 이 면(강체 컴포넌트)의 현재
      // 3D 평면 위 위치로 올린다.
      toWorld(materialPoint) {
        const rx = materialPoint[0] - m0[0];
        const ry = materialPoint[1] - m0[1];
        const u = (rx * (m2[1] - m0[1]) - ry * (m2[0] - m0[0])) / matDet;
        const v = ((m1[0] - m0[0]) * ry - (m1[1] - m0[1]) * rx) / matDet;
        return p0.clone().addScaledVector(e1, u).addScaledVector(e2, v);
      }
    };
  }

  /* ---------- 호(arc) 각도 기즈모 · 커서→각도 산출 ---------- */

  const TWO_PI = Math.PI * 2;
  const UP = new THREE.Vector3(0, 1, 0);
  const wrapAngle = value => value - TWO_PI * Math.round(value / TWO_PI);

  /* 3D 다각형의 넓이 가중 무게중심 (부채꼴 삼각분할). */
  function polygonCentroid3(points) {
    if (!Array.isArray(points) || points.length < 3) return null;
    const base = new THREE.Vector3(points[0][0], points[0][1], points[0][2]);
    const sum = new THREE.Vector3();
    let total = 0;
    for (let index = 1; index < points.length - 1; index += 1) {
      const b = new THREE.Vector3(points[index][0], points[index][1], points[index][2]);
      const c = new THREE.Vector3(points[index + 1][0], points[index + 1][1], points[index + 1][2]);
      const area = new THREE.Vector3().subVectors(b, base)
        .cross(new THREE.Vector3().subVectors(c, base)).length() / 2;
      sum.addScaledVector(base.clone().add(b).add(c).multiplyScalar(1 / 3), area);
      total += area;
    }
    if (total < 1e-9) return null;
    return { centroid: sum.multiplyScalar(1 / total), area: total };
  }

  /* 힌지 축(a, 단위방향 u)과 "펼친 상태(각도 0)"의 플랩 무게중심 c0로
     회전 호의 기준 좌표계를 만든다. center는 c0의 축 투영, r0는 각도 0의
     반지름 벡터, tangent = u×r0는 +각도 진행 방향이다 —
     c(θ) = center + cosθ·r0 + sinθ·tangent (오른손 법칙, 모델 규약과 동일). */
  function makeArcFrame(a, u, c0) {
    const center = a.clone().addScaledVector(u, c0.clone().sub(a).dot(u));
    const r0 = c0.clone().sub(center);
    const radius = r0.length();
    if (radius < 1e-4) return null;
    return { a, u, center, r0, tangent: new THREE.Vector3().crossVectors(u, r0), radius };
  }

  /* fold가 접는(움직이는) 면들의 넓이 가중 무게중심 — geometry3d.faces와
     sourceModel.faces는 같은 순서라 model.faces[i].folds로 소속을 판정한다. */
  function movedFacesCentroid(sourceModel, geometry3d, foldIndex) {
    const sum = new THREE.Vector3();
    let total = 0;
    sourceModel.faces.forEach((face, index) => {
      if (!Array.isArray(face.folds) || !face.folds.includes(foldIndex)) return;
      const piece = polygonCentroid3(geometry3d.faces[index]?.vertices3);
      if (!piece) return;
      sum.addScaledVector(piece.centroid, piece.area);
      total += piece.area;
    });
    return total > 1e-9 ? sum.multiplyScalar(1 / total) : null;
  }

  /* fold foldIndex의 호 좌표계. 축은 geometry.hinges의 origin3/dir3(부모
     변환만 반영 — 이 접기 자신의 각도와 무관하게 고정)이고, c0는 움직이는
     면들의 현재 무게중심을 축 둘레로 -unfoldAngle 만큼 되돌린 "펼친 위치"다.
     이 접기의 각도가 바뀌면 자식 접기까지 통째로 이 축 둘레를 강체 회전
     하므로(자식 축들도 같이 켤레 회전된다) 이 되돌림이 정확하다. */
  function arcForFold(sourceModel, foldIndex, unfoldAngle) {
    if (!api) return null;
    const geometry3d = api.computeFoldedGeometry(sourceModel);
    const hinge = (geometry3d.hinges || []).find(entry => entry.foldIndex === foldIndex);
    if (!hinge) return null;
    const current = movedFacesCentroid(sourceModel, geometry3d, foldIndex);
    if (!current) return null;
    const a = new THREE.Vector3(hinge.origin3[0], hinge.origin3[1], hinge.origin3[2]);
    const u = new THREE.Vector3(hinge.dir3[0], hinge.dir3[1], hinge.dir3[2]);
    const c0 = current.sub(a).applyAxisAngle(u, -unfoldAngle).add(a);
    return makeArcFrame(a, u, c0);
  }

  /* 그리는 중인 접는선(start→end 방향, 왼쪽이 움직임)의 호 좌표계.
     유효한 선이면 MIN_ANGLE로 살짝 접어 본 미리보기 모델에서 무게중심을
     얻고, applyFold가 거부하는 선(찢김 등)도 드래그 UI는 살아 있어야
     하므로 그은 3D 선분을 축으로 삼고 히트 면 전개도의 왼쪽 조각
     무게중심을 대신 쓴다. */
  function computePendingArc(startMaterial, endMaterial, start3, end3, mapper) {
    if (api && model) {
      const probe = api.applyFold(model, startMaterial, endMaterial, MIN_ANGLE);
      if (probe !== model && probe.faces.length > model.faces.length) {
        const frame = arcForFold(probe, model.folds.length, MIN_ANGLE);
        if (frame) return frame;
      }
    }
    const u = end3.clone().sub(start3);
    if (u.lengthSq() < 1e-8 || !mapper?.toWorld) return null;
    u.normalize();
    const c0 = leftPieceCentroid3(mapper, startMaterial, endMaterial);
    return c0 ? makeArcFrame(start3.clone(), u, c0) : null;
  }

  /* 히트 면의 전개도 다각형을 접는선으로 잘라 왼쪽(움직이는 쪽) 조각의
     무게중심을 현재 3D 평면으로 올린다. 왼쪽 조각이 없으면 null. */
  function leftPieceCentroid3(mapper, startMaterial, endMaterial) {
    const poly = mapper.materialPoly;
    if (!Array.isArray(poly) || poly.length < 3) return null;
    const dx = endMaterial[0] - startMaterial[0];
    const dy = endMaterial[1] - startMaterial[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return null;
    const nx = -dy / length;
    const ny = dx / length;
    const left = [];
    for (let index = 0; index < poly.length; index += 1) {
      const cur = poly[index];
      const nxt = poly[(index + 1) % poly.length];
      const dCur = (cur[0] - startMaterial[0]) * nx + (cur[1] - startMaterial[1]) * ny;
      const dNext = (nxt[0] - startMaterial[0]) * nx + (nxt[1] - startMaterial[1]) * ny;
      if (dCur >= -1e-9) left.push(cur);
      if ((dCur > 1e-9 && dNext < -1e-9) || (dCur < -1e-9 && dNext > 1e-9)) {
        const ratio = dCur / (dCur - dNext);
        left.push([cur[0] + ratio * (nxt[0] - cur[0]), cur[1] + ratio * (nxt[1] - cur[1])]);
      }
    }
    if (left.length < 3) return null;
    let doubledArea = 0;
    let cx = 0;
    let cy = 0;
    for (let index = 0; index < left.length; index += 1) {
      const p = left[index];
      const q = left[(index + 1) % left.length];
      const cross = p[0] * q[1] - q[0] * p[1];
      doubledArea += cross;
      cx += (p[0] + q[0]) * cross;
      cy += (p[1] + q[1]) * cross;
    }
    if (Math.abs(doubledArea) < 1e-9) return null;
    return mapper.toWorld([cx / (3 * doubledArea), cy / (3 * doubledArea)]);
  }

  /* 포인터 레이 → 힌지 축 둘레의 부호 있는 각도(-π..π, 각도 0 = r0 방향).
     기본은 플랩의 회전 평면(법선 u, c0 지점)과의 교차이고, 평면이 시선과
     거의 평행하면(그레이징) 레이-축 최근접점으로 대체한다. 어느 쪽이든
     축에 수직인 성분만 남기므로 일관된 방위각이 나온다. 축에 너무
     가까우면(각도 불안정) null. */
  function pointerArcAngle(event, arc) {
    if (!arc || !camera) return null;
    setPointer(event);
    const ray = raycaster.ray;
    const along = ray.direction.dot(arc.u);
    const point = new THREE.Vector3();
    let found = false;
    if (Math.abs(along) > 0.05) {
      const t = arc.center.clone().sub(ray.origin).dot(arc.u) / along;
      if (t > 0) {
        ray.at(t, point);
        found = true;
      }
    }
    if (!found) {
      const offset = ray.origin.clone().sub(arc.a);
      const b = ray.direction.dot(arc.u);
      const denom = 1 - b * b;
      const t = Math.abs(denom) > 1e-9
        ? (b * arc.u.dot(offset) - ray.direction.dot(offset)) / denom
        : arc.center.clone().sub(ray.origin).dot(ray.direction);
      ray.at(Math.max(0, t), point);
    }
    const w = point.sub(arc.center);
    w.addScaledVector(arc.u, -w.dot(arc.u));
    if (w.length() < Math.max(0.03, arc.radius * 0.08)) return null;
    return Math.atan2(new THREE.Vector3().crossVectors(arc.r0, w).dot(arc.u), arc.r0.dot(w));
  }

  /* 점 개수가 매 갱신 달라지는 선 — setFromPoints는 기존 버퍼보다 커지지
     못하므로(three 경고 후 잘림) 지오메트리를 새로 만들어 갈아 끼운다. */
  function setLinePoints(line, points) {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  /* 기즈모를 현재 각도에 맞춰 다시 그린다 — 가이드 원(회전 범위 전체),
     0°→angle 진행 호 + glow, 진행 끝의 화살촉, 호 끝(= 현재 플랩 무게중심
     위치)의 그립 구슬. */
  function updateGizmo(arc, angle, colorHex) {
    if (!gizmoGroup) return;
    if (!arc) {
      gizmoGroup.visible = false;
      return;
    }
    const pointAt = theta => arc.center.clone()
      .addScaledVector(arc.r0, Math.cos(theta))
      .addScaledVector(arc.tangent, Math.sin(theta));
    const guidePoints = [];
    for (let index = 0; index <= 72; index += 1) guidePoints.push(pointAt((index / 72) * TWO_PI));
    setLinePoints(gizmoGuide, guidePoints);
    const steps = Math.max(2, Math.ceil(Math.abs(angle) / (Math.PI / 60)));
    const arcPoints = [];
    for (let index = 0; index <= steps; index += 1) arcPoints.push(pointAt(angle * (index / steps)));
    setLinePoints(gizmoArc, arcPoints);
    setLinePoints(gizmoArcGlow, arcPoints);
    const tip = pointAt(angle);
    // 진행 방향(접선) — angle이 0이어도 +각도 쪽을 가리켜 "이쪽으로
    // 돌린다"는 어포던스가 된다.
    const heading = arc.r0.clone().multiplyScalar(-Math.sin(angle))
      .addScaledVector(arc.tangent, Math.cos(angle))
      .normalize()
      .multiplyScalar(angle < 0 ? -1 : 1);
    gizmoArrow.position.copy(tip).addScaledVector(heading, 0.075);
    gizmoArrow.quaternion.setFromUnitVectors(UP, heading);
    gizmoGrabs[0].position.copy(tip);
    setGizmoColor(colorHex);
    gizmoGuide.visible = true;
    gizmoArcGlow.visible = true;
    gizmoArc.visible = true;
    gizmoArrow.visible = true;
    gizmoGrabs[0].visible = true;
    gizmoGrabs[1].visible = false;
    gizmoGroup.visible = true;
  }

  /* angleAdjust(잡기 전) — 선 양쪽 플랩 후보의 무게중심에 그립 구슬만
     띄워 "어느 쪽을 잡아 접을지"를 고르게 한다. */
  function showGrabChoices(arcLeft, arcRight) {
    if (!gizmoGroup) return;
    const anchors = [arcLeft, arcRight];
    let anyVisible = false;
    gizmoGrabs.forEach((grab, index) => {
      const arc = anchors[index];
      if (arc) {
        grab.position.copy(arc.center).add(arc.r0);
        grab.visible = true;
        anyVisible = true;
      } else {
        grab.visible = false;
      }
    });
    gizmoGuide.visible = false;
    gizmoArcGlow.visible = false;
    gizmoArc.visible = false;
    gizmoArrow.visible = false;
    setGizmoColor(CREASE_MINT);
    gizmoGroup.visible = anyVisible;
  }

  function setGizmoColor(colorHex) {
    [gizmoGuide, gizmoArcGlow, gizmoArc].forEach(line => line.material.color.setHex(colorHex));
    gizmoArrow.material.color.setHex(colorHex);
    gizmoGrabs.forEach(grab => grab.children.forEach(mesh => mesh.material.color.setHex(colorHex)));
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
    const hadHingeSelection = Boolean(hingeAdjustDrag);
    mode = 'idle';
    orbitDrag = null;
    drawState = null;
    angleDrag = null;
    pending = null;
    hingeAdjustDrag = null;
    setOrbiting(false);
    if (canvas) canvas.style.cursor = '';
    if (creaseLine) creaseLine.visible = false;
    if (creaseGlowLine) creaseGlowLine.visible = false;
    if (creaseArrow) creaseArrow.visible = false;
    if (hingeLine) hingeLine.visible = false;
    if (hingeSelectGlow) hingeSelectGlow.visible = false;
    if (gizmoGroup) gizmoGroup.visible = false;
    if (badge) badge.style.display = 'none';
    if (previewShown) {
      previewShown = false;
      rebuildPaper(model);
      rebuildCommittedCreases(model);
    } else if (hadHingeSelection) {
      rebuildCommittedCreases(model); // 하이라이트 색을 금색으로 원복
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
      updateGizmo(pending.arc, angle, angle < 0 ? CREASE_CORAL : CREASE_MINT);
      return;
    }

    // 오른쪽을 잡았으면 start/end를 뒤집어 적용한다(잡은 쪽이 움직이는 쪽).
    const next = api.applyFold(model, pending.foldStart, pending.foldEnd, angle);
    // 거부(원본 반환)뿐 아니라, 종이 전체가 통째로 도는 접기(면이 늘지
    // 않는 경우 — 시트 가장자리를 따라 그은 선)도 편집기에서는 무효로 본다.
    const valid = next !== model && next.faces.length > model.faces.length;
    if (valid) {
      pending.lastValidAngle = angle;
      previewShown = true;
      rebuildPaper(next);
      hingeLine.material.color.setHex(CREASE_GOLD);
      updateGizmo(pending.arc, angle, angle < 0 ? CREASE_CORAL : CREASE_MINT);
    } else {
      hingeLine.material.color.setHex(REJECT_COLOR);
      updateGizmo(pending.arc, angle, REJECT_COLOR);
    }
  }

  /* angleAdjust에서 포인터가 접는선의 어느 쪽 종이를 잡았는지 — 그은 면의
     평면에 레이를 투영해 전개도 좌표로 되돌리고, 방향 있는 선의 왼쪽(+)/
     오른쪽(-)을 부호로 판정한다. 평면과 평행하는 등 판정 불가면 왼쪽. */
  function pickPendingSide(event) {
    if (!pending?.mapper) return 'left';
    setPointer(event);
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(pending.mapper.plane, point)) return 'left';
    const materialPoint = pending.mapper.toMaterial(point);
    const dx = pending.endMaterial[0] - pending.startMaterial[0];
    const dy = pending.endMaterial[1] - pending.startMaterial[1];
    const side = (materialPoint[0] - pending.startMaterial[0]) * -dy
      + (materialPoint[1] - pending.startMaterial[1]) * dx;
    return side < 0 ? 'right' : 'left';
  }

  /* ---------- 포인터 상태기계 ---------- */

  function onPointerDown(event) {
    if (!started || !renderer) return;
    if (typeof event.button === 'number' && event.button !== 0) return;
    canvas.setPointerCapture?.(event.pointerId);

    if (mode === 'angleAdjust') {
      if (!interactive) { cancelInteraction(true); return; }
      // 잡은 쪽이 움직이는 쪽 — 오른쪽을 잡았으면 편집기 차원에서
      // start/end를 뒤집는다(모델 규약 "왼쪽이 움직임"은 그대로).
      const flipped = pickPendingSide(event) === 'right';
      pending.flipped = flipped;
      pending.foldStart = flipped ? pending.endMaterial : pending.startMaterial;
      pending.foldEnd = flipped ? pending.startMaterial : pending.endMaterial;
      pending.arc = flipped ? pending.arcRight : pending.arcLeft;
      mode = 'angleDrag';
      angleDrag = {
        pointerId: event.pointerId,
        lastPointerAngle: pointerArcAngle(event, pending.arc)
      };
      updateGizmo(pending.arc, pending.angle, CREASE_MINT);
      return;
    }
    if (mode !== 'idle') return;
    canvas.style.cursor = ''; // hover 커서 잔상 제거 — 드래그 종류별 커서는 CSS 몫

    // 확정된 힌지가 그리기보다 우선 — 금색 점선 근처를 누르면 재조절 시작.
    if (interactive && model && api) {
      const hinge = pickHinge(event);
      if (hinge && model.folds[hinge.foldIndex]) {
        const currentAngle = model.folds[hinge.foldIndex].angle;
        const arc = arcForFold(model, hinge.foldIndex, currentAngle);
        mode = 'hingeAdjust';
        hingeAdjustDrag = {
          pointerId: event.pointerId,
          foldIndex: hinge.foldIndex,
          originalAngle: currentAngle,
          angle: currentAngle,
          lastStep: Math.round(currentAngle / PREVIEW_STEP),
          lastValidAngle: null,
          rejected: false,
          arc,
          lastPointerAngle: pointerArcAngle(event, arc)
        };
        applyHingeSelection();
        updateGizmo(arc, currentAngle, currentAngle < 0 ? CREASE_CORAL : CREASE_MINT);
        ensureBadge();
        if (badge) {
          badge.textContent = `${Math.round(currentAngle * 180 / Math.PI)}°`;
          badge.style.display = 'block';
        }
        return;
      }
    }

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

    // idle에서 힌지 위에 올리면 포인터 커서로 "집을 수 있음"을 알린다.
    if (mode === 'idle') {
      if (interactive && model && hingeSegments.length) {
        canvas.style.cursor = pickHinge(event) ? 'pointer' : '';
      }
      return;
    }

    if (mode === 'hingeAdjust' && hingeAdjustDrag && event.pointerId === hingeAdjustDrag.pointerId) {
      // 커서의 축 둘레 방위각 변화량을 누적 — 플랩이 커서를 따라 돈다.
      // 힌지 선(축) 바로 위에서 눌러 각도가 불안정하면 첫 유효 샘플까지 대기.
      const theta = pointerArcAngle(event, hingeAdjustDrag.arc);
      if (theta === null) return;
      if (hingeAdjustDrag.lastPointerAngle === null) {
        hingeAdjustDrag.lastPointerAngle = theta;
        return;
      }
      const delta = wrapAngle(theta - hingeAdjustDrag.lastPointerAngle);
      hingeAdjustDrag.lastPointerAngle = theta;
      previewHinge(hingeAdjustDrag.angle + delta);
      return;
    }

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
      const theta = pointerArcAngle(event, pending.arc);
      if (theta === null) return;
      if (angleDrag.lastPointerAngle === null) {
        angleDrag.lastPointerAngle = theta;
        return;
      }
      const delta = wrapAngle(theta - angleDrag.lastPointerAngle);
      angleDrag.lastPointerAngle = theta;
      previewFold(pending.angle + delta);
    }
  }

  function onPointerUp(event) {
    if (!started || !renderer) return;

    if (mode === 'hingeAdjust' && hingeAdjustDrag && event.pointerId === hingeAdjustDrag.pointerId) {
      const foldIndex = hingeAdjustDrag.foldIndex;
      const commitAngle = hingeAdjustDrag.lastValidAngle;
      const changed = typeof commitAngle === 'number'
        && Math.abs(commitAngle - hingeAdjustDrag.originalAngle) > 1e-9;
      resetInteraction();
      if (changed) onAdjustHinge?.(foldIndex, commitAngle);
      return;
    }

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
        mapper: drawState.mapper,
        angle: 0,
        lastValidAngle: null,
        lastStep: 0,
        // 어느 쪽을 잡는지에 따라 접히는 쪽이 정해진다 — 양쪽 방향의 호
        // 좌표계를 미리 만들어 두고, pointerdown에서 잡은 쪽을 고른다.
        arcLeft: null,
        arcRight: null,
        arc: null,
        flipped: false,
        foldStart: drawState.startMaterial,
        foldEnd: drawState.endMaterial
      };
      pending.arcLeft = computePendingArc(
        pending.startMaterial, pending.endMaterial, pending.start3, pending.end3, pending.mapper);
      pending.arcRight = computePendingArc(
        pending.endMaterial, pending.startMaterial, pending.end3, pending.start3, pending.mapper);
      drawState = null;
      mode = 'angleAdjust';
      creaseLine.visible = false;
      creaseGlowLine.visible = false;
      creaseArrow.visible = false;
      hingeLine.material.color.setHex(CREASE_GOLD);
      setLine(hingeLine, pending.start3, pending.end3, pending.normal);
      showGrabChoices(pending.arcLeft, pending.arcRight);
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
        // 오른쪽을 잡았던 경우 뒤집힌 start/end 그대로 확정한다 —
        // 컨트롤러의 applyFold 재현이 미리보기와 같은 쪽을 접도록.
        const { foldStart, foldEnd } = pending;
        resetInteraction();
        onCommitFold?.(foldStart, foldEnd, commitAngle);
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
    // hingeAdjust는 wasFolding에 안 들어가므로 onCancel 없이 원상 복귀만 한다.
    if (mode === 'drawing' || mode === 'angleAdjust' || mode === 'angleDrag' || mode === 'hingeAdjust') {
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
    if (!interactive && (mode === 'drawing' || mode === 'angleAdjust' || mode === 'angleDrag' || mode === 'hingeAdjust')) {
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
      hingeSelectGlow.geometry.dispose();
      hingeSelectGlow.material.dispose();
      [gizmoGuide, gizmoArcGlow, gizmoArc, gizmoArrow].forEach(part => {
        part.geometry.dispose();
        part.material.dispose();
      });
      gizmoGrabs.forEach(grab => grab.children.forEach(mesh => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }));
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
