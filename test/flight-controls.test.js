const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  updateAttitude,
  updateFreeLook,
  keyGuideVisibleFromStorage,
  mouseInvertYFromStorage,
  updateEnergy,
  consumeDartEnergy,
  applyDistanceRingReward,
  maintainDistanceRingSpeed,
  dashAcceleration,
  speedFov,
  orbitCameraOffset,
  recenterFreeLook,
  isFreeLookCentered,
  LOOK_PITCH_LIMIT,
  MAX_ENERGY,
  DART_ENERGY_COST,
  DIST_RING_SPEED_HOLD_SECONDS
} = require('../public/flight-controls.js');

test('DIST keeps free pitch while its roll self-levels like ARENA', () => {
  const state = { yaw: 1.7, pitch: 1.2, roll: 0.8 };
  const next = updateAttitude(state, {}, 0.5, 'DIST');
  const arena = updateAttitude(state, {}, 0.5, 'ARENA');

  assert.ok(Math.abs(next.pitch - state.pitch) < 1e-9);
  assert.equal(next.roll, arena.roll);
  assert.ok(Math.abs(next.roll) < Math.abs(state.roll));
  assert.ok(next.yaw > state.yaw, 'bank angle should continue turning the aircraft');
});

test('DIST supports complete loops but uses the same roll limit as ARENA', () => {
  const state = { yaw: 0, pitch: -3.05, roll: 0.9 };
  const next = updateAttitude(state, { KeyW: true, KeyA: true }, 0.2, 'DIST');
  const arena = updateAttitude(state, { KeyW: true, KeyA: true }, 0.2, 'ARENA');

  assert.ok(next.pitch > 2.9, `pitch should wrap through -π, got ${next.pitch}`);
  assert.equal(next.roll, arena.roll);
  assert.equal(next.roll, 0.95);
});

test('ARENA keeps its existing assisted attitude limits without pulling yaw toward zero', () => {
  const state = { yaw: 0.4, pitch: 0.5, roll: 0 };
  const next = updateAttitude(state, {}, 0.5, 'ARENA');

  assert.ok(Math.abs(next.pitch + 0.09) < Math.abs(state.pitch + 0.09));
  assert.equal(next.roll, 0);
  assert.ok(Math.abs(next.yaw - state.yaw) < 1e-12);
  assert.ok(next.pitch >= -0.95 && next.pitch <= 0.75);
  assert.ok(next.roll >= -0.95 && next.roll <= 0.95);
});

test('DIST and ARENA apply identical roll dynamics for both input and release', () => {
  for (const keys of [{ KeyD: true }, {}]) {
    const state = { yaw: -0.4, pitch: 0.2, roll: -0.7 };
    const dist = updateAttitude(state, keys, 0.05, 'DIST');
    const arena = updateAttitude(state, keys, 0.05, 'ARENA');
    assert.equal(dist.roll, arena.roll);
  }
});

test('aircraft control envelope scales pitch and roll input independently', () => {
  const state = { yaw: 0, pitch: 0, roll: 0 };
  const stable = updateAttitude(state, { KeyW: true, KeyA: true }, 0.05, 'ARENA', {
    pitchRateScale: 1.28, rollRateScale: 1.42
  });
  const stealth = updateAttitude(state, { KeyW: true, KeyA: true }, 0.05, 'ARENA', {
    pitchRateScale: .72, rollRateScale: .68
  });

  assert.ok(Math.abs(stable.pitch) > Math.abs(stealth.pitch));
  assert.ok(Math.abs(stable.roll) > Math.abs(stealth.roll));
  assert.ok(Math.abs(stable.roll) > Math.abs(stable.pitch));
});

test('aircraft control envelope clamps pitch and roll in both game modes', () => {
  const envelope = {
    maxPitchDown: .72, maxPitchUp: .5, maxRoll: .62,
    pitchRateScale: 1, rollRateScale: 1
  };
  const noseDown = updateAttitude(
    { yaw: 0, pitch: -.7, roll: .6 },
    { KeyW: true, KeyA: true },
    .1,
    'DIST',
    envelope
  );
  const noseUp = updateAttitude(
    { yaw: 0, pitch: .48, roll: -.6 },
    { KeyS: true, KeyD: true },
    .1,
    'ARENA',
    envelope
  );

  assert.equal(noseDown.pitch, -.72);
  assert.equal(noseDown.roll, .62);
  assert.equal(noseUp.pitch, .5);
  assert.equal(noseUp.roll, -.62);
});

test('mouse free-look rotates continuously and clamps only the vertical view', () => {
  const first = updateFreeLook({ yaw: 0, pitch: 0 }, 900, -900);
  const second = updateFreeLook(first, 900, 900);

  assert.ok(first.yaw < 0);
  assert.equal(first.pitch, 1.35);
  assert.ok(second.yaw !== first.yaw);
  assert.ok(second.yaw >= -Math.PI && second.yaw <= Math.PI);
  assert.ok(second.pitch >= -1.35 && second.pitch <= 1.35);
});

