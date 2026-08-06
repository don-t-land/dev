# 종이접기 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 접기 화면에 원클릭 "기본 비행기" 프리셋, 실시간 비행 스탯 패널, 접은 결과 3D 미리보기를 추가한다.

**Architecture:** 프리셋은 기존 접기 커맨드 배열로 정의해 `replayFoldCommands`로 재생하므로 서버 변경이 없다. 스탯 행 계산은 순수 모듈 `fold-stats-view.js`로 분리해 node 테스트하고, DOM 갱신은 `paper-fold-ui.js`가 담당한다. 3D 미리보기는 `paperFoldingStage`의 `onModelChange` 훅을 통해 index.html 모듈이 게임과 동일한 `makeFoldedCraftVisual` 빌더로 렌더한다.

**Tech Stack:** Vanilla JS (IIFE + UMD 패턴), Three.js 0.184 (CDN importmap), `node --test`

## Global Constraints

- Node.js >=22 <25, 테스트는 `npm test` (`node --test`)
- 접기 모델 규칙 불변: MAX_FOLDS 10, 직렬화 4096자 제한, `replayFoldCommands` 검증 통과 필수
- `paper-fold-ui.js`·`fold-stats-view.js`는 Three.js에 의존하지 않는다
- 서버(`server.js`) 및 `fold_done` 프로토콜 변경 금지
- UI 문구는 한국어, 기존 `fold-btn` 스타일 클래스 재사용
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## 사전 검증된 프리셋 데이터 (실측 완료)

아래 5개 커맨드는 현재 코드로 리플레이 검증 완료. 산출 프로필: lift=0.699, drag=0.951, stall=14.35, stability=1.109, rollBias=0, pitchBias=0.0156, 직렬화 222자.

```js
[
  { start: [0, 1], end: [1, 0], direction: 1 },       // 우상단 코너 → 중심
  { start: [-1, 0], end: [0, 1], direction: 1 },      // 좌상단 코너 → 중심
  { start: [0, 1], end: [1, -1], direction: 1 },      // 우측 사선 플랩 접기
  { start: [-1, -1], end: [0, 1], direction: 1 },     // 좌측 사선 플랩 접기
  { start: [1, -0.7], end: [-1, -0.7], direction: 1 } // 꼬리 접어올리기 (피치 중립화)
]
```

---

### Task 1: 프리셋 데이터와 모델 API

**Files:**
- Modify: `public/paper-fold-model.js` (파일 끝 return 직전에 프리셋 추가, return 객체 확장)
- Test: `test/paper-fold-preset.test.js` (신규)

**Interfaces:**
- Produces: `paperFoldModel.createPresetModel(name) → model|null`, `paperFoldModel.getPresetCommands(name) → command[]|null`, `paperFoldModel.presetNames → string[]`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/paper-fold-preset.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  createPresetModel,
  getPresetCommands,
  presetNames,
  undoFold,
  serializeFoldCommands
} = require('../public/paper-fold-model.js');
const { deriveAerodynamicProfile } = require('../public/paper-aero-profile.js');

test('dart 프리셋이 리플레이 검증을 통과한 모델을 만든다', () => {
  const model = createPresetModel('dart');
  assert.ok(model, 'preset replay must succeed');
  assert.strictEqual(model.commands.length, 5);
  assert.ok(serializeFoldCommands(model).length <= 4096);
  assert.ok(presetNames.includes('dart'));
});

test('dart 프리셋은 균형 잡힌 비행 프로필을 만든다', () => {
  const profile = deriveAerodynamicProfile(createPresetModel('dart'));
  assert.ok(profile.liftScale >= 0.65, `liftScale ${profile.liftScale}`);
  assert.ok(Math.abs(profile.rollBias) <= 0.01, `rollBias ${profile.rollBias}`);
  assert.ok(Math.abs(profile.pitchBias) <= 0.1, `pitchBias ${profile.pitchBias}`);
  assert.ok(profile.stability >= 1.0, `stability ${profile.stability}`);
});

test('dart 프리셋은 한 단계씩 되돌릴 수 있다', () => {
  let model = createPresetModel('dart');
  for (let remaining = 5; remaining > 0; remaining -= 1) {
    assert.strictEqual(model.commands.length, remaining);
    model = undoFold(model);
  }
  assert.strictEqual(model.commands.length, 0);
  assert.strictEqual(model.faces.length, 1);
});

test('getPresetCommands는 방어적 복사본을 준다', () => {
  const first = getPresetCommands('dart');
  first[0].start[0] = 99;
  const second = getPresetCommands('dart');
  assert.strictEqual(second[0].start[0], 0);
});

