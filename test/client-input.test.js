const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const projectRoot = path.join(__dirname, '..');
const packageJson = require('../package.json');

test('pointer lock never survives a blocking modal', () => {
  const { pointerLockAction } = require('../public/input-policy.js');

  assert.equal(pointerLockAction({ pointerLocked: true, gameplay: true, respawnOpen: true }), 'release');
  assert.equal(pointerLockAction({ pointerLocked: true, gameplay: true, resultsOpen: true }), 'release');
  assert.equal(pointerLockAction({ pointerLocked: true, gameplay: true, pauseOpen: true }), 'release');
  assert.equal(pointerLockAction({ pointerLocked: false, gameplay: true }), 'open-pause');
  assert.equal(pointerLockAction({ pointerLocked: false, gameplay: true, respawnOpen: true }), null);
  assert.equal(pointerLockAction({ pointerLocked: false, gameplay: false }), null);
});

test('pointerlockchange releases delayed locks while a modal is visible', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /const\s*\{[^}]*pointerLockAction[^}]*\}\s*=\s*window\.inputPolicy/);
  assert.match(html, /document\.addEventListener\('pointerlockchange',[\s\S]*const\s+pointerAction\s*=\s*pointerLockAction\(\{[\s\S]*pointerLocked:[\s\S]*pauseOpen:[\s\S]*respawnOpen:[\s\S]*resultsOpen:/s);
  assert.match(html, /if\s*\(pointerAction\s*===\s*'release'\)\s*releaseFlightPointerLock\(\)/);
  assert.match(html, /else if\s*\(pointerAction\s*===\s*'open-pause'\)\s*openPauseMenu\(\)/);
  assert.match(html, /function showResults\([^)]*\)[\s\S]*releaseFlightPointerLock\(\)[\s\S]*readyButton\.focus\(\)/s);
});

test('touch keypad feeds the shared flight state and releases captured pointers safely', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /const\s+\{\s*createCombinedKeyState,\s*createTouchKeyState,\s*createTouchLookState\s*\}\s*=\s*window\.mobileControls/);
  assert.match(html, /const keyboardKeys\s*=\s*\{\};[\s\S]*const touchKeys\s*=\s*\{\};[\s\S]*const keys\s*=\s*createCombinedKeyState\(keyboardKeys, touchKeys\)/);
  assert.match(html, /createTouchKeyState\(touchKeys,[\s\S]*onPress:\s*code\s*=>\s*\{[\s\S]*code === 'Space'[\s\S]*shoot\(\)/);
  assert.match(html, /onChange:\s*\(code, active\)[\s\S]*setAttribute\('aria-pressed', String\(active\)\)/);
  assert.match(html, /function clearFlightKeys\(\)\s*\{[\s\S]*touchFlightKeys\?\.clear\(\)/);
  assert.match(html, /button\.addEventListener\('pointerdown',[\s\S]*setPointerCapture\(event\.pointerId\)[\s\S]*touchFlightKeys\.press\(event\.pointerId, button\.dataset\.flightKey\)/);
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    assert.match(html, new RegExp(`button\\.addEventListener\\('${eventName}', releaseTouchPointer\\)`));
  }
  assert.match(html, /button\.addEventListener\('click',[\s\S]*event\.detail !== 0[\s\S]*touchFlightKeys\.isPointerActive\(activationId\)/);
  assert.match(html, /e\.target\.closest\('#touch-controls'\)/);
  assert.match(html, /\$\('touch-menu'\)\.addEventListener\('click', openPauseMenu\)/);
  assert.match(html, /function enterGame\(\)[\s\S]*\$\('touch-fire'\)\.classList\.toggle\('hide', !arena\)/);
  assert.match(html, /function showResults\(results\)\s*\{[\s\S]*clearFlightKeys\(\)[\s\S]*setUnderlyingGameUiInert\(true, 'results'\)/);
});

test('death modal preempts pause and becomes the only interactive HUD layer', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /function\s+setUnderlyingGameUiInert\(inert,\s*activeModalId\s*=\s*null\)/);
  assert.match(html, /child\.inert\s*=\s*inert\s*&&\s*child\.id\s*!==\s*activeModalId/);
  assert.match(html, /function showRespawnOverlay\(byName\)\s*\{[\s\S]*closePauseMenu\(\);[\s\S]*setUnderlyingGameUiInert\(true,\s*'respawn-overlay'\)[\s\S]*releaseFlightPointerLock\(\)/);
  assert.match(html, /case 'spawned':[\s\S]*respawn-overlay'\)\.classList\.add\('hide'\)[\s\S]*setUnderlyingGameUiInert\(false\)[\s\S]*enterGame\(\)/);
});

test('pause and result overlays isolate focus and suspend flight input', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /function clearFlightKeys\(/);
  assert.match(html, /addEventListener\(['"]blur['"],\s*clearFlightKeys\)/);
  assert.match(html, /visibilitychange/);
  assert.match(html, /function hideResults\([\s\S]*resultsReturnFocus\s*!==\s*document\.body/);
  assert.match(html, /function trapModalFocus\(/);
  assert.match(html, /const focusable = \[\.\.\.layer\.querySelectorAll\([\s\S]*\.filter\(element => element\.tabIndex >= 0 && !element\.closest\('\[hidden\]'\) && !element\.closest\('\.hide'\)\)/);
  assert.match(html, /function openSettingsMenu\([\s\S]*setSettingsSection\(section\)/);
  assert.match(html, /function openPauseMenu\(\)[\s\S]*openSettingsMenu\('controls'\)/);
  assert.match(html, /function enterLobby\([\s\S]*\$\(['"]lob-name['"]\)\.focus\(\)/);
  assert.match(html, /id="results"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="r-title"/);
  assert.match(html, /if\s*\(pauseOpen\s*&&\s*e\.code\s*===\s*'Escape'/);
});
