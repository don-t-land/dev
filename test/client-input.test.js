const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const projectRoot = path.join(__dirname, '..');

test('flight keys remain editable inside nickname inputs', () => {
  const { shouldCaptureGameKey, isEditableTarget } = require('../public/input-policy.js');
  const input = { tagName: 'INPUT', isContentEditable: false };

  assert.equal(isEditableTarget(input), true);

  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight']) {
    assert.equal(shouldCaptureGameKey({ code, target: input }), false, `${code} should reach the input`);
  }
});

test('game controls are still captured outside editable fields', () => {
  const { shouldCaptureGameKey } = require('../public/input-policy.js');
  const canvas = { tagName: 'CANVAS', isContentEditable: false };

  assert.equal(shouldCaptureGameKey({ code: 'KeyW', target: canvas }), true);
  assert.equal(shouldCaptureGameKey({ code: 'ShiftLeft', target: canvas }), true);
  assert.equal(shouldCaptureGameKey({ code: 'Escape', target: canvas }), false);
});

test('the client keyboard handler uses the editable-target policy', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /<script\s+src=['"]\.\/input-policy\.js['"]><\/script>/);
  assert.match(html, /if\s*\(!shouldCaptureGameKey\(e\)\)\s*return/);
});

test('dash and darts share one energy HUD instead of rechargeable ammo pips', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /id="energy"/);
  assert.match(html, /keys\.ShiftLeft\s*\|\|\s*keys\.ShiftRight/);
  assert.match(html, /consumeDartEnergy\(me\.energy\)/);
  assert.match(html, /speedFov\(me\.speed/);
  assert.doesNotMatch(html, /id="ammo"|me\.ammo|me\.ammoT/);
});

test('room snapshots preserve active, crashed, and spectator roles', () => {
  const { getLocalRoundRole } = require('../public/room-state.js');
  const room = {
    order: ['active', 'crashed'],
    players: [
      { id: 'active', alive: true },
      { id: 'crashed', alive: false },
      { id: 'late', alive: false }
    ]
  };

  assert.equal(getLocalRoundRole(room, 'active'), 'active');
  assert.equal(getLocalRoundRole(room, 'crashed'), 'crashed');
  assert.equal(getLocalRoundRole(room, 'late'), 'spectator');
  assert.equal(getLocalRoundRole(room, 'missing'), 'spectator');
});

test('result visibility is limited to unacknowledged round participants', () => {
  const { shouldShowResults } = require('../public/room-state.js');
  const room = { phase: 'results', order: ['active', 'ready'], readyIds: ['ready'] };

  assert.equal(shouldShowResults(room, 'active'), true);
  assert.equal(shouldShowResults(room, 'ready'), false);
  assert.equal(shouldShowResults(room, 'late-spectator'), false);
  assert.equal(shouldShowResults({ ...room, phase: 'playing' }, 'active'), false);
});

test('the lobby exposes public rooms and room-code actions', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /id="room-list"/);
  assert.match(html, /id="room-code"/);
  assert.match(html, /id="join-code-btn"/);
  assert.match(html, /data-create-mode="DIST"/);
  assert.match(html, /data-create-mode="ARENA"/);
});

