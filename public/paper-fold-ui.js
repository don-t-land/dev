(function (root) {
  'use strict';

  const api = root.paperFoldModel;
  let canvas;
  let ctx;
  let model;
  let active = false;
  let locked = false;
  let ends = 0;
  let timed = true;
  let direction = 1;
  let drag = null;
  let frame = 0;
  let onComplete = null;
  let completionSent = false;
  let roomProgress = null;
  let previousProfile = null;
  let onModelChange = null;

  const $ = id => document.getElementById(id);

  function fitCanvas() {
    if (!canvas) return;
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
    const scale = Math.min(rect.width / 3.05, rect.height / 3.7);
    return { width: rect.width, height: rect.height, scale, cx: rect.width / 2, cy: rect.height / 2 };
  }

  function paperToScreen(point, camera = view()) {
    return [camera.cx + point[0] * camera.scale, camera.cy - point[1] * camera.scale];
  }

  function screenToPaper(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const camera = view();
    return [(clientX - rect.left - camera.cx) / camera.scale, -(clientY - rect.top - camera.cy) / camera.scale];
  }

  function drawGrid(camera) {
    ctx.save();
    ctx.strokeStyle = 'rgba(126,226,242,.08)';
    ctx.lineWidth = 1;
    const step = Math.max(24, camera.scale * .25);
    for (let x = camera.cx % step; x < camera.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, camera.height); ctx.stroke();
    }
    for (let y = camera.cy % step; y < camera.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(camera.width, y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFaces(camera) {
    const faces = [...model.faces].sort((a, b) => a.layer - b.layer);
    faces.forEach((face, index) => {
      if (!face.poly.length) return;
      ctx.beginPath();
      face.poly.forEach((point, pointIndex) => {
        const [x, y] = paperToScreen(point, camera);
        if (pointIndex === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      const light = 94 - Math.min(22, Math.abs(face.layer) * 3 + index * 1.2);
      const hue = 187 + ((face.layer * 13 + index * 7) % 28);
      ctx.fillStyle = `hsl(${hue} 78% ${light}%)`;
      ctx.shadowColor = 'rgba(83,219,239,.3)';
      ctx.shadowBlur = 22;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(38,91,149,.65)';
      ctx.stroke();
    });
  }

  function drawFoldPreview(camera) {
    if (!drag) return;
    const start = drag.start;
    const end = drag.end;
    const [sx, sy] = paperToScreen(start, camera);
    const [ex, ey] = paperToScreen(end, camera);
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length <= .001) return;

    ctx.save();
    ctx.setLineDash([12, 8]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = direction > 0 ? '#69e3b6' : '#ff8d86';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);

    const angle = Math.atan2(ey - sy, ex - sx);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(angle - .55) * 16, ey - Math.sin(angle - .55) * 16);
    ctx.lineTo(ex - Math.cos(angle + .55) * 16, ey - Math.sin(angle + .55) * 16);
    ctx.closePath(); ctx.fill();

    const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const left = [-dy / length, dx / length];
    const sideStart = paperToScreen(midpoint, camera);
    const sideEnd = paperToScreen([
      midpoint[0] + left[0] * .36,
      midpoint[1] + left[1] * .36
    ], camera);
    ctx.globalAlpha = .72;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sideStart[0], sideStart[1]); ctx.lineTo(sideEnd[0], sideEnd[1]); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function emitModelChange(value) {
    if (typeof onModelChange === 'function') onModelChange(value);
  }

  const DISPLAYED_STAT_FIELDS = ['liftScale', 'dragScale', 'stability', 'stallSpeed', 'rollBias'];

  function renderStats() {
    const host = $('fold-stats');
    const aero = root.PaperAeroProfile;
    const view = root.foldStatsView;
    if (!host || !aero || !view || !model) return;
    const profile = aero.deriveAerodynamicProfile(model);
    if (previousProfile && DISPLAYED_STAT_FIELDS.every(field => profile[field] === previousProfile[field])) {
      return;
    }
    const rows = view.buildStatsRows(profile, previousProfile);
    previousProfile = profile;
    host.innerHTML = rows.map(row => `
      <div class="fold-stat-row${row.good ? ' good' : ''}">
        <span>${row.label}</span>
        <span class="fold-stat-bar"><i style="width:${row.percent}%"></i></span>
        <span class="fold-stat-value">${row.text}</span>
        <span class="fold-stat-delta">${row.delta === 'up' ? '▲' : row.delta === 'down' ? '▼' : ''}</span>
      </div>`).join('');
  }

  function updateStats() {
    const count = model?.commands?.length || 0;
    const peers = roomProgress
      ? (timed ? ` · 완료 ${roomProgress.done}/${roomProgress.total}명` : ` · 방 인원 ${roomProgress.total}명 · 전투 진행 중`)
      : '';
    $('fold-status').textContent = locked
      ? (timed
        ? `완성 · ${count}번 접음 · 다른 플레이어를 기다리는 중${peers}`
        : `완성 · ${count}번 접음 · 활공을 시작합니다${peers}`)
      : (timed
        ? `${count}/10번 접음 · 그은 선의 왼쪽 면이 접힙니다${peers}`
        : `${count}/10번 접음 · 완성 버튼을 누르면 바로 출격합니다${peers}`);
    $('fold-undo-btn').disabled = locked || !count;
    renderStats();
  }

  function render() {
    if (!active) { frame = 0; return; }
    fitCanvas();
    const camera = view();
    ctx.clearRect(0, 0, camera.width, camera.height);
    drawGrid(camera);
    drawFaces(camera);
    drawFoldPreview(camera);

    if (timed) {
      const left = Math.max(0, ends - Date.now());
      const seconds = Math.ceil(left / 1000);
      const timer = $('fold-timer');
      const minutesPart = Math.floor(seconds / 60);
      const secondsPart = seconds % 60;
      timer.textContent = `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}`;
      timer.classList.toggle('low', seconds <= 10);
      if (left <= 0 && !locked) lock('시간 종료 · 접은 모양으로 출발합니다');
    }
    frame = requestAnimationFrame(render);
  }

  function lock(message) {
    if (locked) return;
    locked = true;
    drag = null;
    updateStats();
    const finalMessage = message || (timed
      ? '완성 · 다른 플레이어의 접기가 끝나기를 기다리는 중'
      : '완성 · 활공 시작!');
    $('fold-status').textContent = finalMessage;
    $('fold-complete-btn').textContent = '완성됨';
    $('fold-complete-btn').disabled = true;
    $('fold-preset-btn').disabled = true;
    if (!completionSent) {
      completionSent = true;
      onComplete?.({ commands: api.serializeFoldCommands(model) });
    }
  }

  function enter(options) {
    if (!api) throw new Error('paperFoldModel is not loaded');
    timed = Number.isFinite(Number(options?.ends));
    ends = timed ? Number(options.ends) : 0;
    const initial = typeof options?.initialCommands === 'string' && options.initialCommands !== '[]'
      ? api.replayFoldCommands(options.initialCommands)
      : null;
    model = initial || api.createPaperModel();
    $('fold-timer').classList.toggle('hide', !timed);
    direction = 1;
    drag = null;
    locked = false;
    completionSent = false;
    roomProgress = null;
    previousProfile = null;
    onComplete = typeof options?.onComplete === 'function' ? options.onComplete : null;
    active = true;
    $('folding-screen').classList.remove('hide');
    $('fold-dir-valley').classList.add('active');
    $('fold-dir-mountain').classList.remove('active');
    $('fold-complete-btn').disabled = false;
    $('fold-preset-btn').disabled = false;
    $('fold-complete-btn').textContent = '비행기 완성';
    updateStats();
    emitModelChange(model);
    if (!frame) frame = requestAnimationFrame(render);
  }

  function leave() {
    active = false;
    drag = null;
    $('folding-screen')?.classList.add('hide');
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    emitModelChange(null);
  }

  function setDirection(next) {
    if (locked) return;
    direction = next;
    $('fold-dir-valley').classList.toggle('active', next > 0);
    $('fold-dir-mountain').classList.toggle('active', next < 0);
  }

  function init() {
    canvas = $('fold-paper-canvas');
    if (!canvas || !api) return;
    ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', event => {
      if (!active || locked) return;
      canvas.setPointerCapture(event.pointerId);
      const point = screenToPaper(event.clientX, event.clientY);
      drag = { start: point, end: point };
    });
    canvas.addEventListener('pointermove', event => {
      if (!drag || locked) return;
      drag.end = screenToPaper(event.clientX, event.clientY);
    });
    canvas.addEventListener('pointerup', event => {
      if (!drag || locked) return;
      const completed = drag;
      drag = null;
      const next = api.applyFold(model, completed.start, completed.end, direction);
      if (next === model) {
        $('fold-status').textContent = '더 길게, 종이 안쪽에서 바깥쪽으로 드래그해 주세요';
        return;
      }
      model = next;
      updateStats();
      emitModelChange(model);
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    $('fold-dir-valley').addEventListener('click', () => setDirection(1));
    $('fold-dir-mountain').addEventListener('click', () => setDirection(-1));
    $('fold-preset-btn').addEventListener('click', () => {
      if (locked) return;
      const preset = api.createPresetModel('dart');
      if (!preset) {
        $('fold-status').textContent = '기본 비행기 프리셋을 불러오지 못했습니다';
        return;
      }
      model = preset;
      drag = null;
      updateStats();
      emitModelChange(model);
    });
    $('fold-undo-btn').addEventListener('click', () => {
      if (locked) return;
      model = api.undoFold(model);
      updateStats();
      emitModelChange(model);
    });
    $('fold-complete-btn').addEventListener('click', () => lock());
    root.addEventListener('resize', fitCanvas);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  root.paperFoldingStage = {
    enter,
    leave,
    getModel: () => model,
    getCommands: () => model ? api.serializeFoldCommands(model) : '[]',
    isLocked: () => locked,
    setRoomProgress(done, total) {
      roomProgress = {
        done: Math.max(0, Number(done) || 0),
        total: Math.max(0, Number(total) || 0)
      };
      if (model) updateStats();
    },
    setOnModelChange(fn) {
      onModelChange = typeof fn === 'function' ? fn : null;
    }
  };
})(window);
