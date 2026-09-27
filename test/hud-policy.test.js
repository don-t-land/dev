const assert = require('node:assert/strict');
const test = require('node:test');

const {
  toggleMinimapMode, createMinimapView, projectMinimapPoint, shouldRenderMinimap,
  approachThermalIntensity, approachDashIntensity, announcementSpec, enqueueBoundedAnnouncement,
  respawnPresentation, authoritativeCrashAction, advancePaperFragment,
  createRespawnRetryController
} = require('../public/hud-policy.js');

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);
}

test('N toggles the minimap between full course and player-centered local views', () => {
  assert.equal(toggleMinimapMode('full'), 'local');
  assert.equal(toggleMinimapMode('local'), 'full');
  assert.equal(toggleMinimapMode('unknown'), 'local');
});

test('full minimap projects distance and arena boundaries into the padded canvas', () => {
  const distance = createMinimapView({
    mode: 'full', gameMode: 'DIST', player: { x: 0, z: 0, yaw: 0 },
    courseHalf: 155, courseLength: 7500, arenaRadius: 720
  });
  const start = projectMinimapPoint({ x: 0, z: 0 }, distance, 200, 200, 12);
  const finish = projectMinimapPoint({ x: 0, z: -7500 }, distance, 200, 200, 12);
  const right = projectMinimapPoint({ x: 155, z: -3750 }, distance, 200, 200, 12);
  close(start.x, 100, 'distance start x'); close(start.y, 188, 'distance start y');
  close(finish.x, 100, 'distance finish x'); close(finish.y, 12, 'distance finish y');
  close(right.x, 188, 'distance right boundary');

  const wideDistance = createMinimapView({
    mode: 'full', gameMode: 'DIST', courseHalf: 310, courseLength: 7500
  });
  const floatingBiomeEdge = projectMinimapPoint({ x: 294, z: -3750 }, wideDistance, 200, 200, 12);
  assert.equal(floatingBiomeEdge.visible, true, 'wide-biome aircraft remains inside the full map');
  assert.ok(floatingBiomeEdge.x < 188, 'sampled envelope leaves map padding around valid aircraft');

  const arena = createMinimapView({
    mode: 'full', gameMode: 'ARENA', player: { x: 0, z: 0, yaw: 0 },
    courseHalf: 155, courseLength: 7500, arenaRadius: 720
  });
  const east = projectMinimapPoint({ x: 720, z: 0 }, arena, 200, 200, 12);
  const north = projectMinimapPoint({ x: 0, z: -720 }, arena, 200, 200, 12);
  close(east.x, 188, 'arena east'); close(east.y, 100, 'arena east y');
  close(north.x, 100, 'arena north x'); close(north.y, 12, 'arena north');
});

test('local minimap keeps the player centered and rotates their heading toward the top', () => {
  const yawZero = createMinimapView({
    mode: 'local', gameMode: 'ARENA', player: { x: 20, z: 30, yaw: 0 }, localRadius: 400
  });
  const self = projectMinimapPoint({ x: 20, z: 30 }, yawZero, 200, 200, 12);
  const ahead = projectMinimapPoint({ x: 20, z: -70 }, yawZero, 200, 200, 12);
  close(self.x, 100, 'local self x'); close(self.y, 100, 'local self y');
  assert.ok(ahead.y < self.y, 'yaw 0 forward (-z) should point upward');

  const yawRight = createMinimapView({
    mode: 'local', gameMode: 'ARENA', player: { x: 20, z: 30, yaw: Math.PI / 2 }, localRadius: 400
  });
  const turnedAhead = projectMinimapPoint({ x: -80, z: 30 }, yawRight, 200, 200, 12);
  const worldNorth = projectMinimapPoint({ x: 20, z: -70 }, yawRight, 200, 200, 12);
  assert.ok(turnedAhead.y < 100, 'yaw +90 forward (-x) should point upward');
  assert.ok(worldNorth.x > 100, 'world north should move to the player right after rotation');

  const radialView = createMinimapView({
    mode: 'local', gameMode: 'ARENA', player: { x: 0, z: 0, yaw: 0 }, localRadius: 400
  });
  assert.equal(
    projectMinimapPoint({ x: 400, z: 0 }, radialView, 200, 200, 12).visible,
    true,
    'a point on the local radius remains visible'
  );
  assert.equal(
    projectMinimapPoint({ x: 400, z: -400 }, radialView, 200, 200, 12).visible,
    false,
    'a rectangular-corner point outside the local radius is clipped'
  );
});

