const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const projectRoot = path.join(__dirname, '..');
const packageJson = require('../package.json');

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

test('ARENA minimap is mode-gated, world-backed, and responsive', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.ok(html.includes(`<script src="./arena-minimap.js?v=${packageJson.version}"></script>`));
  assert.match(html, /<figure\s+id="arena-minimap"[^>]*aria-label="ARENA 미니맵"[^>]*class="hide"/);
  assert.match(html, /<canvas\s+id="arena-minimap-canvas"[^>]*width="256"[^>]*height="256"/);
  assert.match(html, /#arena-minimap\s*\{[^}]*top:\s*18px[^}]*left:\s*50%[^}]*transform:\s*translateX\(-50%\)/s);
  assert.match(html, /@media\s*\(max-width:\s*560px\)[\s\S]*#arena-minimap\s*\{[^}]*top:\s*8px[^}]*left:\s*auto[^}]*right:\s*8px[^}]*width:\s*104px[^}]*transform:\s*none/s);
  assert.match(html, /@media\s*\(max-width:\s*560px\)\s*and\s*\(max-height:\s*440px\)\s*and\s*\(orientation:\s*portrait\)[\s\S]*#arena-minimap\s*\{[^}]*top:\s*8px[^}]*left:\s*auto[^}]*right:\s*8px[^}]*width:\s*70px[^}]*transform:\s*none/s);
  assert.match(html, /@media\s*\(max-width:\s*560px\)\s*and\s*\(max-height:\s*400px\)\s*and\s*\(orientation:\s*portrait\)[\s\S]*#arena-minimap\s*\{[^}]*width:\s*60px/s);
  assert.match(html, /const\s+\{\s*createArenaMinimapFrame,\s*drawArenaMinimap\s*\}\s*=\s*window\.arenaMinimap/);
  assert.match(html, /function enterGame\(\)[\s\S]*\$\('hud'\)\.classList\.toggle\('arena-mode', arena\)[\s\S]*\$\('arena-minimap'\)\.classList\.toggle\('hide', !arena\)/);
  assert.match(html, /function updateArenaMinimap\(\)[\s\S]*mode:\s*game\.mode[\s\S]*arenaRadius:\s*ARENA_R[\s\S]*craft\.position[\s\S]*net\.players[\s\S]*ringsArr[\s\S]*thermals[\s\S]*drawArenaMinimap/);
  assert.match(html, /@media\s*\(min-width:\s*561px\)\s*and\s*\(max-width:\s*889px\)[\s\S]*#arena-minimap\s*\{[^}]*top:\s*32px[^}]*left:\s*auto[^}]*right:\s*132px[^}]*width:\s*120px[^}]*transform:\s*none[\s\S]*#board\.arena\s*\{[^}]*padding-top:\s*160px[^}]*max-height:\s*calc\(100dvh\s*-\s*210px\)[^}]*overflow-y:\s*auto/s);
  assert.match(html, /@media\s*\(min-width:\s*561px\)\s*and\s*\(max-width:\s*889px\)\s*and\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*440px\)[\s\S]*#arena-minimap\s*\{[^}]*top:\s*28px[^}]*right:\s*152px[^}]*width:\s*80px[^}]*[\s\S]*#board\.arena\s*\{[^}]*padding-top:\s*105px[^}]*max-height:\s*calc\(100dvh\s*-\s*180px\)[\s\S]*#hud\.arena-mode\s+#keys\s*,\s*#hud\.arena-mode\s+#game-leave-btn\s*\{[^}]*display:\s*none/s);
  assert.match(html, /@media\s*\(max-width:\s*560px\)\s*and\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*440px\)[\s\S]*#arena-minimap\s*\{[^}]*top:\s*8px[^}]*left:\s*auto[^}]*right:\s*8px[^}]*width:\s*60px[^}]*height:\s*60px[^}]*transform:\s*none/s);
  assert.match(html, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*#arena-minimap\s*\{[^}]*top:\s*8px[^}]*left:\s*50%[^}]*right:\s*auto[^}]*width:\s*96px[^}]*transform:\s*translateX\(-50%\)/s);
  assert.match(html, /minimapAcc\s*>=\s*1\s*\/\s*15[\s\S]*minimapAcc\s*%=\s*1\s*\/\s*15[\s\S]*updateArenaMinimap\(\)/);
});

test('coarse-pointer gameplay exposes a complete accessible touch keypad overlay', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /<script\s+src=['"]\.\/mobile-controls\.js['"]><\/script>/);
  assert.match(html, /id="touch-controls"[^>]*aria-label="모바일 비행 조작"/);
  for (const [code, label] of [
    ['KeyW', '기수 내리기'],
    ['KeyS', '기수 올리기'],
    ['KeyA', '왼쪽으로 기울이기'],
    ['KeyD', '오른쪽으로 기울이기'],
    ['ShiftLeft', '대시'],
    ['Space', '다트 발사']
  ]) {
    assert.match(html, new RegExp(`<button[^>]*data-flight-key="${code}"[^>]*aria-label="${label}"`));
    assert.match(html, new RegExp(`<button[^>]*data-flight-key="${code}"[^>]*aria-pressed="false"`));
  }
  assert.match(html, /#touch-controls\s*\{[^}]*touch-action:\s*none/s);
  assert.match(html, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)[\s\S]*#touch-controls\s*\{[^}]*display:\s*flex/s);
});

test('coarse-pointer gauges stay compact above the mobile controls', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)[\s\S]*#gauge\s*\{[^}]*left:\s*50%[^}]*right:\s*auto[^}]*width:\s*min\(180px,\s*46vw\)[^}]*transform:\s*translateX\(-50%\)/s);
  assert.match(html, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)[\s\S]*#energy\s*\{[^}]*left:\s*50%[^}]*right:\s*auto[^}]*width:\s*min\(180px,\s*46vw\)[^}]*transform:\s*translateX\(-50%\)/s);
  assert.match(html, /#gauge \.track\s*\{[^}]*height:\s*4px/);
  assert.match(html, /#energy \.track\s*\{[^}]*height:\s*5px/);
  assert.match(html, /orientation:\s*landscape\)[\s\S]*#gauge\s*\{[^}]*left:\s*50%[^}]*right:\s*auto[^}]*width:\s*min\(170px,\s*28vw\)/s);
  assert.match(html, /orientation:\s*landscape\)[\s\S]*#energy\s*\{[^}]*left:\s*50%[^}]*right:\s*auto[^}]*width:\s*min\(170px,\s*28vw\)/s);
});

test('coarse-pointer D-pad uses larger touch targets in both orientations', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /\.touch-dpad\s*\{[^}]*grid-template:\s*repeat\(3,\s*64px\)\s*\/\s*repeat\(3,\s*64px\)/);
  assert.match(html, /orientation:\s*landscape\)[\s\S]*\.touch-dpad\s*\{[^}]*grid-template:\s*repeat\(3,\s*56px\)\s*\/\s*repeat\(3,\s*56px\)/s);
});

test('dash and fire use large circular mobile action buttons', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /\.touch-action\s*\{[^}]*width:\s*84px[^}]*height:\s*84px[^}]*border-radius:\s*50%/);
  assert.match(html, /orientation:\s*landscape\)[\s\S]*\.touch-action\s*\{[^}]*width:\s*78px[^}]*height:\s*78px[^}]*border-radius:\s*50%/s);
});

