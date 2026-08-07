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

test('folding UI exposes the 3d editor, unfold, completion and synchronized progress', () => {
  for (const id of [
    'folding-screen', 'fold-timer', 'fold-paper-canvas', 'fold-leave-btn',
    'fold-undo-btn', 'fold-complete-btn'
  ]) assert.equal(hasId(id), true, `missing #${id}`);
  assert.match(html, /import \{ createFoldEditor \} from '\.\/fold-editor-3d\.mjs'/);
  assert.match(html, /attachEditor\(foldEditor\)/);
  assert.match(html, /class="fold-help">돌리기: 빈 공간 드래그/);
  assert.doesNotMatch(html, /fold-dir-valley|fold-dir-mountain|fold-preview-canvas|foldPreview/);
  assert.match(foldUi, /api\.applyFold\(model, start, end, angle\)/);
  assert.match(foldUi, /attachEditor/);
  // 확정된 힌지 재조절: 편집기 onAdjustHinge → 컨트롤러 setFoldAngle 경로.
  assert.match(html, /onAdjustHinge: \(foldIndex, angle\) => window\.paperFoldingStage\?\.handleHingeAdjust\(foldIndex, angle\)/);
  assert.match(foldUi, /api\.setFoldAngle\(model, foldIndex, angle\)/);
  assert.doesNotMatch(foldUi, /THREE|getContext\('2d'\)/);
  assert.match(html, /접을 쪽을 잡아 당겨 접으세요/);
  assert.match(foldUi, /model = api\.undoFold\(model\)/);
  assert.match(foldUi, /setRoomProgress\(done, total\)/);
  assert.match(html, /onComplete: fold => send\(\{ t: 'fold_done', commands: fold\.commands \}\)/);
  assert.match(flowCss, /\.fold-angle-badge/);
  assert.doesNotMatch(flowCss, /\.fold-preview\s/);
});

test('active room snapshots are idempotent and launch is server-authoritative', () => {
  assert.match(html, /function isSameRoundPhase\(snapshot\)/);
  assert.match(html, /case 'room':[\s\S]*isSameRoundPhase\(m\)/);
  assert.match(html, /m\.phase === 'launch'/);
  assert.match(html, /case 'phase':[\s\S]*m\.phase === 'launch'/);
  assert.match(html, /const needsWorld = m\.t === 'room' && !world\.children\.length;[\s\S]*ensureLaunchTowers\(\);[\s\S]*if \(needsWorld\) spawnSelf\(\)/);
  assert.doesNotMatch(html, /setCraftFromFoldModel\(foldedModel\);\s*startLaunchSequence\(\)/s);
});

test('a room snapshot arriving mid-launch resyncs order and rebuilds stale launch towers', () => {
  assert.match(
    html,
    /if \(sameRoundPhase\) \{[\s\S]*else if \(m\.phase === 'launch'\) \{[\s\S]*getLaunchLayoutKey\(m\.mode, m\.seed, nextOrder\)[\s\S]*launchState\.towerLayoutKey !== nextLayoutKey[\s\S]*applyPhase\(m\)[\s\S]*\} else if \(m\.phase === 'playing'\) \{[\s\S]*game\.order = Array\.isArray\(m\.order\) \? m\.order : game\.order;[\s\S]*\}[\s\S]*refreshBoard\(\);[\s\S]*break;\s*\}/
  );
});

test('remote and launch Three.js resources are explicitly disposed', () => {
  assert.match(html, /function disposeObject3D\(object\)/);
  assert.match(html, /disposeObject3D\(actor\.group \|\| actor\.mascot\)/);
  assert.match(html, /disposeObject3D\(player\.remote\.group\)/);
});

test('DIST and ARENA share READY and folding flow while retaining mode-specific play maps', () => {
  assert.match(html, /getWaitingSlots\(room, 4\)/);
  assert.match(html, /room-ready-btn'[\s\S]*resultsPending/);
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
  assert.match(html, /function startLaunchSequence\(phase\)/);
  assert.match(html, /function updateLaunch\(now\)/);
  assert.match(html, /game\.phase = 'launch'/);
  assert.match(html, /applyCraftSnapshots\(m\.crafts\);\s*startLaunchSequence\(m\)/s);
});

test('Rapier fixed-step physics is wired to folded colliders, forces, and map collisions', () => {
  assert.match(html, /import\('\.\/flight-physics-rapier\.mjs'\)/);
  assert.match(html, /makeColliderVertices\(activePaperModel\)/);
  assert.match(html, /rapierFlight\.advance\(dt/);
  assert.match(html, /rapierFlight\?\.setMapColliders\(\{ spires, rocks \}\)/);
  assert.match(html, /Rapier/);
});