test('mouse free-look reverses only vertical movement when Y inversion is enabled', () => {
  const normal = updateFreeLook({ yaw: 0.4, pitch: 0 }, 40, -50, 0.0022, false);
  const inverted = updateFreeLook({ yaw: 0.4, pitch: 0 }, 40, -50, 0.0022, true);

  assert.equal(inverted.yaw, normal.yaw);
  assert.equal(inverted.pitch, -normal.pitch);
  assert.ok(normal.pitch > 0);
  assert.ok(inverted.pitch < 0);
});

test('the key guide is visible by default and can be persisted off', () => {
  assert.equal(keyGuideVisibleFromStorage(null), true);
  assert.equal(keyGuideVisibleFromStorage('1'), true);
  assert.equal(keyGuideVisibleFromStorage('0'), false);
});

test('mouse Y inversion is off by default and restores only an enabled saved value', () => {
  assert.equal(mouseInvertYFromStorage(null), false);
  assert.equal(mouseInvertYFromStorage('0'), false);
  assert.equal(mouseInvertYFromStorage('1'), true);
  assert.equal(mouseInvertYFromStorage('true'), false);
});

test('energy regenerates normally and drains continuously while dash is held', () => {
  const recharged = updateEnergy(50, 0.1, false);
  assert.ok(recharged.energy > 50);
  assert.equal(recharged.dashRatio, 0);

  const dashing = updateEnergy(MAX_ENERGY, 0.1, true);
  assert.ok(dashing.energy < MAX_ENERGY);
  assert.equal(dashing.dashRatio, 1);

  const depleted = updateEnergy(1, 0.1, true);
  assert.equal(depleted.energy, 0);
  assert.ok(depleted.dashRatio > 0 && depleted.dashRatio < 1);
  assert.equal(depleted.overheated, true);
});

test('an overheated engine ignores held dash until energy is fully restored', () => {
  let state = { energy: 0, overheated: true };
  for (let step = 0; step < 49; step++) {
    state = updateEnergy(state.energy, 0.1, true, state.overheated);
    assert.equal(state.dashRatio, 0);
    assert.equal(state.overheated, true);
  }
  state = updateEnergy(state.energy, 0.1, true, state.overheated);
  assert.equal(state.energy, MAX_ENERGY);
  assert.equal(state.dashRatio, 0);
  assert.equal(state.overheated, false);

  const resumed = updateEnergy(state.energy, 0.1, true, state.overheated);
  assert.equal(resumed.dashRatio, 1);
  assert.ok(resumed.energy < MAX_ENERGY);
});

test('darts consume the shared energy pool and fail without enough energy', () => {
  const fired = consumeDartEnergy(DART_ENERGY_COST);
  assert.deepEqual(fired, { energy: 0, fired: true });
  assert.deepEqual(consumeDartEnergy(DART_ENERGY_COST - 1), {
    energy: DART_ENERGY_COST - 1,
    fired: false
  });
});

test('distance rings grant a strong bounded speed and energy reward', () => {
  assert.deepEqual(applyDistanceRingReward(32, 40, 70), {
    speed: 44,
    energy: 70,
    speedGain: 12,
    energyGain: 30
  });
  assert.deepEqual(applyDistanceRingReward(65, 90, 70), {
    speed: 70,
    energy: 100,
    speedGain: 5,
    energyGain: 10
  });
});

test('distance ring speed hold prevents deceleration for 3 seconds without blocking acceleration', () => {
  assert.equal(DIST_RING_SPEED_HOLD_SECONDS, 3);
  const held = maintainDistanceRingSpeed(38, 44, 3, .1);
  assert.deepEqual(held, { speed: 44, remaining: 2.9 });

  const faster = maintainDistanceRingSpeed(51, 44, 2.9, .1);
  assert.equal(faster.speed, 51);
  assert.ok(Math.abs(faster.remaining - 2.8) < 1e-9);

  const expired = maintainDistanceRingSpeed(38, 44, 0, .1);
  assert.deepEqual(expired, { speed: 38, remaining: 0 });
});

test('dash acceleration eases at high physical speeds and speed widens the camera FOV', () => {
  assert.ok(dashAcceleration(22) > dashAcceleration(60));
  assert.ok(speedFov(60, false) > speedFov(22, false));
  assert.ok(speedFov(60, true) > speedFov(60, false));
});

test('orbit camera keeps a constant radius from the craft at every look angle', () => {
  const radius = 16;
  // 자유 시점 전 범위를 훑어 기체까지의 거리가 흔들리지 않는지 확인합니다.
  for (let pitch = -LOOK_PITCH_LIMIT; pitch <= LOOK_PITCH_LIMIT; pitch += 0.15) {
    for (let yaw = -Math.PI; yaw <= Math.PI; yaw += 0.4) {
      const offset = orbitCameraOffset(yaw, pitch, radius);
      const distance = Math.hypot(offset.x, offset.y, offset.z);
      assert.ok(
        Math.abs(distance - radius) < 1e-9,
        `pitch ${pitch.toFixed(2)} yaw ${yaw.toFixed(2)} produced radius ${distance}`
      );
    }
  }
});

