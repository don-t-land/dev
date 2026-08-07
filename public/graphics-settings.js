(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.graphicsSettingsPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_GRAPHICS_SETTINGS = Object.freeze({
    resolution: 'native',
    shadows: 'high',
    viewDistance: 'far',
    csm: 'high',
    gtao: 'medium',
    bloom: 'soft',
    fogQuality: 'atmospheric',
    shadowSoftness: 'soft'
  });

  const VALID = Object.freeze({
    resolution: new Set(['performance', 'native', 'enhanced']),
    shadows: new Set(['off', 'medium', 'high', 'ultra']),
    viewDistance: new Set(['standard', 'far', 'ultra']),
    csm: new Set(['off', 'high', 'ultra']),
    gtao: new Set(['off', 'medium', 'high', 'ultra']),
    bloom: new Set(['off', 'soft', 'high', 'ultra']),
    fogQuality: new Set(['basic', 'atmospheric', 'cinematic']),
    shadowSoftness: new Set(['hard', 'soft', 'cinematic'])
  });

  const SHADOW_PRESETS = Object.freeze({
    off: Object.freeze({ enabled: false, mapSize: 0, extent: 0, far: 0 }),
    medium: Object.freeze({ enabled: true, mapSize: 1024, extent: 160, far: 550 }),
    high: Object.freeze({ enabled: true, mapSize: 2048, extent: 240, far: 850 }),
    ultra: Object.freeze({ enabled: true, mapSize: 4096, extent: 360, far: 1300 })
  });

  function fogDensityForVisibility(distance, transmittance = 0.01) {
    const safeDistance = Math.max(1, Number(distance) || 1);
    const safeTransmittance = Math.min(0.999999, Math.max(0.000001, Number(transmittance) || 0.01));
    return Math.sqrt(-Math.log(safeTransmittance)) / safeDistance;
  }

  function fogDensityForMode(density, mode) {
    return Number(density) * (mode === 'ARENA' ? 1 / 3 : 1);
  }

  const VIEW_PRESETS = Object.freeze({
    standard: Object.freeze({ cameraFar: 3000, fogDensity: fogDensityForVisibility(3000) }),
    far: Object.freeze({ cameraFar: 5000, fogDensity: fogDensityForVisibility(5000) }),
    ultra: Object.freeze({ cameraFar: 7500, fogDensity: fogDensityForVisibility(7500) })
  });

  const CSM_PRESETS = Object.freeze({
    off: Object.freeze({ enabled: false, cascades: 0, maxFar: 0 }),
    high: Object.freeze({ enabled: true, cascades: 3, maxFar: 1800 }),
    ultra: Object.freeze({ enabled: true, cascades: 4, maxFar: 3200 })
  });

  const GTAO_PRESETS = Object.freeze({
    off: Object.freeze({ enabled: false, blendIntensity: 0, radius: 0, samples: 0, denoiseSamples: 0, resolutionScale: 0.5 }),
    medium: Object.freeze({ enabled: true, blendIntensity: 0.5, radius: 0.2, samples: 8, denoiseSamples: 8, resolutionScale: 0.5 }),
    high: Object.freeze({ enabled: true, blendIntensity: 0.72, radius: 0.28, samples: 16, denoiseSamples: 16, resolutionScale: 0.75 }),
    ultra: Object.freeze({ enabled: true, blendIntensity: 0.9, radius: 0.36, samples: 24, denoiseSamples: 24, resolutionScale: 1 })
  });

  const BLOOM_PRESETS = Object.freeze({
    off: Object.freeze({ enabled: false, strength: 0, radius: 0, threshold: 2 }),
    soft: Object.freeze({ enabled: true, strength: 0.18, radius: 0.2, threshold: 1.6 }),
    high: Object.freeze({ enabled: true, strength: 0.32, radius: 0.35, threshold: 1.35 }),
    ultra: Object.freeze({ enabled: true, strength: 0.5, radius: 0.5, threshold: 1.1 })
  });

  const FOG_QUALITY_PRESETS = Object.freeze({
    basic: Object.freeze({ altitudeFalloff: 0, sunTint: 0 }),
    atmospheric: Object.freeze({ altitudeFalloff: 0.35, sunTint: 0.18 }),
    cinematic: Object.freeze({ altitudeFalloff: 0.52, sunTint: 0.32 })
  });

  const SHADOW_SOFTNESS_PRESETS = Object.freeze({
    hard: Object.freeze({ type: 'pcf', radius: 1, blurSamples: 4 }),
    soft: Object.freeze({ type: 'pcf', radius: 4, blurSamples: 4 }),
    cinematic: Object.freeze({ type: 'vsm', radius: 16, blurSamples: 24 })
  });

  function sunPositionForTarget(target, offset = { x: 70, y: 110, z: 50 }) {
    return {
      x: Number(target.x) + Number(offset.x),
      y: Number(target.y) + Number(offset.y),
      z: Number(target.z) + Number(offset.z)
    };
  }

  function disposeShadowResources(shadow) {
    if (!shadow) return;
    for (const key of ['map', 'mapPass']) {
      if (shadow[key] && typeof shadow[key].dispose === 'function') shadow[key].dispose();
      shadow[key] = null;
    }
  }

  function normalizeGraphicsSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      resolution: VALID.resolution.has(source.resolution) ? source.resolution : DEFAULT_GRAPHICS_SETTINGS.resolution,
      shadows: VALID.shadows.has(source.shadows) ? source.shadows : DEFAULT_GRAPHICS_SETTINGS.shadows,
      viewDistance: VALID.viewDistance.has(source.viewDistance) ? source.viewDistance : DEFAULT_GRAPHICS_SETTINGS.viewDistance,
      csm: VALID.csm.has(source.csm) ? source.csm : DEFAULT_GRAPHICS_SETTINGS.csm,
      gtao: VALID.gtao.has(source.gtao) ? source.gtao : DEFAULT_GRAPHICS_SETTINGS.gtao,
      bloom: VALID.bloom.has(source.bloom) ? source.bloom : DEFAULT_GRAPHICS_SETTINGS.bloom,
      fogQuality: VALID.fogQuality.has(source.fogQuality) ? source.fogQuality : DEFAULT_GRAPHICS_SETTINGS.fogQuality,
      shadowSoftness: VALID.shadowSoftness.has(source.shadowSoftness) ? source.shadowSoftness : DEFAULT_GRAPHICS_SETTINGS.shadowSoftness
    };
  }

  function parseGraphicsSettings(value) {
    if (typeof value !== 'string' || !value) return { ...DEFAULT_GRAPHICS_SETTINGS };
    try {
      return normalizeGraphicsSettings(JSON.parse(value));
    } catch (_) {
      return { ...DEFAULT_GRAPHICS_SETTINGS };
    }
  }

  function serializeGraphicsSettings(value) {
    return JSON.stringify(normalizeGraphicsSettings(value));
  }

  function resolveGraphicsSettings(value, deviceScale = 1) {
    const settings = normalizeGraphicsSettings(value);
    const dpr = Math.max(1, Number(deviceScale) || 1);
    const resolution = {
      performance: Math.min(dpr * 0.75, 1.5),
      native: Math.min(dpr, 2),
      enhanced: Math.min(dpr * 1.25, 3)
    }[settings.resolution];
    const shadow = SHADOW_PRESETS[settings.shadows];
    const view = VIEW_PRESETS[settings.viewDistance];
    return {
      settings,
      pixelRatio: resolution,
      shadow: { ...shadow },
      cameraFar: view.cameraFar,
      fogDensity: view.fogDensity,
      csm: { ...CSM_PRESETS[settings.csm] },
      gtao: { ...GTAO_PRESETS[settings.gtao] },
      bloom: { ...BLOOM_PRESETS[settings.bloom] },
      fog: { ...FOG_QUALITY_PRESETS[settings.fogQuality] },
      shadowSoftness: { ...SHADOW_SOFTNESS_PRESETS[settings.shadowSoftness] }
    };
  }

  return {
    BLOOM_PRESETS,
    CSM_PRESETS,
    DEFAULT_GRAPHICS_SETTINGS,
    FOG_QUALITY_PRESETS,
    GTAO_PRESETS,
    SHADOW_PRESETS,
    SHADOW_SOFTNESS_PRESETS,
    VIEW_PRESETS,
    disposeShadowResources,
    fogDensityForMode,
    fogDensityForVisibility,
    normalizeGraphicsSettings,
    parseGraphicsSettings,
    serializeGraphicsSettings,
    resolveGraphicsSettings,
    sunPositionForTarget
  };
});
