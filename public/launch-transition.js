(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.launchTransition = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function smoothstep(value, start, end) {
    const t = clamp01((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  }

  function getLaunchPose(progress) {
    const value = clamp01(progress);
    const dropAt = 0.68;
    const bodyTransition = smoothstep(value, 0.72, 0.94);
    const poofProgress = value < dropAt ? 0 : smoothstep(value, dropAt, 0.86);
    const poofOpacity = value < dropAt ? 0 : 1 - smoothstep(value, 0.78, 0.9);
    return {
      bodyPitch: (1 - bodyTransition) * Math.PI / 2,
      legsVisible: value < dropAt,
      poofProgress,
      poofOpacity,
      showFlightCraft: value >= 1
    };
  }

  function localDeadline(serverEnds, serverNow, localNow = Date.now(), fallbackDuration = 0) {
    const end = Number(serverEnds);
    const sent = Number(serverNow);
    const now = Number(localNow);
    const fallback = Math.max(0, Number(fallbackDuration) || 0);
    if (!Number.isFinite(end) || !Number.isFinite(sent) || !Number.isFinite(now))
      return (Number.isFinite(now) ? now : Date.now()) + fallback;
    return now + Math.max(0, end - sent);
  }

  function shouldReuseFoldedVisual(cachedKey, hasVisual, nextKey, expectsVisual) {
    return cachedKey === nextKey && Boolean(hasVisual) === Boolean(expectsVisual);
  }

  function getLaunchLayoutKey(mode, seed, order) {
    const count = Math.max(1, Array.isArray(order) ? order.length : 0);
    return `${mode === 'ARENA' ? 'ARENA' : 'DIST'}:${Number(seed) || 0}:${count}`;
  }

  return { getLaunchPose, localDeadline, shouldReuseFoldedVisual, getLaunchLayoutKey };
});