test('the client loads free-flight controls and exposes the ESC settings menu', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /<script\s+src=['"]\.\/flight-controls\.js['"]><\/script>/);
  assert.match(html, /id="pause-menu"/);
  assert.match(html, /id="resume-btn"/);
  assert.match(html, /id="pause-leave-btn"/);
  assert.match(html, /id="key-guide-toggle"/);
  assert.match(html, /requestPointerLock\(/);
  assert.match(html, /movementX/);
  assert.doesNotMatch(html, /const DIST_HALF = 155, DIST_LEN = 7500, YAW_LIMIT/);
});

test('pause and result overlays isolate focus and suspend flight input', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /function clearFlightKeys\(/);
  assert.match(html, /addEventListener\(['"]blur['"],\s*clearFlightKeys\)/);
  assert.match(html, /visibilitychange/);
  assert.match(html, /function hideResults\([\s\S]*resultsReturnFocus\s*!==\s*document\.body/);
  assert.match(html, /function trapModalFocus\(/);
  assert.match(html, /id="results"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="r-title"/);
  assert.match(html, /if\s*\(pauseOpen\)\s*return/);
});

test('result and mobile HUD layouts remain scrollable without overlap', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /#results\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(html, /#results \.box\s*\{[^}]*max-height:\s*calc\(100dvh/s);
  assert.match(html, /\.modal-layer\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(html, /\.modal-card\s*\{[^}]*max-height:\s*calc\(100dvh/s);
  assert.match(html, /@media\s*\(max-width:\s*560px\)[\s\S]*#keys\s*\{[^}]*bottom:\s*164px/s);
  assert.match(html, /@media\s*\(max-width:\s*560px\)[\s\S]*#board\s*\{[^}]*top:\s*128px/s);
  assert.match(html, /@media\s*\(max-width:\s*560px\)\s*and\s*\(max-height:\s*400px\)[\s\S]*#keys\s*\{[^}]*display:\s*none/s);
  assert.match(html, /--sky-muted:\s*#5b6d80/);
});

test('the results screen requires an explicit per-player waiting-room acknowledgement', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /id="results-ready-btn"/);
  assert.match(html, /send\(\{\s*t:\s*['"]results-ready['"]\s*\}\)/);
  assert.match(html, /readyIds/);
});

test('the main lobby includes a bright animated flight scene and structured actions', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /id="lobby-flight-scene"/);
  assert.match(html, /class="lobby-shell"/);
  assert.match(html, /class="lobby-primary"/);
  assert.match(html, /class="lobby-browser"/);
});

test('the client implements room lifecycle and authoritative leaderboard messages', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /case ['"]rooms['"]/);
  assert.match(html, /case ['"]leaderboard['"]/);
  assert.match(html, /case ['"]error['"]/);
  assert.match(html, /send\(\{\s*t:\s*['"]create['"]/);
  assert.match(html, /send\(\{\s*t:\s*['"]join['"],\s*code/);
  assert.match(html, /send\(\{\s*t:\s*['"]start['"]/);
  assert.match(html, /send\(\{\s*t:\s*['"]leave['"]/);
  assert.match(html, /id="game-leave-btn"/);
});

test('the first screen is a modular paper-plane home screen with two flight modes and a costume action', () => {
  const homeScreen = require('../public/home-screen.js');
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.deepEqual(homeScreen.homeModes, [
    { id: 'distance', label: '멀리 날기', description: '끝없이 펼쳐진 하늘을 향해' },
    { id: 'survival', label: '오래 날기', description: '구름 위에서 가장 오래 버티기' }
  ]);
  assert.match(html, /<link rel="stylesheet" href="\.\/home-screen\.css">/);
  assert.match(html, /id="home-screen"/);
  assert.match(html, /data-home-mode="DIST"/);
  assert.match(html, /data-home-mode="ARENA"/);
  assert.match(html, /data-home-action="costume"/);
  assert.match(html, /class="home-vertical-plane"/);
  assert.match(html, /<script src="\.\/home-screen\.js"><\/script>/);
});

test('the home screen keeps all three menu rows usable on a short mobile viewport', () => {
  const css = fs.readFileSync(path.join(projectRoot, 'public/home-screen.css'), 'utf8');

  assert.match(css, /@media \(max-width: 780px\) and \(max-height: 720px\)/);
  assert.match(css, /@media \(max-width: 780px\) and \(max-height: 720px\)[\s\S]*?\.home-mode-grid \{ grid-template-columns: 1fr;/);
  assert.match(css, /@media \(max-width: 780px\) and \(max-height: 720px\)[\s\S]*?\.home-mode-card \{ min-height: 64px;/);
});

test('the home screen preserves an accessible faceless paper-plane fallback while the WebGL mascot loads', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'public/home-screen.css'), 'utf8');

  assert.match(html, /id="home-title"[^>]*>Don['’]t <span>Land<\/span>/);
  assert.doesNotMatch(html, /home-plane-(eye|smile)/);
  assert.match(html, /home-plane-fallback/);
  assert.match(html, /id="home-plane-canvas"/);
  assert.match(css, /\.home-wordmark/);
  assert.match(css, /perspective:/);
});

test('the short mobile layout reserves a visible stage for the animated mascot', () => {
  const css = fs.readFileSync(path.join(projectRoot, 'public/home-screen.css'), 'utf8');

  assert.match(css, /@media \(max-width: 780px\) and \(max-height: 720px\)[\s\S]*?\.home-plane-stage \{[^}]*top: 9%;[^}]*height: 37vh;/);
});

test('the mascot uses an unmistakable folded paper-plane silhouette instead of an aircraft fuselage', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
  assert.match(html, /<svg class="home-vertical-plane"/);
  assert.match(html, /points="185,14 356,508 185,412 14,508"/);
  assert.doesNotMatch(html, /home-plane-(body|nose|wing)/);
});

test('the home screen composes an original 3D map menu with a vertical paper-plane hero and Korean web-font fallback', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'public', 'home-screen.css'), 'utf8');
  assert.match(html, /class="home-map"/);
  assert.match(html, /class="home-vertical-plane"/);
  assert.match(html, /class="home-map-grid"/);
  assert.match(css, /font-family:\s*"Noto Sans KR"/);
  assert.match(css, /\.home-map-grid[\s\S]*rotateX\(/);
  assert.match(css, /\.home-vertical-plane[\s\S]*rotateY\(/);
});

test('the refined hero keeps Dont Land as one enlarged line and delegates the standing mascot to WebGL', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'public', 'home-screen.css'), 'utf8');
  const mascot = fs.readFileSync(path.join(projectRoot, 'public', 'home-plane-3d.js'), 'utf8');

  assert.doesNotMatch(html, /PAPER WING CLUB/);
  assert.doesNotMatch(html, /구름과 절벽 사이/);
  assert.match(html, /id="home-plane-canvas"/);
  assert.match(html, /<script type="module" src="\.\/home-plane-3d\.js"><\/script>/);
  assert.match(css, /\.home-wordmark[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /\.home-wordmark[\s\S]*font-size:\s*clamp\(104px, 11\.5vw, 176px\)/);
  assert.match(css, /\.home-content[\s\S]*padding:\s*clamp\(128px, 16vh, 178px\)/);
  assert.match(css, /\.home-actions\s*\{[^}]*width:\s*min\(100%, 620px\)/);
  assert.match(mascot, /new THREE\.WebGLRenderer/);
  assert.match(mascot, /function makeStandingPlaneMascot/);
  assert.match(mascot, /requestAnimationFrame\(render\)/);
});

test('the standing 3D mascot uses articulated legs, modeled shoes, and a weight-shifting idle animation', () => {
  const mascot = fs.readFileSync(path.join(projectRoot, 'public', 'home-plane-3d.js'), 'utf8');

  assert.match(mascot, /function makeLeg\(/);
  assert.match(mascot, /function makeShoe\(/);
  assert.match(mascot, /THREE\.CapsuleGeometry/);
  assert.match(mascot, /left\.knee\.rotation\.x/);
  assert.match(mascot, /right\.shoe\.rotation\.x/);
  assert.match(mascot, /pointerX \* \.16/);
});

test('the mascot has no hanging center keel or dangling underside panels between its legs', () => {
  const mascot = fs.readFileSync(path.join(projectRoot, 'public', 'home-plane-3d.js'), 'utf8');

  assert.doesNotMatch(mascot, /const keel\s*=/);
  assert.doesNotMatch(mascot, /makeFacet\(\[nose, center, keel\]/);
  assert.doesNotMatch(mascot, /navy: new THREE\.MeshStandardMaterial/);
  assert.doesNotMatch(mascot, /makeFacet\(\[\[0, 3\.31, -\.35\]/);
  assert.match(mascot, /hip\.position\.set\(side \* \.51, -1\.12, \.34\)/);
});

test('the home map does not place a decorative tower cluster behind the mascot legs', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');

  assert.doesNotMatch(html, /home-map-island-one/);
  assert.match(html, /home-map-island-two/);
});

test('the menu uses three long single-line rows with only an icon, label, and arrow', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'public', 'home-screen.css'), 'utf8');

  assert.match(html, /class="home-mode-label">멀리 날기<\/span>/);
  assert.match(html, /class="home-mode-label">오래 날기<\/span>/);
  assert.match(html, /class="home-mode-label">코스튬<\/span>/);
  assert.match(html, /data-home-action="costume"/);
  assert.doesNotMatch(html, /home-mode-(kicker|meta|cta|copy|bottom|scan)/);
  assert.match(css, /\.home-mode-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.home-mode-card\s*\{[^}]*grid-template-columns:\s*58px 1fr 34px/);
  assert.match(css, /\.home-mode-card\s*\{[^}]*min-height:\s*76px/);
});
