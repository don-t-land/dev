(function (root) {
  'use strict';

  const api = root.paperFoldModel;
  const viewport = root.paperFoldViewport;
  const EDIT_CONTROL_IDS = [
    'fold-dir-valley', 'fold-dir-mountain', 'fold-flip-btn', 'fold-undo-btn'
  ];
  const ANIMATION_MS = 300;
  const CLICK_DISTANCE = 8;
  const ORBIT_SENSITIVITY = 0.008;

  let canvas;
  let ctx;
  let model;
  let previewModel = null;
  let active = false;
  let locked = false;
  let animating = false;
  let animationToken = 0;
  let ends = 0;
  let direction = 1;
  let drag = null;
  let orbitDrag = null;
  let cameraOrbit = null;
  let selectedFaceId = null;
  let selectionMaterial = null;
  let frame = 0;
  let onComplete = null;
  let completionSent = false;
  let roomProgress = null;
  let statusBase = '면을 선택해 자유롭게 접어 보세요';

  const $ = id => document.getElementById(id);

  function foldCommands() {
    return model?.commands?.filter(command => command.type === 'fold') || [];
  }

  function flipCount() {
    return model?.commands?.filter(command => command.type === 'flip').length || 0;
  }

  function fitCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function view() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(1, Math.min(rect.width / 3.25, rect.height / 3.2));
    const orbit = cameraOrbit || viewport.DEFAULT_ORBIT;
    const basis = viewport.cameraBasisFromOrbit(orbit.azimuth, orbit.elevation);
    return {
      ...viewport.DEFAULT_CAMERA,
      ...basis,
      width: rect.width,
      height: rect.height,
      scale,
      cx: rect.width / 2,
      cy: rect.height * .54
    };
  }

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  function faceById(id) {
    return model?.faces?.find(face => face.id === id) || null;
  }

  function renderedModel() {
    return previewModel || model;
  }

  function shortFaceName(face) {
    if (!face) return '선택된 면 없음';
    const index = model.faces.indexOf(face) + 1;
    const posture = Math.abs(viewport.faceNormal(face)[2]) < .35 ? '세워진 패널' : '종이 면';
    return `면 ${index} · ${posture}`;
  }

  function updateSelectionLabel() {
    const face = faceById(selectedFaceId);
    if (!face) selectedFaceId = null;
    $('fold-selection').textContent = shortFaceName(face);
  }

  function reconcileSelection(previousId = selectedFaceId, preferredFoldId = null, materialPoint = selectionMaterial) {
    let nextFace = model?.faces?.find(face => face.id === previousId) || null;
    if (!nextFace && preferredFoldId) {
      nextFace = model.faces.find(face => face.id.startsWith(`${previousId}:${preferredFoldId}:m`))
        || model.faces.find(face => face.folds.includes(preferredFoldId));
    }
    if (!nextFace && materialPoint) {
      const candidates = model.faces.filter(face => viewport.pointInPolygon(materialPoint, face.materialPoly));
      nextFace = candidates.sort((left, right) => right.layer - left.layer)[0] || null;
    }
    selectedFaceId = nextFace?.id || null;
    updateSelectionLabel();
    return nextFace;
  }

  function peerSuffix() {
    return roomProgress ? ` · 완료 ${roomProgress.done}/${roomProgress.total}명` : '';
  }

  function refreshStatus() {
    $('fold-status').textContent = `${statusBase}${peerSuffix()}`;
  }

  function setStatus(message) {
    statusBase = message;
    refreshStatus();
  }

  function setEditingDisabled() {
    EDIT_CONTROL_IDS.forEach(id => {
      const control = $(id);
      if (control) control.disabled = locked || animating;
    });
    $('fold-undo-btn').disabled = locked || animating || !model?.commands?.length;
    document.querySelectorAll('[data-fold-edit]').forEach(control => {
      control.disabled = locked || animating;
    });
    canvas.setAttribute('aria-disabled', String(locked));
  }

  function updateStats(options = {}) {
    const folds = foldCommands();
    $('fold-count').textContent = `${folds.length}/10 folds`;
    const flips = flipCount();
    $('fold-side').textContent = `${model?.paperSide === 'back' ? '뒷면' : '앞면'}${flips ? ` · 뒤집기 ${flips}회` : ''}`;
    updateSelectionLabel();
    if (options.history !== false) renderHistory();
    setEditingDisabled();
    refreshStatus();
  }

  function makeButton(text, action, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.dataset.foldAction = action;
    button.dataset.foldEdit = '';
    if (label) button.setAttribute('aria-label', label);
    return button;
  }

  function renderHistory() {
    const history = $('fold-history');
    history.replaceChildren();
    const folds = foldCommands();
    if (!folds.length) {
      const empty = document.createElement('div');
      empty.className = 'fold-history-empty';
      empty.textContent = '아직 접기가 없습니다. 어떤 면에서든 시작하세요.';
      history.append(empty);
      return;
    }

    folds.forEach((command, index) => {
      const card = document.createElement('article');
      card.className = 'fold-history-card';
      card.dataset.foldId = command.id;

      const head = document.createElement('div');
      head.className = 'fold-history-head';
      const title = document.createElement('span');
      title.className = 'fold-history-title';
      title.textContent = `접기 ${index + 1}`;
      const foldDirection = document.createElement('span');
      foldDirection.className = 'fold-history-direction';
      foldDirection.textContent = command.direction > 0 ? '골접기' : '산접기';
      head.append(title, foldDirection);

      const angleRow = document.createElement('label');
      angleRow.className = 'fold-history-angle';
      const range = document.createElement('input');
      range.type = 'range';
      range.min = '0';
      range.max = '180';
      range.step = '15';
      range.value = String(command.targetAngle);
      range.dataset.foldEdit = '';
      range.dataset.foldAction = 'angle-range';
      range.setAttribute('aria-label', `접기 ${index + 1} 현재 각도`);
      const output = document.createElement('output');
      output.value = `${command.targetAngle}°`;
      output.textContent = `${command.targetAngle}°`;
      output.setAttribute('aria-live', 'polite');
      angleRow.append(range, output);

      const actions = document.createElement('div');
      actions.className = 'fold-history-actions';
      actions.append(
        makeButton('0°', 'angle-0', `접기 ${index + 1}을 0도로 펼치기`),
        makeButton('90°', 'angle-90', `접기 ${index + 1}을 90도로 설정`),
        makeButton('180°', 'angle-180', `접기 ${index + 1}을 180도로 설정`),
        makeButton('삭제', 'delete', `접기 ${index + 1} 삭제`)
      );
      card.append(head, angleRow, actions);
      history.append(card);
    });
    setEditingDisabled();
  }

  function drawGrid(camera) {
    ctx.save();
    ctx.strokeStyle = 'rgba(126,226,242,.065)';
    ctx.lineWidth = 1;
    const step = Math.max(26, camera.scale * .25);
    for (let x = camera.cx % step; x < camera.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, camera.height); ctx.stroke();
    }
    for (let y = camera.cy % step; y < camera.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(camera.width, y); ctx.stroke();
    }
    ctx.restore();
  }

  function tracePolygon(points) {
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
    });
    ctx.closePath();
  }

  function drawFaces(camera) {
    const faces = renderedModel().faces.map(face => viewport.projectFace(face, camera))
      .filter(projected => projected.face.vertices3d.length >= 3)
      .sort((left, right) => left.depth - right.depth || left.face.layer - right.face.layer);

    faces.forEach((projected, index) => {
      const selected = projected.face.id === selectedFaceId;
      const front = projected.facing >= 0;
      const brightness = 72 + Math.min(18, Math.abs(projected.facing) * 18) - Math.min(8, index * .45);
      tracePolygon(projected.points);
      ctx.save();
      ctx.shadowColor = selected ? 'rgba(82,239,233,.55)' : 'rgba(20,34,71,.42)';
      ctx.shadowBlur = selected ? 23 : 12;
      ctx.fillStyle = front
        ? `hsl(188 62% ${brightness}%)`
        : `hsl(267 38% ${Math.max(57, brightness - 9)}%)`;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineJoin = 'round';
      ctx.lineWidth = selected ? 5 : 1.6;
      ctx.strokeStyle = selected ? '#65eee9' : 'rgba(37,71,123,.78)';
      ctx.stroke();
      ctx.restore();

      if (selected) {
        const center = projected.points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0])
          .map(value => value / projected.points.length);
        ctx.save();
        ctx.font = '900 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(5,24,45,.9)';
        ctx.fillRect(center[0] - 25, center[1] - 11, 50, 20);
        ctx.fillStyle = '#85f7f0';
        ctx.fillText('선택 면', center[0], center[1] + 3);
        ctx.restore();
      }
    });
  }

  function drawCreases(camera) {
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(244,205,108,.68)';
    renderedModel().folds.forEach(fold => {
      const start = viewport.projectPoint(fold.axis3d[0], camera).point;
      const end = viewport.projectPoint(fold.axis3d[1], camera).point;
      ctx.beginPath(); ctx.moveTo(start[0], start[1]); ctx.lineTo(end[0], end[1]); ctx.stroke();
    });
    ctx.restore();
  }

  function drawFoldPreview(camera) {
    if (!drag) return;
    const face = faceById(drag.faceId);
    if (!face) return;
    const start = viewport.materialToScreen(face, drag.start, camera);
    const end = viewport.materialToScreen(face, drag.end, camera);
    if (!start || !end || Math.hypot(end[0] - start[0], end[1] - start[1]) < 1) return;
    ctx.save();
    ctx.setLineDash([11, 7]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = direction > 0 ? '#69e3b6' : '#ff8d86';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(start[0], start[1]); ctx.lineTo(end[0], end[1]); ctx.stroke();
    ctx.setLineDash([]);
    const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(end[0], end[1]);
    ctx.lineTo(end[0] - Math.cos(angle - .55) * 14, end[1] - Math.sin(angle - .55) * 14);
    ctx.lineTo(end[0] - Math.cos(angle + .55) * 14, end[1] - Math.sin(angle + .55) * 14);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function render() {
    if (!active) { frame = 0; return; }
    fitCanvas();
    const camera = view();
    ctx.clearRect(0, 0, camera.width, camera.height);
    drawGrid(camera);
    drawFaces(camera);
    drawCreases(camera);
    drawFoldPreview(camera);

    const left = Math.max(0, ends - Date.now());
    const seconds = Math.ceil(left / 1000);
    const timer = $('fold-timer');
    timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    timer.classList.toggle('low', seconds <= 10);
    if (left <= 0 && !locked) lock('시간 종료 · 현재 접은 모양으로 출발합니다');
    frame = root.requestAnimationFrame(render);
  }

  function animateFold(foldId, angle) {
    const token = ++animationToken;
    const started = root.performance?.now?.() || Date.now();
    animating = true;
    setEditingDisabled();
    function step(now) {
      if (token !== animationToken || locked || !active) return;
      const progress = Math.min(1, ((Number(now) || Date.now()) - started) / ANIMATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      const previewAngle = Math.round(angle * eased * 1000) / 1000;
      previewModel = api.updateFoldAngle(model, foldId, previewAngle);
      if (progress < 1) {
        root.requestAnimationFrame(step);
        return;
      }
      previewModel = null;
      animating = false;
      reconcileSelection(selectedFaceId, foldId, selectionMaterial);
      setStatus(`새 접기를 ${angle}° 각도로 적용했습니다`);
      updateStats();
    }
    root.requestAnimationFrame(step);
  }

  function applyCompletedDrag(completed) {
    const previousId = selectedFaceId;
    const next = api.applyPanelFold(model, {
      start: completed.start,
      end: completed.end,
      coordinateSpace: 'material',
      direction,
      targetAngle: 0,
      seedFaceId: completed.faceId
    });
    if (next === model) {
      setStatus('이 선으로는 접을 수 없습니다. 선택한 면을 가로질러 더 길게 그어 주세요');
      return;
    }
    model = next;
    const foldId = foldCommands().at(-1).id;
    selectionMaterial = completed.start.slice();
    reconcileSelection(previousId, foldId, selectionMaterial);
    setStatus('접기 선을 만들었습니다 · 히스토리에서 각도를 조절하세요');
    updateStats();
  }

  function changeFoldAngle(foldId, angle, renderCards) {
    const previousId = selectedFaceId;
    const next = api.updateFoldAngle(model, foldId, angle);
    const current = foldCommands().find(command => command.id === foldId)?.targetAngle;
    if (next === model && current !== angle) {
      setStatus('후속 접기와 연결되어 이 각도로 변경할 수 없습니다');
      return false;
    }
    model = next;
    reconcileSelection(previousId, foldId, selectionMaterial);
    setStatus(`접기 각도를 ${angle}°로 재설정했습니다`);
    updateStats({ history: renderCards !== false });
    return true;
  }

  function deleteFold(foldId) {
    const previousId = selectedFaceId;
    const number = foldCommands().findIndex(command => command.id === foldId) + 1;
    const next = api.removeFold(model, foldId);
    if (next === model) {
      setStatus('후속 접기가 이 면에 의존하므로 먼저 뒤의 접기를 삭제해 주세요');
      return;
    }
    model = next;
    reconcileSelection(previousId, null, selectionMaterial);
    setStatus(`${number}번 접기를 삭제했습니다`);
    updateStats();
  }

  function lock(message) {
    if (locked) return;
    locked = true;
    animating = false;
    animationToken += 1;
    previewModel = null;
    drag = null;
    orbitDrag = null;
    canvas?.classList.remove('orbiting');
    $('fold-complete-btn').textContent = '완성됨';
    $('fold-complete-btn').disabled = true;
    setStatus(message || '완성 · 다른 플레이어를 기다리는 중');
    updateStats();
    if (!completionSent) {
      completionSent = true;
      onComplete?.({ commands: api.serializeFoldCommands(model) });
    }
  }

  function enter(options) {
    if (!api || !viewport) throw new Error('paper fold modules are not loaded');
    model = api.createPaperModel();
    previewModel = null;
    ends = Number(options?.ends) || Date.now() + 60000;
    direction = 1;
    drag = null;
    orbitDrag = null;
    cameraOrbit = { ...viewport.DEFAULT_ORBIT };
    selectedFaceId = null;
    selectionMaterial = null;
    locked = false;
    animating = false;
    animationToken += 1;
    completionSent = false;
    roomProgress = null;
    statusBase = '면을 선택해 자유롭게 접어 보세요';
    onComplete = typeof options?.onComplete === 'function' ? options.onComplete : null;
    active = true;
    $('folding-screen').classList.remove('hide');
    setDirection(1);
    $('fold-complete-btn').disabled = false;
    $('fold-complete-btn').textContent = '비행기 완성';
    updateStats();
    if (!frame) frame = root.requestAnimationFrame(render);
  }

  function leave() {
    active = false;
    animating = false;
    animationToken += 1;
    previewModel = null;
    drag = null;
    orbitDrag = null;
    canvas?.classList.remove('orbiting');
    $('folding-screen')?.classList.add('hide');
    if (frame) root.cancelAnimationFrame(frame);
    frame = 0;
  }

  function setDirection(next) {
    if (locked || animating) return;
    direction = next;
    $('fold-dir-valley').classList.toggle('active', next > 0);
    $('fold-dir-mountain').classList.toggle('active', next < 0);
    $('fold-dir-valley').setAttribute('aria-pressed', String(next > 0));
    $('fold-dir-mountain').setAttribute('aria-pressed', String(next < 0));
  }


  function projectedArea(points) {
    return Math.abs((points || []).reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2);
  }

  function visibleFaces() {
    const camera = view();
    return (model?.faces || [])
      .map(face => viewport.projectFace(face, camera))
      .filter(projected => projected.points.length >= 3 && projectedArea(projected.points) > .5)
      .sort((left, right) => right.depth - left.depth
        || Number(right.face.layer || 0) - Number(left.face.layer || 0))
      .map(projected => projected.face);
  }

  function materialBounds(face) {
    const points = face?.materialPoly || [];
    if (points.length < 3) return null;
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const bounds = {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
      centerX: xs.reduce((sum, value) => sum + value, 0) / xs.length,
      centerY: ys.reduce((sum, value) => sum + value, 0) / ys.length
    };
    return Object.values(bounds).every(Number.isFinite) ? bounds : null;
  }

  function cycleVisibleFace(step) {
    const faces = visibleFaces();
    if (!faces.length) {
      setStatus('키보드로 선택할 수 있는 보이는 면이 없습니다');
      return null;
    }
    const current = faces.findIndex(face => face.id === selectedFaceId);
    const index = current < 0
      ? (step > 0 ? 0 : faces.length - 1)
      : (current + step + faces.length) % faces.length;
    const face = faces[index];
    const bounds = materialBounds(face);
    selectedFaceId = face.id;
    selectionMaterial = bounds ? [bounds.centerX, bounds.centerY] : null;
    updateSelectionLabel();
    setStatus(`${shortFaceName(face)}이 키보드로 선택되었습니다 · ${index + 1}/${faces.length}`);
    return face;
  }

  function applyKeyboardCrease(key) {
    const face = faceById(selectedFaceId) || cycleVisibleFace(1);
    const bounds = materialBounds(face);
    if (!face || !bounds) {
      setStatus('선택한 면에는 키보드 접기선을 만들 수 없습니다');
      return;
    }
    const centerX = bounds.centerX;
    const centerY = bounds.centerY;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    let start;
    let end;
    if (key === 'v') {
      start = [centerX, bounds.maxY];
      end = [centerX, bounds.minY];
    } else if (key === 'd') {
      start = [centerX - width, centerY - height];
      end = [centerX + width, centerY + height];
    } else {
      // H and Enter share the predictable horizontal default crease.
      start = [bounds.minX, centerY];
      end = [bounds.maxX, centerY];
    }
    applyCompletedDrag({ faceId: face.id, start, end });
  }

  function init() {
    canvas = $('fold-paper-canvas');
    if (!canvas || !api || !viewport) return;
    ctx = canvas.getContext('2d');

    canvas.addEventListener('keydown', event => {
      if (!active || locked || animating) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        cycleVisibleFace(event.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      const key = event.key === 'Enter' ? 'enter' : String(event.key || '').toLowerCase();
      if (!['h', 'v', 'd', 'enter'].includes(key)) return;
      event.preventDefault();
      applyKeyboardCrease(key);
    });

    canvas.addEventListener('pointerdown', event => {
      if (!active || locked || animating) return;
      const button = Number.isInteger(event.button) ? event.button : 0;
      if (button === 1) {
        event.preventDefault();
        const screen = localPoint(event);
        const orbit = cameraOrbit || viewport.DEFAULT_ORBIT;
        orbitDrag = {
          pointerId: event.pointerId,
          startScreen: screen,
          azimuth: orbit.azimuth,
          elevation: orbit.elevation
        };
        drag = null;
        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add('orbiting');
        return;
      }
      if (button !== 0) return;
      const screen = localPoint(event);
      const hit = viewport.hitTestFaces(model.faces, screen, view());
      if (!hit) {
        setStatus('종이의 보이는 면 안쪽을 눌러 주세요');
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      selectedFaceId = hit.face.id;
      selectionMaterial = hit.material.slice();
      drag = {
        pointerId: event.pointerId,
        faceId: hit.face.id,
        start: hit.material.slice(),
        end: hit.material.slice(),
        startScreen: screen,
        endScreen: screen
      };
      updateSelectionLabel();
      setStatus(`${shortFaceName(hit.face)}이 선택되었습니다 · 드래그해 접을 선을 그으세요`);
    });

    canvas.addEventListener('pointermove', event => {
      if (orbitDrag) {
        if (event.pointerId !== orbitDrag.pointerId || locked || animating) return;
        event.preventDefault();
        const screen = localPoint(event);
        const basis = viewport.cameraBasisFromOrbit(
          orbitDrag.azimuth - (screen[0] - orbitDrag.startScreen[0]) * ORBIT_SENSITIVITY,
          orbitDrag.elevation - (screen[1] - orbitDrag.startScreen[1]) * ORBIT_SENSITIVITY
        );
        cameraOrbit = { azimuth: basis.azimuth, elevation: basis.elevation };
        return;
      }
      if (!drag || event.pointerId !== drag.pointerId || locked || animating) return;
      const face = faceById(drag.faceId);
      if (!face) return;
      const screen = localPoint(event);
      const material = viewport.screenToMaterial(face, screen, view());
      if (material) {
        drag.end = material;
        drag.endScreen = screen;
      }
    });

    canvas.addEventListener('pointerup', event => {
      if (orbitDrag) {
        if (event.pointerId !== orbitDrag.pointerId) return;
        event.preventDefault();
        orbitDrag = null;
        canvas.classList.remove('orbiting');
        setStatus('종이 중심 시점을 조절했습니다');
        return;
      }
      if (!drag || event.pointerId !== drag.pointerId || locked || animating) return;
      const face = faceById(drag.faceId);
      const screen = localPoint(event);
      const material = face && viewport.screenToMaterial(face, screen, view());
      if (material) {
        drag.end = material;
        drag.endScreen = screen;
      }
      const completed = drag;
      drag = null;
      if (Math.hypot(completed.endScreen[0] - completed.startScreen[0], completed.endScreen[1] - completed.startScreen[1]) < CLICK_DISTANCE) {
        setStatus(`${shortFaceName(face)}이 선택되었습니다`);
        return;
      }
      applyCompletedDrag(completed);
    });

    function cancelPointerInteraction(event) {
      if (orbitDrag && event.pointerId === orbitDrag.pointerId) {
        orbitDrag = null;
        canvas.classList.remove('orbiting');
      }
      if (drag && event.pointerId === drag.pointerId) drag = null;
    }
    canvas.addEventListener('pointercancel', cancelPointerInteraction);
    canvas.addEventListener('lostpointercapture', cancelPointerInteraction);
    canvas.addEventListener('auxclick', event => {
      if (event.button === 1) event.preventDefault();
    });
    $('fold-dir-valley').addEventListener('click', () => setDirection(1));
    $('fold-dir-mountain').addEventListener('click', () => setDirection(-1));
    $('fold-flip-btn').addEventListener('click', () => {
      if (locked || animating) return;
      const next = api.flipPaper(model);
      if (next === model) {
        setStatus('지금은 종이를 뒤집을 수 없습니다');
        return;
      }
      model = next;
      reconcileSelection(selectedFaceId, null, selectionMaterial);
      setStatus(`종이를 ${model.paperSide === 'back' ? '뒷면' : '앞면'}으로 뒤집었습니다`);
      updateStats();
    });
    $('fold-undo-btn').addEventListener('click', () => {
      if (locked || animating) return;
      model = api.undoFold(model);
      reconcileSelection(selectedFaceId, null, selectionMaterial);
      setStatus('마지막 동작을 취소했습니다');
      updateStats();
    });
    $('fold-history').addEventListener('input', event => {
      if (event.target.dataset.foldAction !== 'angle-range' || locked || animating) return;
      const card = event.target.closest('[data-fold-id]');
      const angle = Number(event.target.value);
      if (changeFoldAngle(card.dataset.foldId, angle, false)) {
        const output = event.target.nextElementSibling;
        output.value = `${angle}°`;
        output.textContent = `${angle}°`;
      }
    });
    $('fold-history').addEventListener('change', event => {
      if (event.target.dataset.foldAction === 'angle-range') renderHistory();
    });
    $('fold-history').addEventListener('click', event => {
      const button = event.target.closest('button[data-fold-action]');
      if (!button || locked || animating) return;
      const foldId = button.closest('[data-fold-id]').dataset.foldId;
      if (button.dataset.foldAction === 'delete') deleteFold(foldId);
      else if (button.dataset.foldAction.startsWith('angle-')) {
        changeFoldAngle(foldId, Number(button.dataset.foldAction.slice(6)), true);
      }
    });
    $('fold-complete-btn').addEventListener('click', () => lock('완성 · 다른 플레이어의 접기가 끝나기를 기다리는 중'));
    root.addEventListener('resize', fitCanvas);
    setEditingDisabled();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  root.paperFoldingStage = {
    enter,
    leave,
    getModel: () => model,
    getCommands: () => model ? api.serializeFoldCommands(model) : '[]',
    getViewState: () => {
      const orbit = cameraOrbit || viewport.DEFAULT_ORBIT;
      return { azimuth: orbit.azimuth, elevation: orbit.elevation };
    },
    isLocked: () => locked,
    setRoomProgress(done, total) {
      roomProgress = {
        done: Math.max(0, Number(done) || 0),
        total: Math.max(0, Number(total) || 0)
      };
      if (model) refreshStatus();
    }
  };
})(window);
