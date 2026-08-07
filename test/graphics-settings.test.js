const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  DEFAULT_GRAPHICS_SETTINGS,
  disposeShadowResources,
  fogDensityForMode,
  fogDensityForVisibility,
  parseGraphicsSettings,
  resolveGraphicsSettings,
  serializeGraphicsSettings,
  sunPositionForTarget
} = require('../public/graphics-settings.js');

test('default graphics increase shadow detail and view distance over the legacy renderer', () => {
  const settings = parseGraphicsSettings(null);
  const resolved = resolveGraphicsSettings(settings, 2);

  assert.deepEqual(settings, DEFAULT_GRAPHICS_SETTINGS);
  assert.equal(settings.shadows, 'high');
  assert.equal(settings.viewDistance, 'far');
  assert.equal(resolved.shadow.enabled, true);
  assert.ok(resolved.shadow.mapSize >= 2048);
  assert.ok(resolved.cameraFar > 3000);
  assert.ok(resolved.fogDensity < 0.0026);
  assert.equal(resolved.pixelRatio, 2);
});

test('graphics settings persist valid choices and reject unknown values', () => {
  const selected = { ...DEFAULT_GRAPHICS_SETTINGS, resolution: 'enhanced', shadows: 'ultra', viewDistance: 'ultra' };
  assert.deepEqual(parseGraphicsSettings(serializeGraphicsSettings(selected)), selected);
  assert.deepEqual(parseGraphicsSettings('{"resolution":"bad","shadows":"bad","viewDistance":"bad"}'), DEFAULT_GRAPHICS_SETTINGS);
  assert.deepEqual(parseGraphicsSettings('not-json'), DEFAULT_GRAPHICS_SETTINGS);
});

test('graphics presets expose meaningful performance and quality ranges', () => {
  const performance = resolveGraphicsSettings({ resolution: 'performance', shadows: 'off', viewDistance: 'standard' }, 3);
  const ultra = resolveGraphicsSettings({ resolution: 'enhanced', shadows: 'ultra', viewDistance: 'ultra' }, 3);

  assert.equal(performance.pixelRatio, 1.5);
  assert.equal(performance.shadow.enabled, false);
  assert.equal(performance.cameraFar, 3000);
  assert.equal(ultra.pixelRatio, 3);
  assert.equal(ultra.shadow.mapSize, 4096);
  assert.ok(ultra.shadow.extent > 240);
  assert.ok(ultra.shadow.far > 850);
  assert.equal(ultra.cameraFar, 7500);
  assert.ok(ultra.fogDensity < performance.fogDensity);
});

test('sun position keeps a fixed downward light direction at every flight altitude', () => {
  assert.deepEqual(sunPositionForTarget({ x: 4, y: 150, z: -20 }), { x: 74, y: 260, z: 30 });
  assert.deepEqual(sunPositionForTarget({ x: -8, y: 420, z: -900 }), { x: 62, y: 530, z: -850 });
});

test('disabling shadows releases both primary and VSM render targets', () => {
  const calls = [];
  const shadow = {
    map: { dispose: () => calls.push('map') },
    mapPass: { dispose: () => calls.push('mapPass') }
  };

  disposeShadowResources(shadow);

  assert.deepEqual(calls, ['map', 'mapPass']);
  assert.equal(shadow.map, null);
  assert.equal(shadow.mapPass, null);
});

test('fog density matches the advertised distance at one percent visibility', () => {
  for (const distance of [3000, 5000, 7500]) {
    const density = fogDensityForVisibility(distance);
    const transmittance = Math.exp(-density * density * distance * distance);
    assert.ok(Math.abs(transmittance - 0.01) < 1e-9);
  }
});

test('arena preserves its lower fog density while distance mode uses the configured density', () => {
  const density = fogDensityForVisibility(5000);
  assert.equal(fogDensityForMode(density, 'DIST'), density);
  assert.ok(Math.abs(fogDensityForMode(density, 'ARENA') - density / 3) < 1e-18);
});

test('advanced effects default to a balanced high-quality configuration', () => {
  const settings = parseGraphicsSettings(null);
  const resolved = resolveGraphicsSettings(settings, 2);

  assert.deepEqual(
    {
      csm: settings.csm,
      gtao: settings.gtao,
      bloom: settings.bloom,
      fogQuality: settings.fogQuality,
      shadowSoftness: settings.shadowSoftness
    },
    { csm: 'high', gtao: 'medium', bloom: 'soft', fogQuality: 'atmospheric', shadowSoftness: 'soft' }
  );
  assert.equal(resolved.csm.cascades, 3);
  assert.equal(resolved.gtao.enabled, true);
  assert.equal(resolved.gtao.samples, 8);
  assert.equal(resolved.gtao.resolutionScale, 0.5);
  assert.equal(resolved.bloom.enabled, true);
  assert.ok(resolved.fog.altitudeFalloff > 0);
  assert.equal(resolved.shadowSoftness.type, 'pcf');
  assert.equal(resolved.shadowSoftness.radius, 4);
});

test('advanced effects can be disabled independently and invalid saved values fall back', () => {
  const settings = parseGraphicsSettings(JSON.stringify({
    csm: 'off', gtao: 'off', bloom: 'off', fogQuality: 'basic', shadowSoftness: 'hard'
  }));
  const resolved = resolveGraphicsSettings(settings, 1);

  assert.equal(resolved.csm.enabled, false);
  assert.equal(resolved.gtao.enabled, false);
  assert.equal(resolved.bloom.enabled, false);
  assert.equal(resolved.fog.altitudeFalloff, 0);
  assert.equal(resolved.shadowSoftness.type, 'pcf');

  const migrated = parseGraphicsSettings('{"csm":"bad","gtao":"bad","bloom":"bad","fogQuality":"bad","shadowSoftness":"bad"}');
  assert.equal(migrated.csm, DEFAULT_GRAPHICS_SETTINGS.csm);
  assert.equal(migrated.gtao, DEFAULT_GRAPHICS_SETTINGS.gtao);
  assert.equal(migrated.bloom, DEFAULT_GRAPHICS_SETTINGS.bloom);
  assert.equal(migrated.fogQuality, DEFAULT_GRAPHICS_SETTINGS.fogQuality);
  assert.equal(migrated.shadowSoftness, DEFAULT_GRAPHICS_SETTINGS.shadowSoftness);
});

test('ultra advanced effects increase cascade, GTAO, bloom, fog, and shadow samples', () => {
  const high = resolveGraphicsSettings(DEFAULT_GRAPHICS_SETTINGS, 2);
  const ultra = resolveGraphicsSettings({
    ...DEFAULT_GRAPHICS_SETTINGS,
    csm: 'ultra', gtao: 'ultra', bloom: 'ultra', fogQuality: 'cinematic', shadowSoftness: 'cinematic'
  }, 2);

  assert.ok(ultra.csm.cascades > high.csm.cascades);
  assert.ok(ultra.csm.maxFar > high.csm.maxFar);
  assert.ok(ultra.gtao.samples > high.gtao.samples);
  assert.ok(ultra.bloom.strength > high.bloom.strength);
  assert.ok(ultra.fog.sunTint > high.fog.sunTint);
  assert.ok(ultra.shadowSoftness.blurSamples > high.shadowSoftness.blurSamples);
});
