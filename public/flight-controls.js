(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.flightControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PI2 = Math.PI * 2;
  const LOOK_PITCH_LIMIT = 1.35;
  // 1초에 남은 각도의 99.7%를 지우는 감쇠 — 카메라 추종과 비슷한 속도로 복귀합니다.
  const RECENTER_DECAY = 0.003;
  const RECENTER_EPSILON = 1e-3;
  const MAX_ENERGY = 100;
  const ENERGY_REGEN_PER_SECOND = 20;
  const DASH_ENERGY_PER_SECOND = 18;
  const DART_ENERGY_COST = 20;
  const DIST_RING_SPEED_BONUS = 12;
  const DIST_RING_ENERGY_BONUS = 30;
  const DIST_RING_SPEED_HOLD_SECONDS = 3;

  function normalizeAngle(angle) {
    let normalized = (Number(angle) + Math.PI) % PI2;
    if (normalized < 0) normalized += PI2;
    return normalized - Math.PI;
  }

  function updateAttitude(state, keys, dt, mode, controlEnvelope = null) {
    let yaw = Number(state.yaw) || 0;
    let pitch = Number(state.pitch) || 0;
    let roll = Number(state.roll) || 0;
    const step = Math.max(0, Math.min(Number(dt) || 0, 0.1));
    const envelope = controlEnvelope && typeof controlEnvelope === 'object' ? controlEnvelope : {};
    const finitePositive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
    const pitchRateScale = Math.max(.35, Math.min(2, finitePositive(envelope.pitchRateScale, 1)));
    const rollRateScale = Math.max(.35, Math.min(2, finitePositive(envelope.rollRateScale, 1)));
    const maxRoll = Math.max(.35, Math.min(1.4, finitePositive(envelope.maxRoll, .95)));
    const hasPitchEnvelope = Number.isFinite(envelope.maxPitchDown) && envelope.maxPitchDown > 0
      && Number.isFinite(envelope.maxPitchUp) && envelope.maxPitchUp > 0;
    const maxPitchDown = Math.max(.35, Math.min(1.4, finitePositive(envelope.maxPitchDown, .95)));
    const maxPitchUp = Math.max(.35, Math.min(1.4, finitePositive(envelope.maxPitchUp, .75)));

    if (keys.KeyW) pitch -= 1.1 * pitchRateScale * step;
    if (keys.KeyS) pitch += 1.1 * pitchRateScale * step;
    if (keys.KeyA) roll += 2 * rollRateScale * step;
    if (keys.KeyD) roll -= 2 * rollRateScale * step;

    // 두 모드는 동일한 제한 롤과 자동 수평 복원을 사용합니다.
    if (!keys.KeyA && !keys.KeyD) roll *= Math.pow(0.12, step);
    roll = Math.max(-maxRoll, Math.min(maxRoll, roll));

    if (mode === 'DIST') {
      pitch = hasPitchEnvelope
        ? Math.max(-maxPitchDown, Math.min(maxPitchUp, pitch))
        : normalizeAngle(pitch);
      yaw = normalizeAngle(yaw + roll * 1.15 * step);
      return { yaw, pitch, roll };
    }

    if (!keys.KeyW && !keys.KeyS) pitch += (-0.09 - pitch) * (1 - Math.pow(0.35, step));

    pitch = Math.max(-maxPitchDown, Math.min(maxPitchUp, pitch));
    yaw = normalizeAngle(yaw + roll * 1.15 * step);
    return { yaw, pitch, roll };
  }

  function updateFreeLook(state, movementX, movementY, sensitivity = 0.0022, invertY = false) {
    const yaw = normalizeAngle((Number(state.yaw) || 0) - (Number(movementX) || 0) * sensitivity);
    const pitchDirection = invertY ? 1 : -1;
    const pitch = Math.max(-LOOK_PITCH_LIMIT, Math.min(
      LOOK_PITCH_LIMIT,
      (Number(state.pitch) || 0) + (Number(movementY) || 0) * sensitivity * pitchDirection
    ));
    return { yaw, pitch };
  }

  // 기체를 정중앙에 둔 완전한 구면 궤도. 어느 각도에서든 반지름이 일정하고,
  // 위를 볼 때와 아래를 볼 때가 정확히 대칭입니다.
  function orbitCameraOffset(yaw, pitch, radius) {
    const orbitYaw = Number(yaw) || 0;
    const orbitPitch = Number(pitch) || 0;
    const orbitRadius = Number(radius) || 0;
    const horizontal = Math.cos(orbitPitch) * orbitRadius;
    return {
      x: Math.sin(orbitYaw) * horizontal,
      y: Math.sin(orbitPitch) * orbitRadius,
      z: Math.cos(orbitYaw) * horizontal
    };
  }

  // 자유 시점을 기체 정면으로 되돌립니다. yaw는 정규화된 최단 경로로 줄어들어
  // 한 바퀴 돌아가는 것처럼 보이지 않고, 감쇠는 프레임률과 무관합니다.
  function recenterFreeLook(state, dt) {
    const step = Math.max(0, Math.min(Number(dt) || 0, 0.1));
    const decay = Math.pow(RECENTER_DECAY, step);
    return {
      yaw: normalizeAngle(Number(state.yaw) || 0) * decay,
      pitch: (Number(state.pitch) || 0) * decay
    };
  }

  function isFreeLookCentered(state) {
    return Math.abs(normalizeAngle(Number(state.yaw) || 0)) < RECENTER_EPSILON
      && Math.abs(Number(state.pitch) || 0) < RECENTER_EPSILON;
  }

  function keyGuideVisibleFromStorage(value) {
    return value !== '0';
  }

  function mouseInvertYFromStorage(value) {
    return value === '1';
  }

  function updateEnergy(value, dt, wantsDash, overheated = false) {
    const step = Math.max(0, Math.min(Number(dt) || 0, 0.1));
    let energy = Math.max(0, Math.min(MAX_ENERGY, Number(value) || 0));
    const cooling = Boolean(overheated) || energy === 0;
    if (cooling) {
      energy = Math.min(MAX_ENERGY, energy + ENERGY_REGEN_PER_SECOND * step);
      return { energy, dashRatio: 0, overheated: energy < MAX_ENERGY };
    }
    if (!wantsDash || step === 0) {
      energy = Math.min(MAX_ENERGY, energy + ENERGY_REGEN_PER_SECOND * step);
      return { energy, dashRatio: 0, overheated: false };
    }

    const activeSeconds = Math.min(step, energy / DASH_ENERGY_PER_SECOND);
    energy = Math.max(0, energy - DASH_ENERGY_PER_SECOND * activeSeconds);
    return { energy, dashRatio: activeSeconds / step, overheated: energy === 0 };
  }

  function consumeDartEnergy(value) {
    const energy = Math.max(0, Math.min(MAX_ENERGY, Number(value) || 0));
    if (energy + 1e-9 < DART_ENERGY_COST) return { energy, fired: false };
    return { energy: energy - DART_ENERGY_COST, fired: true };
  }

  function applyDistanceRingReward(speed, energy, maxSpeed) {
    const currentSpeed = Math.max(0, Number(speed) || 0);
    const currentEnergy = Math.max(0, Math.min(MAX_ENERGY, Number(energy) || 0));
    const speedLimit = Math.max(currentSpeed, Number(maxSpeed) || currentSpeed);
    const rewardedSpeed = Math.min(speedLimit, currentSpeed + DIST_RING_SPEED_BONUS);
    const rewardedEnergy = Math.min(MAX_ENERGY, currentEnergy + DIST_RING_ENERGY_BONUS);
    return {
      speed: rewardedSpeed,
      energy: rewardedEnergy,
      speedGain: rewardedSpeed - currentSpeed,
      energyGain: rewardedEnergy - currentEnergy
    };
  }

  function maintainDistanceRingSpeed(speed, holdSpeed, remainingSeconds, dt) {
    const currentSpeed = Math.max(0, Number(speed) || 0);
    const floor = Math.max(0, Number(holdSpeed) || 0);
    const remaining = Math.max(0, Number(remainingSeconds) || 0);
    const step = Math.max(0, Math.min(Number(dt) || 0, .1));
    return {
      speed: remaining > 0 ? Math.max(currentSpeed, floor) : currentSpeed,
      remaining: Math.max(0, remaining - step)
    };
  }

  function dashAcceleration(speed) {
    const currentSpeed = Math.max(0, Number(speed) || 0);
    // 실제 물리 속도가 높을수록 가속을 완만하게 줄여 급격한 속도 점프를 막습니다.
    return 27 * Math.max(0.48, 1 - Math.max(0, currentSpeed - 22) / 85);
  }

  function speedFov(speed, dashing) {
    const currentSpeed = Math.max(0, Number(speed) || 0);
    const speedAmount = Math.max(0, Math.min(1, (currentSpeed - 18) / 44));
    return 58 + speedAmount * 12 + (dashing ? 3 : 0);
  }

  return {
    normalizeAngle,
    updateAttitude,
    updateFreeLook,
    orbitCameraOffset,
    recenterFreeLook,
    isFreeLookCentered,
    keyGuideVisibleFromStorage,
    mouseInvertYFromStorage,
    updateEnergy,
    consumeDartEnergy,
    applyDistanceRingReward,
    maintainDistanceRingSpeed,
    dashAcceleration,
    speedFov,
    LOOK_PITCH_LIMIT,
    MAX_ENERGY,
    ENERGY_REGEN_PER_SECOND,
    DASH_ENERGY_PER_SECOND,
    DART_ENERGY_COST,
    DIST_RING_SPEED_BONUS,
    DIST_RING_ENERGY_BONUS,
    DIST_RING_SPEED_HOLD_SECONDS
  };
});
