(function exposeFlightWorldState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.flightWorldState = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const TIME_SEGMENT_SECONDS = 55;
  const TIME_PHASES = Object.freeze([
    Object.freeze({ id: 'day', label: '낮' }),
    Object.freeze({ id: 'night', label: '밤' }),
    Object.freeze({ id: 'dawn', label: '새벽' })
  ]);

  function mulberry32(seed) {
    let value = Number(seed) >>> 0;
    return function random() {
      value |= 0;
      value = value + 0x6D2B79F5 | 0;
      let result = Math.imul(value ^ value >>> 15, 1 | value);
      result = result + Math.imul(result ^ result >>> 7, 61 | result) ^ result;
      return ((result ^ result >>> 14) >>> 0) / 4294967296;
    };
  }

  function startingTimeIndex(seed) {
    return Math.floor(mulberry32((Number(seed) ^ 0x71d3a5b9) >>> 0)() * TIME_PHASES.length);
  }

  function timeOfDayAt(seed, elapsedSeconds, segmentSeconds = TIME_SEGMENT_SECONDS) {
    const duration = Math.max(1, Number(segmentSeconds) || TIME_SEGMENT_SECONDS);
    const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
    const position = startingTimeIndex(seed) + elapsed / duration;
    const phaseIndex = Math.floor(position) % TIME_PHASES.length;
    const linearT = position - Math.floor(position);
    const t = linearT * linearT * (3 - 2 * linearT);
    return {
      from: TIME_PHASES[phaseIndex],
      to: TIME_PHASES[(phaseIndex + 1) % TIME_PHASES.length],
      t,
      label: linearT < .5 ? TIME_PHASES[phaseIndex].label : TIME_PHASES[(phaseIndex + 1) % TIME_PHASES.length].label
    };
  }

  const BALLOON_ASSETS = Object.freeze([
    'hot-air-balloon-a',
    'hot-air-balloon-b',
    'hot-air-balloon-c'
  ]);
  const AIRSHIP_ASSETS = Object.freeze(['airship-g', 'airship-h']);

  function buildArenaFlyObjects(seed, arenaRadius) {
    const radius = Math.max(100, Number(arenaRadius) || 720);
    const rng = mulberry32((Number(seed) ^ 0xb41100af) >>> 0);
    return Array.from({ length: 7 }, (_, index) => {
      const type = index % 3 === 2 ? 'balloon-airship' : 'hot-air-balloon';
      const assets = type === 'balloon-airship' ? AIRSHIP_ASSETS : BALLOON_ASSETS;
      const assetKey = assets[Math.floor(rng() * assets.length)];
      const angle = rng() * Math.PI * 2;
      const orbitRadius = radius * (.38 + rng() * .42);
      return {
        type,
        assetKey,
        x: Math.cos(angle) * orbitRadius,
        y: 115 + rng() * 155,
        z: Math.sin(angle) * orbitRadius,
        scale: type === 'balloon-airship' ? .8 + rng() * .32 : .72 + rng() * .38,
        phase: rng() * Math.PI * 2,
        drift: .035 + rng() * .035,
        orbitRadius,
        angle
      };
    });
  }

  function isFinishCrossed(z, distanceLength) {
    const position = Number(z);
    const length = Number(distanceLength);
    return Number.isFinite(position) && Number.isFinite(length) && length > 0 && position <= -length;
  }

  return {
    TIME_PHASES,
    TIME_SEGMENT_SECONDS,
    startingTimeIndex,
    timeOfDayAt,
    buildArenaFlyObjects,
    isFinishCrossed
  };
});
