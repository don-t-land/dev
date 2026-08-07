const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const homeCss = fs.readFileSync(path.join(publicDir, 'home-screen.css'), 'utf8');
const flowCss = fs.readFileSync(path.join(publicDir, 'multiplayer-flow.css'), 'utf8');
const foldUi = fs.readFileSync(path.join(publicDir, 'paper-fold-ui.js'), 'utf8');

function hasId(id) {
  return new RegExp(`id=["']${id}["']`).test(html);
}

test('home wordmark stays large on one line and obsolete copy is absent', () => {
  assert.match(html, /<h1[^>]*class="home-wordmark">Don't <span>Land<\/span><\/h1>/);
  assert.match(homeCss, /\.home-wordmark[^}]*white-space:\s*nowrap/s);
  assert.match(homeCss, /\.home-wordmark[^}]*font-size:\s*clamp\(104px,/s);
  assert.doesNotMatch(html, /Paper\s*wing\s*cloud/i);
  assert.doesNotMatch(html, /구름과\s*절벽\s*사이/);
});

test('both flight modes use one mode-aware room popup and four-slot waiting room', () => {
  for (const id of [
    'room-entry', 'entry-name', 'entry-create-btn', 'entry-code', 'entry-join-btn',
    'room-lobby', 'waiting-room-canvas', 'room-player-list', 'room-ready-btn', 'room-start-btn'
  ]) assert.equal(hasId(id), true, `missing #${id}`);
  assert.match(html, /data-home-mode="DIST"/);
  assert.match(html, /data-home-mode="ARENA"/);
  assert.match(html, /function openRoomEntry\(mode\)/);
  assert.match(html, /querySelectorAll\('\[data-home-mode\]'\)[\s\S]*openRoomEntry\(button\.dataset\.homeMode\)/);
  assert.match(html, /t: 'create', mode: entryMode/);
  assert.match(html, /getWaitingSlots\(room, 4\)/);
  assert.match(html, /window\.waitingRoomStage\?\.update/);
  assert.match(flowCss, /grid-template-columns:\s*repeat\(4,1fr\)/);
});