test('portrait touch HUD separates stats, timer, leaderboard, meters, and controls', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');
  assert.match(html, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*portrait\)[\s\S]*#stats\s*\{[^}]*transform:\s*scale\(\.66\)/s);
  assert.match(html, /orientation:\s*portrait\)[\s\S]*#timer\s*\{[^}]*right:\s*12px[^}]*transform:\s*none/s);
  assert.match(html, /orientation:\s*portrait\)[\s\S]*#board\s*\{[^}]*top:\s*140px[^}]*max-height:\s*min\(180px,\s*28vh\)[^}]*overflow-y:\s*auto/s);
});

test('short portrait touch HUD keeps the leaderboard clear of compact gauges', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*portrait\)\s*and\s*\(max-height:\s*640px\)[\s\S]*#board\s*\{[^}]*top:\s*138px[^}]*max-height:\s*clamp\(0px,\s*calc\(100vh\s*-\s*env\(safe-area-inset-bottom\)\s*-\s*452px\),\s*116px\)[^}]*max-height:\s*clamp\(0px,\s*calc\(100dvh\s*-\s*env\(safe-area-inset-bottom\)\s*-\s*452px\),\s*116px\)[^}]*padding-block:\s*0[^}]*border-block-width:\s*0/s);
  assert.match(html, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*portrait\)\s*and\s*\(max-height:\s*500px\)[\s\S]*#board\s*\{[^}]*display:\s*none/s);
  assert.match(html, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*portrait\)\s*and\s*\(max-height:\s*440px\)[\s\S]*#gauge,\s*#energy\s*\{[^}]*left:\s*auto[^}]*right:\s*max\(8px,\s*env\(safe-area-inset-right\)\)[^}]*transform:\s*none/s);
});

