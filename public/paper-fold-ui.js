/* 접기 화면 컨트롤러 — 흐름(입장/잠금/타이머/버튼/스탯)만 담당한다.
   실제 그리기·조작은 fold-editor-3d.mjs가 만든 편집기가 맡고,
   attachEditor로 연결된다. 이 파일은 Three.js를 알지 못한다. */
(function (root) {
  'use strict';

  const api = root.paperFoldModel;
  let model;
  let active = false;
  let locked = false;
  let ends = 0;
  let timed = true;
  let frame = 0;
  let onComplete = null;
  let completionSent = false;
  let roomProgress = null;
  let previousProfile = null;
  let onModelChange = null;
  let editor = null;
  let editorFailed = false;

  const $ = id => document.getElementById(id);

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
      : editorFailed
        ? `3D 편집기를 열 수 없어요 — 기본 비행기 프리셋을 사용해 주세요${peers}`
        : (timed
          ? `${count}/10번 접음 · 선을 긋고 접을 쪽을 잡아 당기세요${peers}`
          : `${count}/10번 접음 · 완성 버튼을 누르면 바로 출격합니다${peers}`);
    $('fold-undo-btn').disabled = locked || !count;
    renderStats();
  }

  /* rAF 루프는 타이머 표시(timed 전용)만 남았다 — 그리기는 편집기 몫. */
  function render() {
    if (!active) { frame = 0; return; }
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
    editor?.setInteractive(false);
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
    timed = options?.ends !== null && options?.ends !== undefined && Number.isFinite(Number(options.ends));
    ends = timed ? Number(options.ends) : 0;
    const initial = typeof options?.initialCommands === 'string' && options.initialCommands !== '[]'
      ? api.replayFoldCommands(options.initialCommands)
      : null;
    model = initial || api.createPaperModel();
    $('fold-timer').classList.toggle('hide', !timed);
    locked = false;
    completionSent = false;
    roomProgress = null;
    previousProfile = null;
    onComplete = typeof options?.onComplete === 'function' ? options.onComplete : null;
    active = true;
    $('folding-screen').classList.remove('hide');
    $('fold-complete-btn').disabled = false;
    $('fold-preset-btn').disabled = false;
    $('fold-complete-btn').textContent = '비행기 완성';
    editorFailed = false;
    if (editor) {
      editor.setModel(model);
      editor.setInteractive(true);
      editorFailed = editor.start() === false; // WebGL 실패 시 프리셋만 사용
    }
    updateStats();
    emitModelChange(model);
    if (!frame) frame = requestAnimationFrame(render);
  }

  function leave() {
    active = false;
    editor?.stop();
    $('folding-screen')?.classList.add('hide');
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    emitModelChange(null);
  }

  function attachEditor(nextEditor) {
    editor = nextEditor || null;
  }

  /* 편집기의 onCommitFold — 실제 모델 갱신은 여기서만 일어난다. */
  function handleFoldCommit(start, end, angle) {
    if (!active || locked || !model) return;
    const next = api.applyFold(model, start, end, angle);
    if (next === model) {
      $('fold-status').textContent = '이 선으로는 접을 수 없어요 — 접힌 날개를 가로지르지 않게 그어 주세요';
      return;
    }
    model = next;
    updateStats();
    editor?.setModel(model);
    emitModelChange(model);
  }

  /* 편집기의 onAdjustHinge — 확정된 접는선(힌지)의 각도를 다시 정한다. */
  function handleHingeAdjust(foldIndex, angle) {
    if (!active || locked || !model) return;
    const next = api.setFoldAngle(model, foldIndex, angle);
    if (next === model) {
      $('fold-status').textContent = '힌지를 조절할 수 없어요';
      return;
    }
    model = next;
    updateStats();
    editor?.setModel(model);
    emitModelChange(model);
  }

  /* 편집기의 onCancel — 거부 문구가 남아 있으면 기본 상태 문구로 되돌린다. */
  function handleFoldCancel() {
    if (!active || locked) return;
    updateStats();
  }

  function init() {
    if (!api) return;
    $('fold-preset-btn').addEventListener('click', () => {
      if (locked) return;
      const preset = api.createPresetModel('dart');
      if (!preset) {
        $('fold-status').textContent = '기본 비행기 프리셋을 불러오지 못했습니다';
        return;
      }
      model = preset;
      updateStats();
      editor?.setModel(model);
      emitModelChange(model);
    });
    $('fold-undo-btn').addEventListener('click', () => {
      if (locked) return;
      model = api.undoFold(model);
      updateStats();
      editor?.setModel(model);
      emitModelChange(model);
    });
    $('fold-complete-btn').addEventListener('click', () => lock());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  root.paperFoldingStage = {
    enter,
    leave,
    attachEditor,
    handleFoldCommit,
    handleFoldCancel,
    handleHingeAdjust,
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