test('orbit camera sits level with the craft when the player has not looked around', () => {
  const level = orbitCameraOffset(0, 0, 16);

  // 위/아래 시야가 대칭이려면 기준면이 기체와 같은 높이여야 합니다.
  assert.ok(Math.abs(level.y) < 1e-9, `default height ${level.y} must be level with the craft`);
});

test('orbit camera mirrors looking up and looking down exactly', () => {
  const radius = 16;
  for (const angle of [0.2, 0.5, 0.9, LOOK_PITCH_LIMIT]) {
    const up = orbitCameraOffset(0, angle, radius);
    const down = orbitCameraOffset(0, -angle, radius);

    // 같은 크기의 입력은 위아래로 같은 높이만큼, 같은 수평거리에서 움직여야 합니다.
    assert.ok(Math.abs(up.y + down.y) < 1e-9, `asymmetric height at ${angle}: ${up.y} vs ${down.y}`);
    assert.ok(Math.abs(up.z - down.z) < 1e-9, `asymmetric horizontal reach at ${angle}`);
    assert.ok(Math.abs(up.x - down.x) < 1e-9, `asymmetric horizontal reach at ${angle}`);
  }
});

test('orbit camera yaw sweeps a full circle in the horizontal plane', () => {
  const radius = 16;
  const front = orbitCameraOffset(0, 0, radius);
  const back = orbitCameraOffset(Math.PI, 0, radius);
  const side = orbitCameraOffset(Math.PI / 2, 0, radius);

  // 정확한 구라면 yaw만 바뀔 때 높이는 그대로여야 합니다.
  assert.ok(Math.abs(front.y - back.y) < 1e-9, 'yaw must not change height');
  assert.ok(Math.abs(front.y - side.y) < 1e-9, 'yaw must not change height');
  assert.ok(Math.abs(front.z - radius) < 1e-9);
  assert.ok(Math.abs(back.z + radius) < 1e-9);
  assert.ok(Math.abs(side.x - radius) < 1e-9);
});

test('recentering eases the free look back toward the craft heading', () => {
  const state = { yaw: 1.2, pitch: -0.8 };
  const next = recenterFreeLook(state, 0.016);

  assert.ok(Math.abs(next.yaw) < Math.abs(state.yaw), 'yaw should shrink toward zero');
  assert.ok(Math.abs(next.pitch) < Math.abs(state.pitch), 'pitch should shrink toward zero');
  // 한 프레임에 끝내지 않고 부드럽게 이동해야 합니다.
  assert.ok(Math.abs(next.yaw) > 0, 'a single frame must not snap the view');
  assert.equal(Math.sign(next.yaw), Math.sign(state.yaw), 'recentering must not overshoot past zero');
  assert.equal(Math.sign(next.pitch), Math.sign(state.pitch), 'recentering must not overshoot past zero');
});

test('recentering converges to dead center and then reports completion', () => {
  let state = { yaw: -2.4, pitch: LOOK_PITCH_LIMIT };
  for (let i = 0; i < 240; i++) state = recenterFreeLook(state, 0.016);

  assert.ok(isFreeLookCentered(state), `did not settle: ${JSON.stringify(state)}`);
  assert.ok(Math.abs(state.yaw) < 1e-3);
  assert.ok(Math.abs(state.pitch) < 1e-3);
});

test('recentering takes the short way around instead of unwinding the long arc', () => {
  // 3.0rad은 -π 쪽 경계 근처라, 반대 방향으로 감으면 화면이 한 바퀴 도는 것처럼 보입니다.
  const state = { yaw: 3.0, pitch: 0 };
  const next = recenterFreeLook(state, 0.016);

  assert.ok(next.yaw < state.yaw, `yaw ${next.yaw} should ease down toward 0, not wrap past π`);
  assert.ok(next.yaw > 0, 'the short way to 0 from 3.0rad stays positive');
});

test('recentering is frame-rate independent over the same elapsed time', () => {
  const start = { yaw: 1.5, pitch: 0.9 };
  let fine = start;
  for (let i = 0; i < 8; i++) fine = recenterFreeLook(fine, 0.0125);
  const coarse = recenterFreeLook(start, 0.1);

  assert.ok(Math.abs(fine.yaw - coarse.yaw) < 1e-9, `${fine.yaw} vs ${coarse.yaw}`);
  assert.ok(Math.abs(fine.pitch - coarse.pitch) < 1e-9, `${fine.pitch} vs ${coarse.pitch}`);
});

test('a centered view is reported as centered and a turned one is not', () => {
  assert.equal(isFreeLookCentered({ yaw: 0, pitch: 0 }), true);
  assert.equal(isFreeLookCentered({ yaw: 0.4, pitch: 0 }), false);
  assert.equal(isFreeLookCentered({ yaw: 0, pitch: -0.4 }), false);
});