test('hidden tactical-map layouts skip canvas work unless explicitly forced for QA', () => {
  assert.equal(shouldRenderMinimap({}), true);
  assert.equal(shouldRenderMinimap({ coarsePointer: true }), false);
  assert.equal(shouldRenderMinimap({ compactViewport: true }), false);
  assert.equal(shouldRenderMinimap({ force: true, coarsePointer: true, compactViewport: true }), true);
});

test('announcement overflow drops the oldest stale pending item while retaining FIFO order', () => {
  const queue = [];
  for (let index = 0; index < 10; index += 1) {
    enqueueBoundedAnnouncement(queue, { index }, 6);
  }
  assert.equal(queue.length, 6);
  assert.deepEqual(queue.map(item => item.index), [4, 5, 6, 7, 8, 9]);
});

test('thermal screen intensity eases toward a clamped target and decays cleanly', () => {
  const rising = approachThermalIntensity(0, 0.8, 0.1);
  assert.ok(rising > 0 && rising < 0.8);
  const saturated = approachThermalIntensity(0.9, 4, 1);
  assert.ok(saturated <= 1 && saturated > 0.9);
  const falling = approachThermalIntensity(0.8, 0, 0.1);
  assert.ok(falling >= 0 && falling < 0.8);
  assert.equal(approachThermalIntensity(0.4, 0.8, 0), 0.4);
});

test('dash intensity snaps in faster than it releases and remains bounded', () => {
  const rising = approachDashIntensity(0, 1, 0.1);
  const falling = approachDashIntensity(1, 0, 0.1);
  assert.ok(rising > 0.7 && rising < 1);
  assert.ok(falling > 0 && falling < 0.6);
  assert.ok(rising > 1 - falling, 'dash onset should respond faster than release');
  assert.equal(approachDashIntensity(-2, 4, 0), 0);
  assert.equal(approachDashIntensity(4, -2, 0), 1);
});

test('authoritative local crash reconciles an already-visible respawn modal', () => {
  assert.equal(authoritativeCrashAction({ localPlayer: false, alive: true, live: true, respawnOpen: false }), null);
  assert.equal(authoritativeCrashAction({ localPlayer: true, alive: true, live: true, respawnOpen: false }), 'die-and-show');
  assert.equal(authoritativeCrashAction({ localPlayer: true, alive: true, live: false, respawnOpen: false }), 'die');
  assert.equal(authoritativeCrashAction({ localPlayer: true, alive: false, live: true, respawnOpen: true }), 'reconcile');
  assert.equal(authoritativeCrashAction({ localPlayer: true, alive: false, live: true, respawnOpen: false }), null);
  assert.equal(authoritativeCrashAction({ localPlayer: true, alive: false, live: false, respawnOpen: true }), null);
});

test('respawn modal distinguishes collision from an enemy takedown', () => {
  assert.deepEqual(respawnPresentation(null, 17.9), {
    kicker: 'COLLISION', title: '충돌했습니다',
    detail: '지형과 충돌 · 이번 생존 17초'
  });
  assert.deepEqual(respawnPresentation('에이스', 17.9), {
    kicker: 'SHOT DOWN', title: '격추되었습니다',
    detail: '에이스 님에게 격추 · 이번 생존 17초'
  });
});

test('join, kill, and death announcements provide distinct immersive copy and tones', () => {
  assert.deepEqual(announcementSpec('join', '새 조종사'), {
    tone: 'join', kicker: 'NEW CONTACT', title: '새 조종사 참전',
    detail: '새로운 종이비행기가 전장에 진입했습니다', duration: 2400
  });
  assert.deepEqual(announcementSpec('kill', '라이벌'), {
    tone: 'kill', kicker: 'PAPER TORN', title: '격추 확인',
    detail: '라이벌의 종이비행기를 찢었습니다', duration: 2800
  });
  assert.deepEqual(announcementSpec('death', '에이스'), {
    tone: 'death', kicker: 'SHOT DOWN', title: '기체 손실',
    detail: '에이스에게 격추되었습니다', duration: 2800
  });
});