test('waiting room title omits the code-only kicker while keeping invite-code controls', () => {
  assert.match(html, /<div class="waiting-room-title">\s*<h2 id="room-mode-title"/);
  assert.doesNotMatch(html, /id=["']room-visibility["']/);
  assert.doesNotMatch(html, /\$\(['"]room-visibility['"]\)\.textContent/);
  assert.doesNotMatch(html, /PRIVATE\s*·\s*CODE ONLY|PUBLIC ROOM/);
  assert.equal(hasId('room-code-display'), true);
  assert.equal(hasId('copy-code-btn'), true);
});

test('room entry stays translucent over the home scene', () => {
  assert.match(flowCss, /#room-entry\s*\{[\s\S]*rgba\([^)]*,\s*\.72\)[\s\S]*\}/);
  assert.match(flowCss, /\.room-entry-card\s*\{[\s\S]*rgba\([^)]*,\s*\.82\)/);
  assert.match(flowCss, /backdrop-filter:\s*blur\(5px\)/);
});

test('waiting room actors fit inside one horizontal row on mobile and stay layered in front', () => {
  const waiting3d = fs.readFileSync(path.join(publicDir, 'waiting-room-3d.js'), 'utf8');
  assert.match(html, /data-slot-index=/);
  assert.match(waiting3d, /index < 4/);
  assert.match(waiting3d, /getBoundingClientRect\(\)/);
  assert.match(waiting3d, /screenToWorldOnPlane/);
  assert.match(waiting3d, /new THREE\.Box3\(\)\.setFromObject\(mascot\)/);
  assert.match(waiting3d, /const SLOT_EDGE_PADDING_PX = 10/);
  assert.match(waiting3d, /const PLAYER_INFO_CLEARANCE_PX = 56/);
  assert.match(waiting3d, /const MOBILE_PLAYER_INFO_CLEARANCE_PX = 72/);
  assert.match(waiting3d, /const MOBILE_MAX_ACTOR_SCALE = \.76/);
  assert.match(waiting3d, /Math\.min\(maxScale, widthScale, heightScale\)/);
  assert.match(waiting3d, /const playerInfoClearance = mobile \? MOBILE_PLAYER_INFO_CLEARANCE_PX : PLAYER_INFO_CLEARANCE_PX/);
  assert.match(waiting3d, /block\.bottom - playerInfoClearance/);
  assert.doesNotMatch(waiting3d, /block\.top - ACTOR_BLOCK_GAP_PX/);
  assert.match(flowCss, /@media \(max-width:760px\)[\s\S]*?#room-player-list\s*\{[^}]*grid-template-columns:\s*repeat\(4,1fr\);[^}]*grid-template-rows:\s*1fr;[^}]*inset:\s*auto 0 8px;[^}]*height:\s*160px/);
  assert.doesNotMatch(flowCss, /@media \(max-width:760px\)[\s\S]*?#room-player-list\s*\{[^}]*grid-template-columns:\s*(?:repeat\(2,1fr\)|1fr)/);
  assert.match(flowCss, /#waiting-room-canvas\s*\{[^}]*z-index:\s*2/s);
  assert.match(flowCss, /#room-player-list\s*\{[^}]*z-index:\s*auto/s);
  assert.match(flowCss, /\.room-player-slot::before\s*\{[^}]*z-index:\s*1/s);
  assert.match(flowCss, /\.room-player-info\s*\{[^}]*z-index:\s*3/s);
});

test('free-form folding workbench exposes selection, post-crease angle history, flip and accessible help', () => {
  for (const id of [
    'folding-screen', 'fold-timer', 'fold-paper-canvas', 'fold-selection',
    'fold-dir-valley', 'fold-dir-mountain', 'fold-flip-btn', 'fold-history',
    'fold-undo-btn', 'fold-complete-btn'
  ]) assert.equal(hasId(id), true, `missing #${id}`);
  assert.equal(hasId('fold-angle-90'), false);
  assert.equal(hasId('fold-angle-180'), false);
  assert.match(html, /id="fold-timer"[^>]*>02:00<\/div>/);
  assert.doesNotMatch(html, /다음 접기 목표각/);
  assert.match(html, /<canvas[^>]*id="fold-paper-canvas"[^>]*aria-label="[^"]+"/);
  assert.match(html, /보이는 면을 선택[^<]*접을 선/);
  assert.match(html, /왼쪽\/오른쪽[^<]*H[^<]*V[^<]*D[^<]*Enter/);
  assert.match(html, /마지막 동작 취소/);
  assert.match(html, /<script src="\.\/paper-fold-viewport\.js"><\/script>\s*<script src="\.\/paper-fold-ui\.js"><\/script>/);
  assert.match(flowCss, /\.fold-workspace[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(/s);
  assert.match(flowCss, /@media \(max-width:760px\)[\s\S]*\.fold-workspace[^}]*grid-template-columns:\s*1fr/s);
  assert.match(flowCss, /@media \(max-width:760px\)[\s\S]*#fold-paper-canvas[^}]*min-height:/s);
  assert.match(flowCss, /@media \(max-width:760px\)[\s\S]*\.fold-history-list[^}]*overflow-y:\s*auto/s);
  assert.match(flowCss, /#folding-screen\s*\{[^}]*place-items:\s*stretch center[^}]*overflow:\s*hidden/s);
  assert.match(flowCss, /\.fold-workspace\s*\{[^}]*height:\s*100%/s);
  assert.match(flowCss, /\.fold-stage\s*\{[^}]*min-height:\s*0/s);
  assert.match(flowCss, /\.fold-inspector\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(flowCss, /\.fold-history-list\s*\{[^}]*min-height:\s*95px/s);
});

test('folding UI issues material-space single-face panel commands and renders 3D geometry', () => {
  assert.match(foldUi, /api\.applyPanelFold\(model,\s*\{/);
  assert.match(foldUi, /coordinateSpace:\s*['"]material['"]/);
  assert.match(foldUi, /seedFaceId:\s*completed\.faceId/);
  assert.doesNotMatch(foldUi, /api\.applyFold\(/);
  assert.match(foldUi, /viewport\.hitTestFaces\(/);
  assert.match(foldUi, /viewport\.screenToMaterial\(/);
  assert.match(foldUi, /viewport\.projectFace\(face,/);
  assert.match(foldUi, /face\.vertices3d/);
  assert.doesNotMatch(foldUi, /paperToScreen\(point/);
});

test('folding history edits angles, deletes atomically, flips paper and keeps selection/status coherent', () => {
  assert.match(foldUi, /api\.updateFoldAngle\(model,\s*foldId,\s*angle\)/);
  assert.match(foldUi, /api\.removeFold\(model,\s*foldId\)/);
  assert.match(foldUi, /api\.flipPaper\(model\)/);
  assert.match(foldUi, /if \(next === model\)[\s\S]*후속 접기/);
  assert.match(foldUi, /function reconcileSelection\(/);
  assert.match(foldUi, /setStatus\([^)]*각도/);
  assert.match(foldUi, /setStatus\([^)]*삭제/);
  assert.match(foldUi, /model = api\.undoFold\(model\)/);
  assert.match(foldUi, /setRoomProgress\(done, total\)/);
  assert.match(html, /onComplete: fold => send\(\{ t: 'fold_done', commands: fold\.commands \}\)/);
});

test('locked folding state disables every editing control including dynamic history controls', () => {
  assert.match(foldUi, /const EDIT_CONTROL_IDS = \[/);
  for (const id of [
    'fold-dir-valley', 'fold-dir-mountain', 'fold-flip-btn', 'fold-undo-btn'
  ]) assert.match(foldUi, new RegExp(`['"]${id}['"]`));
  assert.match(foldUi, /querySelectorAll\([^)]*data-fold-edit[^)]*\)[\s\S]*disabled = locked/);
  assert.match(foldUi, /canvas\.setAttribute\(['"]aria-disabled['"],\s*String\(locked\)\)/);
});

test('active room snapshots are idempotent and launch is server-authoritative', () => {
  assert.match(html, /function isSameRoundPhase\(snapshot\)/);
  assert.match(html, /case 'room':[\s\S]*isSameRoundPhase\(m\)/);
  assert.match(html, /m\.phase === 'launch'/);
  assert.match(html, /case 'phase':[\s\S]*m\.phase === 'launch'/);
  assert.match(html, /m\.t === 'room' && !world\.children\.length[\s\S]*ensureLaunchTowers\(\);[\s\S]*spawnSelf\(\)/);
  assert.match(html, /if \(sameRoundPhase\)[\s\S]*m\.phase === 'launch'[\s\S]*getLaunchLayoutKey[\s\S]*applyPhase\(m\)/);
  assert.match(html, /if \(sameRoundPhase\)[\s\S]*m\.phase === 'playing'[\s\S]*game\.order = Array\.isArray\(m\.order\)/);
  assert.doesNotMatch(html, /setCraftFromFoldModel\(foldedModel\);\s*startLaunchSequence\(\)/s);
});

test('remote, launch, and authored-map Three.js resources are explicitly disposed', () => {
  assert.match(html, /function disposeObject3D\(object\)/);
  assert.match(html, /if \(child\.isInstancedMesh\) child\.dispose\?\.\(\)/);
  assert.match(html, /disposeObject3D\(actor\.group \|\| actor\.mascot\)/);
  assert.match(html, /disposeObject3D\(player\.remote\.group\)/);
  assert.match(html, /function clearWorld\(\)[\s\S]*if \(o\.isInstancedMesh\) o\.dispose\?\.\(\)/);
});

test('DIST and ARENA share READY and folding flow while retaining mode-specific play maps', () => {
  assert.match(html, /getWaitingSlots\(room, 4\)/);
  assert.match(html, /room-ready-btn'[\s\S]*resultsPending/);
  assert.match(html, /모두 READY · START를 누르면 2분 종이접기가 시작됩니다/);
  assert.doesNotMatch(html, /60초 종이접기/);
  assert.doesNotMatch(html, /room-ready-btn'[\s\S]{0,180}room\.mode !== 'ARENA'/);
  const waiting3d = fs.readFileSync(path.join(publicDir, 'waiting-room-3d.js'), 'utf8');
  assert.match(waiting3d, /index < 4/);
  assert.match(html, /const arena = game\.mode === 'ARENA'/);
  assert.match(html, /function launchSpawnPoint\(index, count, stage/);
  assert.match(html, /\(game\.mode === 'ARENA' \? buildArena : buildDistance\)\(game\.seed\);\s*buildLaunchTowers\(\)/);
  assert.match(html, /else if \(wasLaunch\)/);
});

test('fold-derived aerodynamic profile drives the actual flight loop and HUD', () => {
  assert.match(html, /<script src="\.\/paper-aero-profile\.js"><\/script>/);
  assert.match(html, /deriveAerodynamicProfile\(sourceModel\)/);
  assert.match(html, /onComplete: fold => send\(\{ t: 'fold_done', commands: fold\.commands \}\)/);
  assert.match(html, /function applyCraftSnapshots\(crafts\)/);
  assert.match(html, /replayFoldCommands\(snapshot\?\.commands/);
  assert.match(html, /setCraftFromFoldModel\(model, snapshot\?\.aeroProfile/);
  assert.match(html, /shouldReuseFoldedVisual\(/);
  assert.match(html, /DRAG \* aeroProfile\.dragScale/);
  assert.match(html, /aeroProfile\.stallSpeed/);
  assert.match(html, /aeroProfile\.stability/);
  assert.match(html, /aeroProfile\.rollBias/);
  assert.match(html, /aeroProfile\.pitchBias/);
  assert.match(html, /id="s-aero"/);
});

test('folded craft and server-timed rooftop launch sequence are connected to arena playing', () => {
  assert.match(html, /function setCraftFromFoldModel\(model, authoritativeProfile = null/);
  assert.match(html, /function setFoldedCraftVisual\(owner, baseVisual, model, tint/);
  assert.match(html, /player\.remote\.baseVisual/);
  assert.match(html, /function buildLaunchTowers\(\)/);
  assert.match(html, /function ensureLaunchTowers\(\)/);
  assert.match(html, /launchState\.towerGroup/);
  assert.match(html, /const towerStart = launchSpawnPoint\(index, count, 'start'\)/);
  assert.match(html, /function startLaunchSequence\(phase\)/);
  assert.match(html, /function updateLaunch\(now\)/);
  assert.match(html, /game\.phase = 'launch'/);
  assert.match(html, /applyCraftSnapshots\(m\.crafts\);\s*startLaunchSequence\(m\)/s);
  assert.match(html, /game\.order = Array\.isArray\(m\.order\)[^;]+;\s*ensureLaunchTowers\(\)/s);
});

test('rooftop launch poofs away full-size legs at the drop without folding them', () => {
  assert.match(html, /<script src="\.\/launch-transition\.js\?v=launch-direction-camera-2"><\/script>/);
  assert.match(html, /const snapshots = new Map\(\(phase\?\.crafts/);
  assert.match(html, /replayFoldCommands\(snapshot\?\.commands/);
  assert.match(html, /makeFoldedCraftVisual\(model, tint\)/);
  assert.match(html, /mascot\.remove\(defaultBody\)/);
  assert.match(html, /mascot\.add\(body\)/);
  assert.match(html, /getLaunchPose\(progress\)/);
  assert.match(html, /body\.rotation\.x = pose\.bodyPitch/);
  assert.match(html, /function makeLaunchLegPoof\(\)/);
  assert.match(html, /new THREE\.SphereGeometry\(\.62, 12, 8\)/);
  assert.doesNotMatch(html, /function makeLaunchLegPoof\(\)[\s\S]{0,200}IcosahedronGeometry/);
  assert.match(html, /new THREE\.InstancedMesh\([^,]+,[^,]+,\s*LAUNCH_POOF_OFFSETS\.length\)/);
  assert.match(html, /updateLaunchLegPoof\(actor\.poof, pose\)/);
  assert.match(html, /leftLeg\.visible = pose\.legsVisible/);
  assert.match(html, /rightLeg\.visible = pose\.legsVisible/);
  assert.doesNotMatch(html, /setLaunchLegFade|pose\.legFade|다리를 접고/);
  assert.match(html, /showCenter\(null, '펑!', '다리는 구름/);
  assert.doesNotMatch(html, /if \(progress >= \.88\) craft\.visible = true/);
});

test('rooftop launch uses a forward-tilted camera so the actor runs away toward the roof edge', () => {
  assert.match(html, /<script src="\.\/launch-transition\.js\?v=launch-direction-camera-2"><\/script>/);
  assert.match(html, /const \{ getLaunchPose, getLaunchMotion, getLaunchCameraPlan,/);
  assert.match(html, /const motion = getLaunchMotion\(progress\)/);
  assert.match(html, /const position = pathStart\.clone\(\)\.lerp\(roofEdge, motion\.runProgress\)/);
  assert.match(html, /if \(game\.phase === 'launch' && launchState\.actors\.length\)/);
  assert.match(html, /getLaunchCameraPlan\(localActor\.start, roofEdge\)/);
  assert.match(html, /camera\.position\.lerp\(camPos, 1 - Math\.pow\(0\.000001, dt\)\)/);
});

test('Rapier fixed-step physics is wired to folded colliders, forces, and map collisions', () => {
  assert.match(html, /import\('\.\/flight-physics-rapier\.mjs'\)/);
  assert.match(html, /makeColliderVertices\(activePaperModel\)/);
  assert.match(html, /rapierFlight\.advance\(dt/);
  assert.match(html, /rapierFlight\?\.setMapColliders\(\{ spires, rocks \}\)/);
  assert.match(html, /Rapier/);
});
