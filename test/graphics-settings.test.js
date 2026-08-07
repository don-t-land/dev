const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  DEFAULT_GRAPHICS_SETTINGS,
  parseGraphicsSettings,
  resolveGraphicsSettings,
  serializeGraphicsSettings
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
  const selected = { resolution: 'enhanced', shadows: 'ultra', viewDistance: 'ultra' };
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
