const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const packageJson = require('../package.json');

test('desktop HUD has no visible ESC settings button while keyboard ESC and touch settings remain', () => {
  assert.doesNotMatch(html, /id="game-leave-btn"/);
  assert.match(html, /pauseMenuAction\(\{[\s\S]*code:\s*e\.code[\s\S]*if \(pauseAction[\s\S]*openPauseMenu\(\)/);
  assert.match(html, /id="touch-menu"[^>]*aria-label="비행 설정"/);
  assert.match(html, /\$\('touch-menu'\)\.addEventListener\('click', openPauseMenu\)/);
  assert.match(html, /@media\s*\(any-pointer:\s*coarse\)\s*and\s*\(pointer:\s*fine\)[\s\S]*#touch-controls\s*\{[^}]*display:\s*block[\s\S]*#touch-menu\s*\{[^}]*display:\s*grid/s);
});

test('right-side HUD uses one bounded rail so eight-player ranking, guide, and map cannot stack independently', () => {
  assert.match(html, /id="hud-right-rail"[\s\S]*id="board"[\s\S]*id="keys"[\s\S]*id="minimap"[\s\S]*<\/aside>/);
  assert.match(html, /#hud-right-rail\s*\{[^}]*position:\s*absolute[^}]*display:\s*grid[^}]*grid-template-rows:\s*minmax\(96px,\s*1fr\)\s+auto\s+auto/s);
  assert.match(html, /#hud-right-rail\s*>\s*#board\s*\{[^}]*position:\s*relative[^}]*max-height:\s*100%[^}]*overflow-y:\s*auto[^}]*align-self:\s*start/s);
  assert.match(html, /@media\s*\(max-height:\s*700px\)[\s\S]*#hud-right-rail\s*\{[^}]*grid-template-columns:\s*minmax\(190px,\s*250px\)\s+minmax\(220px,\s*340px\)[^}]*grid-template-rows:\s*minmax\(96px,\s*1fr\)\s+auto/s);
  assert.doesNotMatch(html, /@media\s*\(max-height:\s*720px\)[\s\S]{0,260}grid-template-columns:\s*minmax\(190px,\s*250px\)\s+minmax\(220px,\s*340px\)/s);
});

test('key guide stays translucent but has a contrast-safe backing and documents minimap zoom', () => {
  assert.match(html, /#hud-right-rail\s*>\s*#keys\s*\{[^}]*position:\s*relative[^}]*width:\s*250px[^}]*justify-self:\s*end/s);
  assert.match(html, /#keys\s*\{[^}]*background:\s*rgba\([^)]*,\s*\.82\)/s);
  assert.match(html, /<kbd>N<\/kbd>[^<]*주변 지도/);
});

test('HUD exposes a large tactical minimap with stable accessible mode semantics', () => {
  assert.ok(html.includes(`<script src="./hud-policy.js?v=${packageJson.version}"></script>`));
  assert.match(html, /id="minimap"[^>]*aria-labelledby="minimap-title"[^>]*aria-keyshortcuts="N"/);
  assert.match(html, /id="minimap-title"[^>]*>TACTICAL MAP<\/span>/);
  assert.match(html, /id="minimap-canvas"[^>]*width="512"[^>]*height="512"[^>]*aria-hidden="true"/);
  assert.match(html, /id="minimap-mode"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /#hud-right-rail\s*>\s*#minimap\s*\{[^}]*position:\s*relative[^}]*width:\s*clamp\(280px,/s);
});

test('N switches minimap mode once per key press and DIST full view uses the conservative course envelope', () => {
  assert.match(html, /if\s*\(e\.code === 'KeyN' && !e\.repeat\)\s*\{[\s\S]*toggleMinimapMode\(minimapMode\)[\s\S]*updateMinimapModeLabel\(\)/);
  assert.match(html, /function getDistanceMinimapHalfWidth\(\)\s*\{\s*return DIST_HALF \* window\.mapGen\.MAX_DISTANCE_WIDTH_SCALE;\s*\}/);
  assert.match(html, /createMinimapView\(\{[\s\S]*courseHalf:\s*getDistanceMinimapHalfWidth\(\)[\s\S]*localRadius:/);
  assert.match(html, /@media\s*\(max-width:\s*560px\)\s*and\s*\(max-height:\s*640px\)[\s\S]*#hud-right-rail\s*>\s*#minimap\s*\{[^}]*display:\s*none/s);
  assert.match(html, /const minimapCompactViewportQuery = matchMedia\('\(max-width: 560px\) and \(max-height: 640px\)'\)/);
  assert.match(html, /function drawMinimap[\s\S]*shouldRenderMinimap\(\{[\s\S]*coarsePointer:\s*minimapCoarsePointerQuery\.matches[\s\S]*compactViewport:\s*minimapCompactViewportQuery\.matches/s);
  assert.match(html, /minimapLastDraw\s*=\s*-Infinity;\s*return;/);
  assert.match(html, /projectMinimapPoint\(/);
});

test('updraft replaces text with a full-screen inward wind field driven by smoothed lift intensity', () => {
  assert.doesNotMatch(html, /id="thermal"[^>]*>상승기류/);
  assert.match(html, /id="thermal-vortex"[^>]*aria-hidden="true"/);
  assert.ok((html.match(/class="wind-streak"/g) || []).length >= 12);
  assert.match(html, /#thermal-vortex\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*--thermal-force:\s*0[^}]*opacity:\s*var\(--thermal-force\)/s);
  assert.match(html, /@keyframes\s+thermal-suction[\s\S]*translateX\(58vmax\)[\s\S]*translateX\(5vmax\)/);
  assert.match(html, /thermalVisualTarget\s*=\s*THREE\.MathUtils\.clamp\(inTh/);
  assert.match(html, /approachThermalIntensity\(thermalVisualStrength,\s*thermalVisualTarget,\s*dt\)/);
  assert.match(html, /setProperty\('--thermal-force'/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*#thermal-vortex \.wind-streak\s*\{[^}]*animation:\s*none/s);
});

test('dash adds an outward speed field, impact ring, and boost feedback while accelerating', () => {
  assert.match(html, /id="dash-vortex"[^>]*aria-hidden="true"/);
  assert.ok((html.match(/class="dash-streak"/g) || []).length >= 18);
  assert.match(html, /id="dash-callout"[\s\S]*DASH BOOST[\s\S]*WIND RUSH/);
  assert.match(html, /@keyframes\s+dash-rush[\s\S]*translateX\(6vmax\)[\s\S]*translateX\(70vmax\)/);
  assert.match(html, /@keyframes\s+dash-impact/);
  assert.match(html, /dashVisualTarget\s*=\s*me\.dashing[\s\S]*energyStep\.dashRatio/);
  assert.match(html, /if\s*\(!wasDashing && me\.dashing\)[\s\S]*triggerDashImpact\(\)/);
  assert.match(html, /approachDashIntensity\(dashVisualStrength,\s*dashVisualTarget,\s*dt\)/);
  assert.match(html, /setProperty\('--dash-force'/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*#dash-vortex \.dash-streak[^}]*animation:\s*none/s);
});

test('join, kill, and death use typed, accessible impact announcements', () => {
  assert.match(html, /id="announcement"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  for (const id of ['announcement-kicker', 'announcement-title', 'announcement-detail'])
    assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /const announcementQueue = \[\]/);
  assert.match(html, /const\s+MAX_ANNOUNCEMENT_QUEUE\s*=\s*6/);
  assert.match(html, /enqueueBoundedAnnouncement\(announcementQueue,\s*announcementSpec\(kind,\s*pilotName\),\s*MAX_ANNOUNCEMENT_QUEUE\)/);
  assert.match(html, /function showAnnouncement\(kind, pilotName\)\s*\{[\s\S]*playNextAnnouncement\(\)/);
  assert.match(html, /function playNextAnnouncement\(\)[\s\S]*announcementQueue\.shift\(\)[\s\S]*setTimeout\([\s\S]*playNextAnnouncement\(\)/);
  assert.match(html, /function clearAnnouncements\(\)[\s\S]*announcementQueue\.length = 0/);
  assert.match(html, /announcementSpec\(kind, pilotName\)/);
  assert.match(html, /showAnnouncement\('join',\s*m\.name/);
  assert.match(html, /showAnnouncement\('kill',\s*player \? player\.name/);
  assert.match(html, /showAnnouncement\('death',\s*m\.by/);
  assert.match(html, /#announcement\s*\{[^}]*top:\s*54px[^}]*width:\s*min\(520px,\s*calc\(100vw - 32px\)\)/s);
  assert.match(html, /#announcement\[data-tone="join"\]/);
  assert.match(html, /#announcement\[data-tone="kill"\]/);
  assert.match(html, /#announcement\[data-tone="death"\]/);
  assert.match(html, /@keyframes\s+announcement-impact/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*#announcement\s*\{[^}]*transition:\s*none/s);
  assert.match(html, /freeze\(value = true\)\s*\{[\s\S]*const wasFrozen = graphicsQaFrozen[\s\S]*!graphicsQaFrozen && wasFrozen && announcementActive && !announcementTimer[\s\S]*playNextAnnouncement\(\)/);
});

test('authoritative takedown reconciles a local collision overlay without replaying death effects', () => {
  assert.match(html, /const\s+crashAction\s*=\s*authoritativeCrashAction\(\{[\s\S]*localPlayer:\s*m\.id\s*===\s*net\.id[\s\S]*alive:\s*me\.alive[\s\S]*live:[\s\S]*respawnOpen:/s);
  assert.match(html, /if\s*\(crashAction\s*===\s*'die-and-show'\)[\s\S]*dieLocal\(false\)[\s\S]*showRespawnOverlay\(m\.by\)/s);
  assert.match(html, /else if\s*\(crashAction\s*===\s*'reconcile'\)\s*updateRespawnPresentation\(m\.by\)/);
  assert.match(html, /function\s+updateRespawnPresentation\(byName\)[\s\S]*respawnPresentation\(byName,\s*me\.surv\)/s);
});

test('respawn modal labels self-collision separately from an enemy takedown', () => {
  assert.match(html, /id="respawn-kicker"/);
  assert.match(html, /id="respawn-title"/);
  assert.match(html, /function showRespawnOverlay\(byName\)[\s\S]*const\s+presentation\s*=\s*respawnPresentation\(byName,\s*me\.surv\)/s);
  assert.match(html, /\$\('respawn-kicker'\)\.textContent\s*=\s*presentation\.kicker/);
  assert.match(html, /\$\('respawn-title'\)\.textContent\s*=\s*presentation\.title/);
  assert.match(html, /\$\('respawn-detail'\)\.textContent\s*=\s*presentation\.detail/);
  assert.doesNotMatch(html, /<h2 id="respawn-title">격추되었습니다<\/h2>/);
});

test('remote crashes tear the folded paper craft into bounded, disposable world-space fragments', () => {
  assert.match(html, /const paperTearBursts = \[\]/);
  assert.match(html, /function makeTornPaperGeometry\(/);
  assert.match(html, /function spawnPaperTearBurst\(remoteGroup, color\)/);
  assert.match(html, /remoteGroup\.getWorldPosition\(/);
  assert.match(html, /remoteGroup\.getWorldQuaternion\(/);
  assert.match(html, /if\s*\(reducedMotion\)\s*return/);
  assert.match(html, /const fragmentCount = 18/);
  assert.match(html, /function stepPaperTears\(dt\)[\s\S]*advancePaperFragment\(fragment, dt\)/);
  assert.match(html, /function disposePaperTearBurst\(burst\)[\s\S]*geometry\.dispose\(\)[\s\S]*unregisterLitMaterial\(burst\.material\)/);
  assert.match(html, /function clearPaperTears\(/);
  assert.match(html, /if\s*\(graphicsQaEnabled\)[\s\S]*paperTear\(\{\s*freeze = true\s*\}\s*=\s*\{\}\)[\s\S]*spawnPaperTearBurst\(probe,\s*0xffd36a\)[\s\S]*paperState\(\)[\s\S]*fragments:/);
  assert.match(html, /function clearWorld\(\)\s*\{[\s\S]*clearPaperTears\(\)/);
  assert.match(html, /case 'crashed':[\s\S]*if\s*\(player && m\.by\)\s*spawnPaperTearBurst\(player\.remote\.group, player\.remote\.color\)[\s\S]*player\.remote\.group\.visible = false/);
  assert.match(html, /stepDarts\(dt\);[\s\S]*stepPaperTears\(dt\);/);
});

test('speed gauge layers the stall zone behind the moving fill', () => {
  // 실속 구간이 게이지 위에 그려지면 현재 속도를 가려 읽을 수 없습니다.
  assert.match(html, /#gauge \.stallzone \{[\s\S]*z-index: 1;/);
  assert.match(html, /#gauge \.fill, #energy \.fill \{[^}]*z-index: 2;/);
  // 트랙 안쪽 여백을 지켜 막대와 같은 높이로 맞춥니다.
  assert.match(html, /#gauge \.stallzone \{[\s\S]*left: 2px; top: 2px; bottom: 2px;/);
  assert.doesNotMatch(html, /#gauge \.stallzone \{[\s\S]*width: 2px;/);
});

test('stall zone and speed fill share one maximum-speed scale', () => {
  // 분모가 다르면 실속 경계가 실제 속도 눈금과 어긋납니다.
  assert.match(
    html,
    /\$\('s-stall'\)\.style\.width = `\$\{Math\.min\(100, aeroProfile\.stallSpeed \/ aeroProfile\.maxSpeed \* 100\)\}%`/
  );
  assert.match(html, /fill\.style\.width = Math\.min\(100, \(me\.speed \/ aeroProfile\.maxSpeed\) \* 100\)/);
  assert.doesNotMatch(html, /aeroProfile\.stallSpeed \/ 70/);
});
