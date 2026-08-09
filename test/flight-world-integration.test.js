'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
const decor = fs.readFileSync(path.join(projectRoot, 'public', 'flight-world-decor.js'), 'utf8');
const worldState = fs.readFileSync(path.join(projectRoot, 'public', 'flight-world-state.js'), 'utf8');
const server = fs.readFileSync(path.join(projectRoot, 'server.js'), 'utf8');

test('distance mode renders and authoritatively handles the 7.5km finish line', () => {
  assert.match(html, /createFinishLine\(DIST_LEN, finishHalfWidth\)/);
  assert.match(html, /isFinishCrossed\(craft\.position\.z, DIST_LEN\)/);
  assert.match(html, /send\(\{ t: 'finish' \}\)/);
  assert.match(decor, /root\.name = 'distance-finish-line'/);
  assert.match(decor, /fillText\('FINISH'/);
  assert.match(server, /function onFinish\(room, player\)/);
  assert.match(server, /player\.score = DIST_LEN/);
});

test('gameplay uses only biome palettes without a time-of-day cycle or HUD', () => {
  assert.match(html, /function applyBiomeVisuals\(\)/);
  assert.match(html, /activeFogBase\.copy\(baseWorldPalette\.fog\)/);
  assert.match(html, /sky\.material\.uniforms\.uTop\.value\.copy\(baseWorldPalette\.top\)/);
  assert.doesNotMatch(html, /timeOfDay|worldTime|time-badge|TIME_LOOKS|현재 시간/);
  assert.doesNotMatch(worldState, /TIME_PHASES|TIME_SEGMENT|timeOfDay|startingTimeIndex/);
});

test('survival mode installs animated hot-air balloons and balloon airships', () => {
  assert.match(html, /buildArenaFlyObjects\(seed, ARENA_R\)/);
  assert.match(html, /animateArenaFlyObjects\(arenaFlyObjects, elapsed\)/);
  assert.match(decor, /function makeHotAirBalloon/);
  assert.match(decor, /function makeBalloonAirship/);
});

test('energy and speed use segmented game-style meter bars', () => {
  assert.match(html, /ENERGY · 에너지/);
  assert.match(html, /SPEED · 속도/);
  assert.match(html, /repeating-linear-gradient\(108deg/);
  assert.match(html, /id="energy" role="meter"/);
  assert.match(html, /id="gauge" role="meter"/);
  assert.match(html, /const maxSpeedKmh = Math\.floor\(aeroProfile\.maxSpeed \* 3\.6\)/);
  assert.match(html, /'gauge'\)\.setAttribute\('aria-valuemax', String\(maxSpeedKmh\)\)/);
  assert.match(html, /'gauge'\)\.setAttribute\('aria-valuenow', String\(Math\.min\(maxSpeedKmh, speedKmh\)\)\)/);
});