test('respawn retries cooldown failures three times and stops after success', () => {
  const sent = [];
  const scheduled = [];
  const statuses = [];
  const controller = createRespawnRetryController({
    send: message => sent.push(message),
    createRequestId: () => 'respawn-retry-1',
    schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
    cancelSchedule: () => {},
    onStatus: status => statuses.push(status),
    retryDelayMs: 700,
    maxRetries: 3
  });

  controller.start();
  assert.deepEqual(sent, [{ t: 'spawn', requestId: 'respawn-retry-1' }]);
  for (let retry = 1; retry <= 3; retry += 1) {
    assert.equal(controller.handleError('RESPAWN_COOLDOWN', 'respawn-retry-1'), true);
    const task = scheduled.shift();
    assert.equal(task.delay, 700);
    task.callback();
    assert.equal(sent.length, retry + 1);
  }

  controller.succeed();
  assert.equal(controller.active, false);
  assert.equal(controller.handleError('RESPAWN_COOLDOWN', 'respawn-retry-1'), false);
  assert.equal(sent.length, 4, 'one initial request plus three retries');
  assert.match(statuses.at(-2), /3\/3/);
});

test('respawn does not retry permanent errors and reports exhausted cooldown retries', () => {
  const sent = [];
  const scheduled = [];
  const exhausted = [];
  const controller = createRespawnRetryController({
    send: message => sent.push(message),
    createRequestId: () => 'respawn-permanent-1',
    schedule: callback => { scheduled.push(callback); return scheduled.length; },
    cancelSchedule: () => {},
    onExhausted: code => exhausted.push(code),
    maxRetries: 1
  });

  controller.start();
  assert.equal(controller.handleError('FOLD_REQUIRED', 'respawn-permanent-1'), false);
  assert.equal(scheduled.length, 0);

  controller.start();
  assert.equal(controller.handleError('RESPAWN_COOLDOWN', 'respawn-permanent-1'), true);
  scheduled.shift()();
  assert.equal(controller.handleError('RESPAWN_COOLDOWN', 'respawn-permanent-1'), true);
  assert.equal(controller.active, false);
  assert.deepEqual(exhausted, ['RESPAWN_COOLDOWN']);
});

test('respawn ignores errors that do not match its active request ID', () => {
  const sent = [];
  const scheduled = [];
  const controller = createRespawnRetryController({
    send: message => sent.push(message),
    createRequestId: () => 'respawn-current',
    schedule: callback => { scheduled.push(callback); return scheduled.length; },
    cancelSchedule: () => {}
  });

  controller.start();
  assert.deepEqual(sent, [{ t: 'spawn', requestId: 'respawn-current' }]);
  assert.equal(controller.handleError('RESPAWN_COOLDOWN', 'other-request'), false);
  assert.equal(controller.matches('other-request'), false);
  assert.equal(controller.matches('respawn-current'), true);
  assert.equal(scheduled.length, 0);
  assert.equal(controller.active, true);
});

test('respawn ignores a stale queued retry after cancel and restart', () => {
  const sent = [];
  const scheduled = [];
  let requestSequence = 0;
  const controller = createRespawnRetryController({
    send: message => sent.push(message),
    createRequestId: () => `respawn-stale-${++requestSequence}`,
    schedule: callback => { scheduled.push(callback); return scheduled.length; },
    cancelSchedule: () => {},
    maxRetries: 3
  });

  controller.start();
  controller.handleError('RESPAWN_COOLDOWN', 'respawn-stale-1');
  const staleRetry = scheduled.shift();
  controller.cancel();
  controller.start();
  staleRetry();

  assert.equal(sent.length, 2, 'stale callback must not send inside the new respawn generation');
});

test('paper fragments tumble, drag, fall, and expire after a bounded step', () => {
  const fragment = {
    position: { x: 1, y: 5, z: -2 },
    velocity: { x: 10, y: 4, z: -6 },
    rotation: { x: 0, y: 0, z: 0 },
    spin: { x: 2, y: -3, z: 4 },
    life: 1
  };
  assert.equal(advancePaperFragment(fragment, 0.1), true);
  assert.ok(fragment.position.x > 1 && fragment.position.y > 5);
  assert.ok(fragment.velocity.x < 10 && fragment.velocity.y < 4);
  assert.ok(fragment.rotation.x > 0 && fragment.rotation.y < 0 && fragment.rotation.z > 0);
  close(fragment.life, 0.95, 'delta is clamped to keep fragments stable');

  fragment.life = 0.01;
  assert.equal(advancePaperFragment(fragment, 0.05), false);
});
