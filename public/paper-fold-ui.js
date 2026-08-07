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
  let selectedPreset = null;

  const $ = id => document.getElementById(id);

  function emitModelChange(value) {
    if (typeof onModelChange === 'function') onModelChange(value);
  }

  const DISPLAYED_STAT_FIELDS = ['liftScale', 'dragScale', 'stability', 'stallSpeed', 'rollBias'];

  /* 프리셋 목록(접기 화면 좌측) — WebGL 편집기가 죽어도 동작해야 하므로
     순수 DOM으로만 그린다. 프리셋 프로필은 정적이라 한 번만 계산해 둔다. */
  const presetStatsCache = {};

  function presetStatsLine(name) {
    if (name in presetStatsCache) return presetStatsCache[name];
    const aero = root.PaperAeroProfile;
    const preset = aero ? api.createPresetModel(name) : null;
    const profile = preset ? aero.deriveAerodynamicProfile(preset) : null;
    presetStatsCache[name] = profile
      ? `양력 ${Math.round(profile.liftScale * 100)}% · 실속 ${Math.round(profile.stallSpeed)}m/s`
      : '';
    return presetStatsCache[name];
  }

  function refreshPresetList() {
    const host = $('fold-preset-list');
    if (!host) return;
    host.querySelectorAll('.fold-preset-card').forEach(card => {
      card.classList.toggle('active', card.dataset.preset === selectedPreset);
      card.disabled = locked;
    });
  }

  function renderPresetList() {
    const host = $('fold-preset-list');
    if (!host) return;
    const info = api.PRESET_INFO || {};
    host.innerHTML = api.presetNames.map(name => {
      const meta = info[name] || { label: name, tagline: '' };
      const stats = presetStatsLine(name);
      return `<button type="button" class="fold-preset-card" data-preset="${name}">
        <span class="fold-preset-label">${meta.label}</span>
        <span class="fold-preset-tagline">${meta.tagline}</span>
        ${stats ? `<span class="fold-preset-stats">${stats}</span>` : ''}
      </button>`;
    }).join('');
    refreshPresetList();
  }

  function applyPreset(name) {
    if (!active || locked) return;
    const preset = api.createPresetModel(name);
    if (!preset) {
      $('fold-status').textContent = '비행기 프리셋을 불러오지 못했습니다';
      return;
    }
    model = preset;
    selectedPreset = name;
    refreshPresetList();
    updateStats();
    editor?.setModel(model);
    emitModelChange(model);
  }

  /* 손으로 접거나 펴면 더는 프리셋 그대로가 아니므로 하이라이트를 지운다. */
  function clearPresetSelection() {
    if (selectedPreset === null) return;
    selectedPreset = null;
    refreshPresetList();
  }

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
        ? `3D 편집기를 열 수 없어요 — 왼쪽 목록에서 비행기 프리셋을 골라 주세요${peers}`
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
    refreshPresetList();
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
    $('fold-complete-btn').textContent = '비행기 완성';
    selectedPreset = null;
    renderPresetList();
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
    clearPresetSelection();
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
    clearPresetSelection();
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
    $('fold-preset-list').addEventListener('click', event => {
      const card = event.target.closest('.fold-preset-card');
      if (card && !card.disabled) applyPreset(card.dataset.preset);
    });
    $('fold-undo-btn').addEventListener('click', () => {
      if (locked) return;
      model = api.undoFold(model);
      clearPresetSelection();
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
