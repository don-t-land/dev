const assert = require('node:assert/strict');
const test = require('node:test');

const {
  toggleMinimapMode, createMinimapView, projectMinimapPoint, shouldRenderMinimap,
  approachThermalIntensity, approachDashIntensity, announcementSpec, enqueueBoundedAnnouncement,
  respawnPresentation, authoritativeCrashAction, advancePaperFragment,
  createRespawnRetryController
} = require('../public/hud-policy.js');

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`);
}

test('respawn ignores a stale queued retry after cancel and restart', () => {
  const sent = [];
  const scheduled = [];
  let requestSequence = 0;
  const controller = createRespawnRetryController({
    send: message => sent.push(message),
    createRequestId: () => `respawn-stale-${++requestSequence}`,
    schedule: callback => { scheduled.push(callback); return scheduled.length; },
    cancelSchedule: () => {},
    maxRetries: 3
  });

  controller.start();
  controller.handleError('RESPAWN_COOLDOWN', 'respawn-stale-1');
  const staleRetry = scheduled.shift();
  controller.cancel();
  controller.start();
  staleRetry();

  assert.equal(sent.length, 2, 'stale callback must not send inside the new respawn generation');
});
