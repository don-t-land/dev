(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.graphicsSettingsPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_GRAPHICS_SETTINGS = Object.freeze({
    resolution: 'native',
    shadows: 'high',
    viewDistance: 'far'
  });

  const VALID = Object.freeze({
    resolution: new Set(['performance', 'native', 'enhanced']),
    shadows: new Set(['off', 'medium', 'high', 'ultra']),
    viewDistance: new Set(['standard', 'far', 'ultra'])
  });

  const SHADOW_PRESETS = Object.freeze({
    off: Object.freeze({ enabled: false, mapSize: 0, extent: 0, far: 0 }),
    medium: Object.freeze({ enabled: true, mapSize: 1024, extent: 160, far: 550 }),
    high: Object.freeze({ enabled: true, mapSize: 2048, extent: 240, far: 850 }),
    ultra: Object.freeze({ enabled: true, mapSize: 4096, extent: 360, far: 1300 })
  });

  const VIEW_PRESETS = Object.freeze({
    standard: Object.freeze({ cameraFar: 3000, fogDensity: 0.0026 }),
    far: Object.freeze({ cameraFar: 5000, fogDensity: 0.00145 }),
    ultra: Object.freeze({ cameraFar: 7500, fogDensity: 0.0009 })
  });

  function normalizeGraphicsSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      resolution: VALID.resolution.has(source.resolution) ? source.resolution : DEFAULT_GRAPHICS_SETTINGS.resolution,
      shadows: VALID.shadows.has(source.shadows) ? source.shadows : DEFAULT_GRAPHICS_SETTINGS.shadows,
      viewDistance: VALID.viewDistance.has(source.viewDistance) ? source.viewDistance : DEFAULT_GRAPHICS_SETTINGS.viewDistance
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
      fogDensity: view.fogDensity
    };
  }

  return {
    DEFAULT_GRAPHICS_SETTINGS,
    SHADOW_PRESETS,
    VIEW_PRESETS,
    normalizeGraphicsSettings,
    parseGraphicsSettings,
    serializeGraphicsSettings,
    resolveGraphicsSettings
  };
});
