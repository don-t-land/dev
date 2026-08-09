(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.flightControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PI2 = Math.PI * 2;
  const LOOK_PITCH_LIMIT = 1.35;
  const MAX_ENERGY = 100;
  const ENERGY_REGEN_PER_SECOND = 20;
  const DASH_ENERGY_PER_SECOND = 18;
  const DART_ENERGY_COST = 20;

  function normalizeAngle(angle) {
    let normalized = (Number(angle) + Math.PI) % PI2;
    if (normalized < 0) normalized += PI2;
    return normalized - Math.PI;
  }

  function updateAttitude(state, keys, dt, mode) {
    let yaw = Number(state.yaw) || 0;
    let pitch = Number(state.pitch) || 0;
    let roll = Number(state.roll) || 0;
    const step = Math.max(0, Math.min(Number(dt) || 0, 0.1));

    if (keys.KeyW) pitch -= 1.1 * step;
    if (keys.KeyS) pitch += 1.1 * step;
    if (keys.KeyA) roll += 2 * step;
    if (keys.KeyD) roll -= 2 * step;

    // 두 모드는 동일한 제한 롤과 자동 수평 복원을 사용합니다.
    if (!keys.KeyA && !keys.KeyD) roll *= Math.pow(0.12, step);
    roll = Math.max(-0.95, Math.min(0.95, roll));

    if (mode === 'DIST') {
      pitch = normalizeAngle(pitch);
      yaw = normalizeAngle(yaw + roll * 1.15 * step);
      return { yaw, pitch, roll };
    }

    if (!keys.KeyW && !keys.KeyS) pitch += (-0.09 - pitch) * (1 - Math.pow(0.35, step));

    pitch = Math.max(-0.95, Math.min(0.75, pitch));
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

  function keyGuideVisibleFromStorage(value) {
    return value !== '0';
  }

  function mouseInvertYFromStorage(value) {
    return value === '1';
  }

  function updateEnergy(value, dt, wantsDash) {
    const step = Math.max(0, Math.min(Number(dt) || 0, 0.1));
    let energy = Math.max(0, Math.min(MAX_ENERGY, Number(value) || 0));
    if (!wantsDash || step === 0) {
      energy = Math.min(MAX_ENERGY, energy + ENERGY_REGEN_PER_SECOND * step);
      return { energy, dashRatio: 0 };
    }
    if (energy === 0) return { energy, dashRatio: 0 };

    const activeSeconds = Math.min(step, energy / DASH_ENERGY_PER_SECOND);
    energy = Math.max(0, energy - DASH_ENERGY_PER_SECOND * activeSeconds);
    return { energy, dashRatio: activeSeconds / step };
  }

  function consumeDartEnergy(value) {
    const energy = Math.max(0, Math.min(MAX_ENERGY, Number(value) || 0));
    if (energy + 1e-9 < DART_ENERGY_COST) return { energy, fired: false };
    return { energy: energy - DART_ENERGY_COST, fired: true };
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
    keyGuideVisibleFromStorage,
    mouseInvertYFromStorage,
    updateEnergy,
    consumeDartEnergy,
    dashAcceleration,
    speedFov,
    LOOK_PITCH_LIMIT,
    MAX_ENERGY,
    ENERGY_REGEN_PER_SECOND,
    DASH_ENERGY_PER_SECOND,
    DART_ENERGY_COST
  };
});
