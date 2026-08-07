const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const projectRoot = path.join(__dirname, '..');

test('WASD and Space remain editable inside nickname inputs', () => {
  const { shouldCaptureGameKey, isEditableTarget } = require('../public/input-policy.js');
  const input = { tagName: 'INPUT', isContentEditable: false };

  assert.equal(isEditableTarget(input), true);

  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) {
    assert.equal(shouldCaptureGameKey({ code, target: input }), false, `${code} should reach the input`);
  }
});

test('game controls are still captured outside editable fields', () => {
  const { shouldCaptureGameKey } = require('../public/input-policy.js');
  const canvas = { tagName: 'CANVAS', isContentEditable: false };

  assert.equal(shouldCaptureGameKey({ code: 'KeyW', target: canvas }), true);
  assert.equal(shouldCaptureGameKey({ code: 'Escape', target: canvas }), false);
});

test('the client keyboard handler uses the editable-target policy', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /<script\s+src=['"]\.\/input-policy\.js['"]><\/script>/);
  assert.match(html, /if\s*\(!shouldCaptureGameKey\(e\)\)\s*return/);
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

test('the ESC menu exposes persisted runtime graphics settings', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /<script\s+src=['"]\.\/graphics-settings\.js['"]><\/script>/);
  assert.match(html, /id="graphics-resolution"/);
  assert.match(html, /id="graphics-shadows"/);
  assert.match(html, /id="graphics-view-distance"/);
  assert.match(html, /localStorage\.setItem\(['"]pp_graphics['"]/);
  assert.match(html, /function applyGraphicsSettings\(/);
  assert.match(html, /select:not\(:disabled\)/);
});

test('high graphics defaults extend shadows and view distance across environment meshes', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /resolveGraphicsSettings\(/);
  assert.match(html, /renderer\.shadowMap\.type\s*=\s*THREE\.PCFShadowMap/);
  assert.match(html, /wallMesh\.castShadow\s*=\s*true/);
  assert.match(html, /wallMesh\.receiveShadow\s*=\s*true/);
  assert.match(html, /spireMesh\.receiveShadow\s*=\s*true/);
  assert.match(html, /rockMesh\.receiveShadow\s*=\s*true/);
});

test('pause and result overlays isolate focus and suspend flight input', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /function clearFlightKeys\(/);
  assert.match(html, /addEventListener\(['"]blur['"],\s*clearFlightKeys\)/);
  assert.match(html, /visibilitychange/);
  assert.match(html, /function hideResults\([\s\S]*resultsReturnFocus\s*!==\s*document\.body/);
  assert.match(html, /function trapModalFocus\(/);
  assert.match(html, /querySelector\(['"]\.modal-card['"]\)\.scrollTop\s*=\s*0/);
  assert.match(html, /\$\(['"]graphics-resolution['"]\)\.focus\(\)/);
  assert.match(html, /id="results"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="r-title"/);
  assert.match(html, /if\s*\(pauseOpen\)\s*return/);
});

test('result and mobile HUD layouts remain scrollable without overlap', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /#results\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(html, /#results \.box\s*\{[^}]*max-height:\s*calc\(100dvh/s);
  assert.match(html, /\.modal-layer\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(html, /\.modal-card\s*\{[^}]*max-height:\s*calc\(100dvh/s);
  assert.match(html, /@media\s*\(max-width:\s*560px\)[\s\S]*#keys\s*\{[^}]*bottom:\s*84px/s);
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
