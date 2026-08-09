'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
const decor = fs.readFileSync(path.join(projectRoot, 'public', 'flight-world-decor.js'), 'utf8');
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

test('game entry time of day flows through sky, fog, lights, and exposure', () => {
  assert.match(html, /window\.flightWorldState\.timeOfDayAt\(worldTimeSeed, worldTimeElapsed\)/);
  assert.match(html, /activeFogBase\.copy\(baseWorldPalette\.fog\)/);
  assert.match(html, /hemisphere\.intensity = look\.hemiPower/);
  assert.match(html, /renderer\.toneMappingExposure = look\.exposure/);
  assert.match(html, /worldTimeElapsed \+= dt/);
  assert.match(html, /id="time-badge"/);
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
});