test('없는 프리셋 이름은 null을 돌려준다', () => {
  assert.strictEqual(createPresetModel('nope'), null);
  assert.strictEqual(getPresetCommands('nope'), null);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test test/paper-fold-preset.test.js`
Expected: FAIL — `createPresetModel is not a function`

- [ ] **Step 3: 최소 구현** — `public/paper-fold-model.js`의 `return { ... }` 직전에 추가:

```js
  const PRESETS = {
    dart: [
      { start: [0, 1], end: [1, 0], direction: 1 },
      { start: [-1, 0], end: [0, 1], direction: 1 },
      { start: [0, 1], end: [1, -1], direction: 1 },
      { start: [-1, -1], end: [0, 1], direction: 1 },
      { start: [1, -0.7], end: [-1, -0.7], direction: 1 }
    ]
  };

  function getPresetCommands(name) {
    const commands = PRESETS[name];
    return commands ? commands.map(cloneCommand) : null;
  }

  function createPresetModel(name) {
    const commands = PRESETS[name];
    return commands ? replayFoldCommands(commands) : null;
  }
```

return 객체를 다음으로 확장:

```js
  return {
    createPaperModel,
    applyFold,
    undoFold,
    serializeFoldCommands,
    replayFoldCommands,
    getPresetCommands,
    createPresetModel,
    presetNames: Object.keys(PRESETS)
  };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 신규 5개 포함 전체 PASS (기존 테스트 회귀 없음)

- [ ] **Step 5: 커밋**

```bash
git add public/paper-fold-model.js test/paper-fold-preset.test.js
git commit -m "feat: add classic dart fold preset to paper fold model"
```

---

### Task 2: "기본 비행기" 프리셋 버튼

**Files:**
- Modify: `public/index.html:585-588` (fold-controls 우측 버튼 그룹)
- Modify: `public/paper-fold-ui.js` (`init()`에 핸들러, `enter()`/`lock()`에 활성화 상태)

**Interfaces:**
- Consumes: `api.createPresetModel('dart')` (Task 1)
- Produces: `#fold-preset-btn` 클릭 → `model` 교체 + `updateStats()` 호출 (Task 3·4가 이 갱신 경로에 올라탐)

- [ ] **Step 1: 버튼 마크업 추가** — `public/index.html`의 `<button id="fold-undo-btn" ...>` 바로 앞에:

```html
      <button id="fold-preset-btn" class="fold-btn" type="button">기본 비행기</button>
```

- [ ] **Step 2: 핸들러와 상태 연결** — `public/paper-fold-ui.js`:

`init()`의 `$('fold-undo-btn').addEventListener(...)` 앞에 추가:

```js
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
    });
```

`enter()`의 `$('fold-complete-btn').disabled = false;` 다음 줄에:

```js
    $('fold-preset-btn').disabled = false;
```

`lock()`의 `$('fold-complete-btn').disabled = true;` 다음 줄에:

```js
    $('fold-preset-btn').disabled = true;
```

- [ ] **Step 3: 정적 검증**

Run: `node --check public/paper-fold-ui.js && npm test`
Expected: 문법 오류 없음, 전체 테스트 PASS (동작은 Task 5에서 브라우저로 확인)

- [ ] **Step 4: 커밋**

```bash
git add public/index.html public/paper-fold-ui.js
git commit -m "feat: add one-click dart preset button to folding screen"
```

---

### Task 3: 실시간 비행 스탯 패널

**Files:**
- Create: `public/fold-stats-view.js` (순수 로직: 프로필 → 표시 행)
- Test: `test/fold-stats-view.test.js` (신규)
- Modify: `public/index.html` (스탯 패널 마크업 + 스크립트 로드), `public/multiplayer-flow.css` (스타일), `public/paper-fold-ui.js` (렌더 호출)

**Interfaces:**
- Consumes: `PaperAeroProfile.deriveAerodynamicProfile(model)` (기존)
- Produces: `foldStatsView.buildStatsRows(profile, previousProfile) → [{ key, label, percent, text, delta, good }]` — `percent`는 0~100 정수, `delta`는 `'up'|'down'|'same'`, `good`은 게이지 색 결정용 boolean

- [ ] **Step 1: 실패하는 테스트 작성** — `test/fold-stats-view.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildStatsRows } = require('../public/fold-stats-view.js');
const { createPaperModel, createPresetModel } = require('../public/paper-fold-model.js');
const { deriveAerodynamicProfile } = require('../public/paper-aero-profile.js');

const flatProfile = deriveAerodynamicProfile(createPaperModel());
const dartProfile = deriveAerodynamicProfile(createPresetModel('dart'));

test('다섯 개 스탯 행을 순서대로 만든다', () => {
  const rows = buildStatsRows(flatProfile, null);
  assert.deepStrictEqual(
    rows.map(row => row.key),
    ['liftScale', 'dragScale', 'stability', 'stallSpeed', 'rollBias']
  );
  rows.forEach(row => {
    assert.ok(Number.isInteger(row.percent) && row.percent >= 0 && row.percent <= 100);
    assert.strictEqual(typeof row.label, 'string');
    assert.strictEqual(typeof row.text, 'string');
    assert.strictEqual(row.delta, 'same');
    assert.strictEqual(typeof row.good, 'boolean');
  });
});

test('직전 프로필 대비 증감을 표시한다', () => {
  const rows = buildStatsRows(dartProfile, flatProfile);
  const byKey = Object.fromEntries(rows.map(row => [row.key, row]));
  assert.strictEqual(byKey.liftScale.delta, dartProfile.liftScale > flatProfile.liftScale ? 'up' : 'down');
  assert.strictEqual(byKey.dragScale.delta, dartProfile.dragScale > flatProfile.dragScale ? 'up' : 'down');
});

test('rollBias는 균형/좌/우 문구로 표시한다', () => {
  const balanced = buildStatsRows(dartProfile, null).find(row => row.key === 'rollBias');
  assert.strictEqual(balanced.text, '균형');
  assert.strictEqual(balanced.good, true);
  const tilted = buildStatsRows({ ...dartProfile, rollBias: -0.3 }, null).find(row => row.key === 'rollBias');
  assert.ok(tilted.text.startsWith('좌'));
  assert.strictEqual(tilted.good, false);
});

test('프로필이 없으면 빈 배열', () => {
  assert.deepStrictEqual(buildStatsRows(null, null), []);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test test/fold-stats-view.test.js`
Expected: FAIL — `Cannot find module '../public/fold-stats-view.js'`

- [ ] **Step 3: 구현** — `public/fold-stats-view.js` (UMD 패턴은 `paper-fold-model.js`와 동일):

```js
(function exposeFoldStatsView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.foldStatsView = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const DELTA_EPSILON = 1e-6;
  const ROLL_BALANCED = 0.05;

  const ROWS = [
    { key: 'liftScale', label: '양력', min: 0.15, max: 1.8, goodWhen: 'high' },
    { key: 'dragScale', label: '항력', min: 0.25, max: 2.2, goodWhen: 'low' },
    { key: 'stability', label: '안정성', min: 0.2, max: 1.25, goodWhen: 'high' },
    { key: 'stallSpeed', label: '실속속도', min: 8, max: 42, goodWhen: 'low' },
    { key: 'rollBias', label: '좌우균형', min: -0.65, max: 0.65, goodWhen: 'center' }
  ];

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function rowText(row, value) {
    if (row.key === 'rollBias') {
      if (Math.abs(value) <= ROLL_BALANCED) return '균형';
      const side = value < 0 ? '좌' : '우';
      return `${side} ${Math.round(Math.abs(value) / row.max * 100)}%`;
    }
    if (row.key === 'stallSpeed') return `${Math.round(value)} m/s`;
    return `${Math.round(value * 100)}%`;
  }

  function buildStatsRows(profile, previousProfile) {
    if (!profile) return [];
    return ROWS.map(row => {
      const value = Number(profile[row.key]) || 0;
      const ratio = clamp01((value - row.min) / (row.max - row.min));
      const previous = previousProfile ? Number(previousProfile[row.key]) || 0 : null;
      const delta = previous === null || Math.abs(value - previous) < DELTA_EPSILON
        ? 'same'
        : value > previous ? 'up' : 'down';
      const good = row.goodWhen === 'center'
        ? Math.abs(value) <= ROLL_BALANCED
        : row.goodWhen === 'high' ? ratio >= 0.4 : ratio <= 0.6;
      return {
        key: row.key,
        label: row.label,
        percent: Math.round(ratio * 100),
        text: rowText(row, value),
        delta,
        good
      };
    });
  }

  return { buildStatsRows };
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 전체 PASS

- [ ] **Step 5: 패널 마크업·스타일·렌더 연결**

`public/index.html`의 `<div class="fold-hint">...</div>` 다음 줄(fold-stage 내부)에:

```html
    <aside class="fold-side">
      <div id="fold-stats" class="fold-stats" aria-live="polite"></div>
      <canvas id="fold-preview-canvas" class="fold-preview" aria-label="접은 비행기 미리보기"></canvas>
    </aside>
```

`public/index.html:604`의 `paper-aero-profile.js` 스크립트 태그 다음 줄에:

```html
<script src="./fold-stats-view.js"></script>
```

`public/multiplayer-flow.css`의 fold 섹션 끝에:

```css
.fold-side { position:absolute; top:14px; right:14px; width:min(236px,36vw); display:flex; flex-direction:column; gap:10px; z-index:2; }
.fold-stats { background:rgba(9,14,38,.74); border:1px solid rgba(134,220,245,.22); border-radius:14px; padding:10px 12px; backdrop-filter:blur(4px); }
.fold-stats .fold-stat-row { display:grid; grid-template-columns:56px 1fr 58px 14px; align-items:center; gap:7px; margin:5px 0; font-size:11px; color:#cfe6f4; }
.fold-stats .fold-stat-bar { height:6px; border-radius:3px; background:rgba(255,255,255,.12); overflow:hidden; }
.fold-stats .fold-stat-bar i { display:block; height:100%; background:#ff9d92; transition:width .25s; }
.fold-stats .fold-stat-row.good .fold-stat-bar i { background:#69e3b6; }
.fold-stats .fold-stat-delta { text-align:center; color:#9fb4cc; }
.fold-stats .fold-stat-value { text-align:right; font-variant-numeric:tabular-nums; }
.fold-preview { width:100%; aspect-ratio:1/1; border-radius:14px; border:1px solid rgba(134,220,245,.22); background:radial-gradient(circle at 50% 42%,rgba(102,210,238,.14),rgba(9,14,38,.6) 70%); }
@media (max-width:760px) { .fold-side { width:min(200px,44vw); } }
```

`public/paper-fold-ui.js` — 상단 상태 변수에 `let previousProfile = null;` 추가, `updateStats()` 끝에 `renderStats();` 호출을 추가하고 아래 함수를 `updateStats` 앞에 정의:

```js
  function renderStats() {
    const host = $('fold-stats');
    const aero = root.PaperAeroProfile;
    const view = root.foldStatsView;
    if (!host || !aero || !view || !model) return;
    const profile = aero.deriveAerodynamicProfile(model);
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
```

`enter()`에서 `roomProgress = null;` 다음 줄에 `previousProfile = null;` 추가.

- [ ] **Step 6: 정적 검증**

Run: `node --check public/paper-fold-ui.js && node --check public/fold-stats-view.js && npm test`
Expected: 전체 PASS

- [ ] **Step 7: 커밋**

```bash
git add public/fold-stats-view.js test/fold-stats-view.test.js public/index.html public/multiplayer-flow.css public/paper-fold-ui.js
git commit -m "feat: show live aerodynamic stats while folding"
```

---

### Task 4: onModelChange 훅과 3D 미리보기

**Files:**
- Modify: `public/paper-fold-ui.js` (훅 등록·발행)
- Modify: `public/index.html` (모듈 스크립트에 미리보기 렌더러, `makeFoldedCraftVisual` 재사용)

**Interfaces:**
- Consumes: Task 3의 `#fold-preview-canvas`, 기존 `makeFoldedCraftVisual(model, tint)` / `disposeObject3D(object)` (index.html 모듈 스코프)
- Produces: `paperFoldingStage.setOnModelChange(fn)` — 접기 화면 진입·접기·펴기·프리셋 때 `fn(model)`, 화면 이탈 때 `fn(null)` 호출

- [ ] **Step 1: 훅 추가** — `public/paper-fold-ui.js`:

상단 상태 변수에 추가:

```js
  let onModelChange = null;
```

`renderStats` 함수 앞에:

```js
  function emitModelChange(value) {
    if (typeof onModelChange === 'function') onModelChange(value);
  }
```

호출 지점 4곳:
- `enter()` 끝(`if (!frame) ...` 앞)에 `emitModelChange(model);`
- `leave()` 끝에 `emitModelChange(null);`
- `pointerup` 핸들러에서 `model = next; updateStats();` 다음에 `emitModelChange(model);`
- undo 핸들러에서 `model = api.undoFold(model); updateStats();` 다음에 `emitModelChange(model);`
- Task 2의 프리셋 핸들러에서 `updateStats();` 다음에 `emitModelChange(model);`

`root.paperFoldingStage = { ... }` 객체에 추가:

```js
    setOnModelChange(fn) {
      onModelChange = typeof fn === 'function' ? fn : null;
    },
```

- [ ] **Step 2: 미리보기 렌더러** — `public/index.html` 모듈 스크립트의 `setFoldedCraftVisual` 함수 정의 다음에 추가:

```js
/* ---- 접기 화면 3D 미리보기: 게임과 동일한 빌더로 접은 기체를 회전 표시 ---- */
const foldPreview = (() => {
  const previewCanvas = document.getElementById('fold-preview-canvas');
  if (!previewCanvas) return null;
  let previewRenderer = null;
  let previewScene = null;
  let previewCamera = null;
  let previewGroup = null;
  let previewFrame = 0;

  function ensureRenderer() {
    if (previewRenderer) return true;
    try {
      previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
    } catch {
      previewCanvas.style.display = 'none';
      return false;
    }
    previewScene = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    previewCamera.position.set(0, 2.4, 4.6);
    previewCamera.lookAt(0, 0, 0);
    previewScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const previewSun = new THREE.DirectionalLight(0xffffff, 1.15);
    previewSun.position.set(3, 5, 2);
    previewScene.add(previewSun);
    previewGroup = new THREE.Group();
    previewScene.add(previewGroup);
    return true;
  }

  function makeFlatPaperVisual() {
    const flat = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 2.7),
      new THREE.MeshStandardMaterial({ color: 0xfdfcf7, roughness: 0.75, side: THREE.DoubleSide })
    );
    flat.rotation.x = -Math.PI / 2;
    return flat;
  }

  function tick() {
    if (!previewRenderer) { previewFrame = 0; return; }
    const width = previewCanvas.clientWidth || 1;
    const height = previewCanvas.clientHeight || 1;
    if (previewCanvas.width !== width || previewCanvas.height !== height) {
      previewRenderer.setSize(width, height, false);
      previewCamera.aspect = width / height;
      previewCamera.updateProjectionMatrix();
    }
    previewGroup.rotation.y += 0.008;
    previewRenderer.render(previewScene, previewCamera);
    previewFrame = requestAnimationFrame(tick);
  }

  function setModel(foldModel) {
    if (foldModel === null) {
      if (previewFrame) cancelAnimationFrame(previewFrame);
      previewFrame = 0;
      return;
    }
    if (!ensureRenderer()) return;
    while (previewGroup.children.length) {
      const child = previewGroup.children[0];
      previewGroup.remove(child);
      disposeObject3D(child);
    }
    previewGroup.add(makeFoldedCraftVisual(foldModel) || makeFlatPaperVisual());
    if (!previewFrame) previewFrame = requestAnimationFrame(tick);
  }

  return { setModel };
})();
window.paperFoldingStage?.setOnModelChange(foldModel => foldPreview?.setModel(foldModel));
```

- [ ] **Step 3: 정적 검증**

Run: `node --check public/paper-fold-ui.js && npm test`
Expected: 전체 PASS (index.html 내 모듈은 Task 5에서 브라우저 검증)

- [ ] **Step 4: 커밋**

```bash
git add public/paper-fold-ui.js public/index.html
git commit -m "feat: add rotating 3D preview of the folded craft"
```

---

### Task 5: 브라우저 통합 검증

**Files:**
- 코드 변경 없음 (발견된 결함은 이 태스크에서 수정 후 커밋)

**Interfaces:**
- Consumes: Task 1~4 전체

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 전체 PASS

- [ ] **Step 2: 로컬 서버 기동**

Run: `npm start` (백그라운드) → `curl -s http://localhost:3000/healthz` 로 준비 확인
Expected: healthz 200 응답

- [ ] **Step 3: Playwright로 접기 화면 진입**

브라우저에서 `http://localhost:3000` 접속 → 닉네임 입력 → ARENA(오래 날기) 방 생성 → 라운드 시작 → 접기 화면 표시 확인.

- [ ] **Step 4: 기능 확인**

1. 스탯 패널에 5개 행(양력·항력·안정성·실속속도·좌우균형)이 보이는가
2. "기본 비행기" 클릭 → 상태가 "5/10번 접음"으로 바뀌고 스탯에 ▲▼ 증감이 표시되는가
3. 3D 미리보기에 접힌 다트가 회전하며 보이는가 (프리셋 전에는 평평한 종이)
4. "한 번 펴기" 클릭 → 4/10으로 줄고 미리보기·스탯이 갱신되는가
5. 캔버스에 직접 선을 그어 접기 → 미리보기·스탯 동시 갱신 확인
6. 스크린샷 저장

- [ ] **Step 5: 발견된 결함 수정 후 최종 커밋 (결함 없으면 생략)**

```bash
git add -A && git commit -m "fix: polish folding screen preview and stats"
```
