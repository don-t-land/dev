(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.flightControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PI2 = Math.PI * 2;
  const LOOK_PITCH_LIMIT = 1.35;

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

    const rollBeforeInput = roll;
    let rollDelta = 0;
    if (keys.KeyW) pitch -= 1.1 * step;
    if (keys.KeyS) pitch += 1.1 * step;
    if (keys.KeyA) rollDelta += 2 * step;
    if (keys.KeyD) rollDelta -= 2 * step;
    roll += rollDelta;

    if (mode === 'DIST') {
      const turnBank = normalizeAngle(rollBeforeInput + rollDelta / 2);
      pitch = normalizeAngle(pitch);
      roll = normalizeAngle(roll);
      yaw = normalizeAngle(yaw + Math.sin(turnBank) * 1.15 * step);
      return { yaw, pitch, roll };
    }

    if (!keys.KeyA && !keys.KeyD) roll *= Math.pow(0.12, step);
    if (!keys.KeyW && !keys.KeyS) pitch += (-0.09 - pitch) * (1 - Math.pow(0.35, step));

    pitch = Math.max(-0.95, Math.min(0.75, pitch));
    roll = Math.max(-0.95, Math.min(0.95, roll));
    yaw = normalizeAngle(yaw + roll * 1.15 * step);
    return { yaw, pitch, roll };
  }

  function updateFreeLook(state, movementX, movementY, sensitivity = 0.0022) {
    const yaw = normalizeAngle((Number(state.yaw) || 0) - (Number(movementX) || 0) * sensitivity);
    const pitch = Math.max(-LOOK_PITCH_LIMIT, Math.min(
      LOOK_PITCH_LIMIT,
      (Number(state.pitch) || 0) - (Number(movementY) || 0) * sensitivity
    ));
    return { yaw, pitch };
  }

  function keyGuideVisibleFromStorage(value) {
    return value !== '0';
  }

  return {
    normalizeAngle,
    updateAttitude,
    updateFreeLook,
    keyGuideVisibleFromStorage,
    LOOK_PITCH_LIMIT
  };
});
