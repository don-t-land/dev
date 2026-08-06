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

test('survival entry and four-slot waiting room controls are mounted', () => {
  for (const id of [
    'survival-entry', 'entry-name', 'entry-create-btn', 'entry-code', 'entry-join-btn',
    'room-lobby', 'waiting-room-canvas', 'room-player-list', 'room-ready-btn', 'room-start-btn'
  ]) assert.equal(hasId(id), true, `missing #${id}`);
  assert.match(html, /getWaitingSlots\(room, room\.mode === 'ARENA' \? 4/);
  assert.match(html, /window\.waitingRoomStage\?\.update/);
  assert.match(flowCss, /grid-template-columns:\s*repeat\(4,1fr\)/);
});

test('survival entry stays translucent over the home scene', () => {
  assert.match(flowCss, /#survival-entry\s*\{[\s\S]*rgba\([^)]*,\s*\.72\)[\s\S]*\}/);
  assert.match(flowCss, /\.room-entry-card\s*\{[\s\S]*rgba\([^)]*,\s*\.82\)/);
  assert.match(flowCss, /backdrop-filter:\s*blur\(5px\)/);
});

test('waiting room actors align from eight DOM slot rectangles with a visible gap', () => {
  const waiting3d = fs.readFileSync(path.join(publicDir, 'waiting-room-3d.js'), 'utf8');
  assert.match(html, /data-slot-index=/);
  assert.match(waiting3d, /index < 8/);
  assert.match(waiting3d, /getBoundingClientRect\(\)/);
  assert.match(waiting3d, /screenToWorldOnPlane/);
  assert.match(waiting3d, /ACTOR_BLOCK_GAP_PX\s*=\s*48/);
});

test('folding UI exposes direction, unfold, completion and synchronized progress', () => {
  for (const id of [
    'folding-screen', 'fold-timer', 'fold-paper-canvas', 'fold-dir-valley',
    'fold-dir-mountain', 'fold-undo-btn', 'fold-complete-btn'
  ]) assert.equal(hasId(id), true, `missing #${id}`);
  assert.match(foldUi, /api\.applyFold\(model, completed\.start, completed\.end, direction\)/);
  assert.match(html, /선을 그은 방향의 왼쪽 면/);
  assert.doesNotMatch(foldUi, /const creasePoint = \[\(drag\.start/);
  assert.match(foldUi, /model = api\.undoFold\(model\)/);
  assert.match(foldUi, /setRoomProgress\(done, total\)/);
  assert.match(html, /onComplete: fold => send\(\{ t: 'fold_done', commands: fold\.commands \}\)/);
});

test('active room snapshots are idempotent and launch is server-authoritative', () => {
  assert.match(html, /function isSameRoundPhase\(snapshot\)/);
  assert.match(html, /case 'room':[\s\S]*isSameRoundPhase\(m\)/);
  assert.match(html, /m\.phase === 'launch'/);
  assert.match(html, /case 'phase':[\s\S]*m\.phase === 'launch'/);
  assert.doesNotMatch(html, /setCraftFromFoldModel\(foldedModel\);\s*startLaunchSequence\(\)/s);
});

test('remote and launch Three.js resources are explicitly disposed', () => {
  assert.match(html, /function disposeObject3D\(object\)/);
  assert.match(html, /disposeObject3D\(actor\.group \|\| actor\.mascot\)/);
  assert.match(html, /disposeObject3D\(player\.remote\.group\)/);
});

test('DIST keeps its immediate host start and eight-player presentation', () => {
  assert.match(html, /getWaitingSlots\(room, room\.mode === 'ARENA' \? 4 : Math\.min\(8, room\.maxPlayers\)\)/);
  assert.match(html, /room\.mode === 'ARENA'/);
  const waiting3d = fs.readFileSync(path.join(publicDir, 'waiting-room-3d.js'), 'utf8');
  assert.match(waiting3d, /index < 8/);
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