test('landscape touch HUD resets inherited small-screen positioning', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');
  assert.match(html, /orientation:\s*landscape\)[\s\S]*#board\s*\{[^}]*left:\s*auto[^}]*right:\s*max\(8px,\s*env\(safe-area-inset-right\)\)[^}]*max-height:\s*88px/s);
  assert.match(html, /orientation:\s*landscape\)[\s\S]*#timer\s*\{[^}]*left:\s*50%[^}]*right:\s*auto[^}]*transform:\s*translateX\(-50%\)/s);
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
  assert.match(html, /function showResults\(results\)\s*\{[\s\S]*clearFlightKeys\(\)[\s\S]*setUnderlyingGameUiInert\(true\)/);
});

test('mobile canvas drag rotates free-look without stealing control-button touches', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /const\s+\{\s*createCombinedKeyState,\s*createTouchKeyState,\s*createTouchLookState\s*\}\s*=\s*window\.mobileControls/);
  assert.match(html, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)[\s\S]*#c\s*\{[^}]*touch-action:\s*none/s);
  assert.match(html, /createTouchLookState\(\{[\s\S]*onMove:[\s\S]*updateFreeLook\(freeLook, movementX, movementY, 0\.004/);
  assert.match(html, /canvas\.addEventListener\('pointerdown',[\s\S]*event\.pointerType !== 'touch'[\s\S]*touchLook\.start\(event\.pointerId, event\.clientX, event\.clientY\)[\s\S]*setPointerCapture\(event\.pointerId\)/);
  assert.match(html, /canvas\.addEventListener\('pointermove',[\s\S]*touchLook\.move\(event\.pointerId, event\.clientX, event\.clientY\)/);
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    assert.match(html, new RegExp(`canvas\\.addEventListener\\('${eventName}', releaseTouchLookPointer\\)`));
  }
  assert.match(html, /canvas\.addEventListener\('click', event => \{[\s\S]*event\.pointerType === 'touch'/);
  assert.match(html, /function clearFlightKeys\(\)\s*\{[\s\S]*touchLook\?\.clear\(\)/);
  assert.match(html, /controls\(\)\s*\{[\s\S]*freeLook:\s*\{\s*\.\.\.freeLook\s*\}[\s\S]*touchLookActive:\s*touchLook\?\.isActive\(\)/);
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

test('the ESC menu persists mouse Y inversion and applies it to free-look', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /for="mouse-invert-y-toggle"/);
  assert.match(html, /id="mouse-invert-y-toggle"[^>]*type="checkbox"/);
  assert.match(html, /mouseInvertYFromStorage\(localStorage\.getItem\(['"]pp_mouse_invert_y['"]\)\)/);
  assert.match(html, /localStorage\.setItem\(['"]pp_mouse_invert_y['"],\s*enabled \? ['"]1['"] : ['"]0['"]\)/);
  assert.match(html, /updateFreeLook\(freeLook,\s*event\.movementX,\s*event\.movementY,\s*0\.0022,\s*mouseInvertY\)/);
});

test('the ESC menu exposes persisted runtime graphics settings', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /<script\s+src=['"]\.\/graphics-settings\.js['"]><\/script>/);
  assert.match(html, /id="graphics-resolution"/);
  assert.match(html, /id="graphics-shadows"/);
  assert.match(html, /id="graphics-view-distance"/);
  assert.match(html, /id="graphics-csm"/);
  assert.match(html, /id="graphics-gtao"/);
  assert.match(html, /id="graphics-bloom"/);
  assert.match(html, /id="graphics-anti-aliasing"/);
  assert.match(html, /id="graphics-fog-quality"/);
  assert.match(html, /id="graphics-shadow-softness"/);
  assert.match(html, /localStorage\.setItem\(['"]pp_graphics['"]/);
  assert.match(html, /function applyGraphicsSettings\(/);
  assert.match(html, /if \(graphicsQaEnabled\)[\s\S]*window\.__graphicsQA\s*=\s*\{/);
  assert.match(html, /preview\(mode\s*=\s*['"]DIST['"],\s*seed\s*=\s*4312\)/);
  assert.ok(html.indexOf('const game = {') < html.indexOf('applyGraphicsSettings(graphicsSettings, false)'));
  assert.match(html, /select:not\(:disabled\)/);
});

test('high graphics defaults extend shadows and view distance across biome environment meshes', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');
  const biomeVisuals = fs.readFileSync(path.join(projectRoot, 'public/biome-visuals.js'), 'utf8');
  const homePlane = fs.readFileSync(path.join(projectRoot, 'public/home-plane-3d.js'), 'utf8');
  const foldEditor = fs.readFileSync(path.join(projectRoot, 'public/fold-editor-3d.mjs'), 'utf8');

  assert.match(html, /resolveGraphicsSettings\(/);
  assert.match(html, /from ['"]three\/addons\/csm\/CSM\.js['"]/);
  assert.match(html, /from ['"]three\/addons\/postprocessing\/GTAOPass\.js['"]/);
  assert.match(html, /from ['"]three\/addons\/postprocessing\/UnrealBloomPass\.js['"]/);
  assert.match(html, /from ['"]three\/addons\/postprocessing\/SMAAPass\.js['"]/);
  assert.match(html, /from ['"]three\/addons\/postprocessing\/ShaderPass\.js['"]/);
  assert.match(html, /from ['"]three\/addons\/shaders\/FXAAShader\.js['"]/);
  assert.match(html, /function rebuildShadowSystem\(/);
  assert.match(html, /function configurePostProcessing\(/);
  assert.match(html, /buildBiomeEnvironment\(/);
  assert.match(html, /csm\.update\(\)/);
  assert.match(html, /composer\.render\(/);
  assert.doesNotMatch(html, /THREE\.PCFSoftShadowMap/);
  assert.doesNotMatch(homePlane, /THREE\.PCFSoftShadowMap/);
  assert.doesNotMatch(foldEditor, /THREE\.PCFSoftShadowMap/);
  assert.match(html, /THREE\.VSMShadowMap/);
  assert.match(biomeVisuals, /mesh\.castShadow\s*=\s*castShadow/);
  assert.match(biomeVisuals, /mesh\.receiveShadow\s*=\s*true/);
});

test('runtime anti-aliasing rebuilds and disposes FXAA or SMAA before output', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /postEffectSignature[\s\S]*resolvedGraphics\.antiAliasing\.mode/);
  assert.match(html, /if \(resolvedGraphics\.antiAliasing\.mode === 'fxaa'\)[\s\S]*new ShaderPass\(FXAAShader\)/);
  assert.match(html, /else if \(resolvedGraphics\.antiAliasing\.mode === 'smaa'\)[\s\S]*new SMAAPass\(\)/);
  assert.match(html, /composer\.addPass\(aaPass\)[\s\S]*composer\.addPass\(new OutputPass\(\)\)/);
  assert.match(html, /aaPass\?\.material\?\.uniforms\?\.resolution\?\.value\.set\([\s\S]*resolvedGraphics\.pixelRatio/);
  assert.match(html, /composer = gtaoPass = bloomPass = aaPass = null/);
});

test('thermal shader keeps bloom inputs finite across GPU implementations', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');
  const thermalShader = html.match(/const thermalMat = new THREE\.ShaderMaterial\(\{[\s\S]*?\n\}\);/)?.[0] || '';

  assert.match(thermalShader, /vN=normalMatrix\*normal; vV=-mv\.xyz/);
  assert.match(thermalShader, /float nLen2=max\(dot\(vN,vN\),1e-4\)/);
  assert.match(thermalShader, /float vLen2=max\(dot\(vV,vV\),1e-4\)/);
  assert.match(thermalShader, /vec3 safeN=vN\*inversesqrt\(nLen2\)/);
  assert.match(thermalShader, /vec3 safeV=vV\*inversesqrt\(vLen2\)/);
  assert.match(thermalShader, /float bandBase=clamp\([\s\S]*float band=pow\(bandBase,2\.2\)/);
  assert.match(thermalShader, /float ndv=clamp\(abs\(dot\(safeN,safeV\)\),0\.,1\.\)/);
  assert.match(thermalShader, /float edge=pow\(max\(0\.,1\.-ndv\),1\.6\)/);
  assert.match(thermalShader, /float fade=\(1\.-smoothstep\(\.35,1\.,vUv\.y\)\)\*smoothstep\(0\.,\.08,vUv\.y\)/);
  assert.doesNotMatch(thermalShader, /normalize\(/);
  assert.doesNotMatch(thermalShader, /pow\(1\.-abs\(dot\(/);
  assert.doesNotMatch(thermalShader, /smoothstep\(1\.,\.35,vUv\.y\)/);
});

test('graphics teardown releases CSM, remote-player, and GTAO resources', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /function detachMaterialFromCsm\([\s\S]*csm\.shaders\.delete\(material\)/);
  assert.match(html, /function unregisterLitMaterial\([\s\S]*detachMaterialFromCsm\(material\)/);
  assert.match(html, /function disposeObject3D\([\s\S]*unregisterLitMaterial\(material\)/);
  assert.match(html, /function registerObjectMaterials\([\s\S]*registerLitMaterial\(material\)/);
  assert.match(html, /function setupMaterialWithCsm\([\s\S]*csmOriginalOnBeforeCompile[\s\S]*original\.apply\(this, args\)[\s\S]*setupCsmShader\.apply\(this, args\)/);
  assert.match(html, /function restoreMaterialCompileHook\([\s\S]*material\.onBeforeCompile = original/);
  assert.match(html, /function disposeCsm\([\s\S]*materials\.forEach\(restoreMaterialCompileHook\)/);
  assert.match(html, /function detachObjectMaterials\([\s\S]*csmMaterials\.delete\(material\)[\s\S]*detachMaterialFromCsm\(material\)/);
  assert.match(html, /registerObjectMaterials\(biomeEnvironment\)/);
  assert.match(html, /detachObjectMaterials\(previousEnvironment\)/);
  assert.match(html, /registerObjectMaterials\(towerGroup\)/);
  assert.match(html, /registerObjectMaterials\(mascot\)/);
  assert.match(html, /function setGameplayCostume\([\s\S]*detachObjectMaterials\(previous\)[\s\S]*registerObjectMaterials\(current\)/);
  assert.match(html, /function clearDarts\([\s\S]*scene\.remove\(dart\.mesh\)[\s\S]*unregisterLitMaterial\(dart\.mesh\.material\)[\s\S]*darts\.length = 0/);
  assert.match(html, /function clearWorld\([\s\S]*clearDarts\(\)/);
  assert.match(html, /gtaoPass\?\.gtaoMaterial\?\.dispose/);
  assert.match(html, /gtaoPass\?\.blendMaterial\?\.dispose/);
  assert.match(html, /Unsupported Three\.js GTAOPass visibility contract/);
});

test('graphics QA stays local and freezes time, camera, and network updates', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.doesNotMatch(html, /127\.0\.0\.1:33008/);
  assert.doesNotMatch(html, /new THREE\.Clock/);
  assert.match(html, /new THREE\.Timer\(\)/);
  assert.match(html, /const now = graphicsQaFrozen \? graphicsQaFrozenAt : Date\.now\(\)/);
  assert.match(html, /if \(graphicsQaFrozen\) \{[\s\S]*camera\.position\.copy\(camPos\)/);
  assert.match(html, /if \(!graphicsQaFrozen && sendAcc > 0\.066/);
});

test('ARENA death releases the mouse and offers a direct lobby exit', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');
  const flowCss = fs.readFileSync(path.join(projectRoot, 'public/multiplayer-flow.css'), 'utf8');

  assert.match(html, /id="respawn-overlay"[^>]*aria-modal="true"/);
  assert.match(html, /id="respawn-leave-btn"[^>]*>로비로 나가기<\/button>/);
  assert.match(html, /respawn-leave-btn'\)\.addEventListener\('click',[\s\S]{0,220}send\(\{ t: 'leave' \}\)/);
  assert.match(html, /function showRespawnOverlay\(byName\) \{[\s\S]*clearFlightKeys\(\);[\s\S]*releaseFlightPointerLock\(\);/);
  assert.match(html, /pointerlockchange[\s\S]{0,280}respawn-overlay'\)\.classList\.contains\('hide'\)/);
  assert.match(html, /function enterHome\(msg\) \{[\s\S]{0,320}respawn-overlay'\)\.classList\.add\('hide'\)/);
  assert.match(html, /const pauseOpen = isPauseMenuOpen\(\);\s*if \(!\$\('respawn-overlay'\)\.classList\.contains\('hide'\)\) return;\s*if \(e\.code === 'Escape'/);
  assert.match(flowCss, /#respawn-leave-btn\s*\{[^}]*flex-basis:\s*100%/s);
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
  assert.match(html, /function enterLobby\([\s\S]*\$\(['"]lob-name['"]\)\.focus\(\)/);
  assert.match(html, /id="results"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="r-title"/);
  assert.match(html, /if\s*\(pauseOpen\)\s*return/);
});

test('result and mobile HUD layouts remain scrollable without overlap', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');

  assert.match(html, /#results,\s*\.modal-layer\s*\{[^}]*z-index:\s*60/s);
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
