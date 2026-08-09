const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');

function loadPolicy() {
  return require('../public/audio-policy.js');
}

test('audio settings clamp valid values and recover malformed storage', () => {
  const { DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings, parseAudioSettings } = loadPolicy();

  assert.deepEqual(parseAudioSettings('{bad json'), DEFAULT_AUDIO_SETTINGS);
  assert.deepEqual(normalizeAudioSettings({
    master: 2,
    music: -1,
    sfx: 0.35,
    muted: 'yes',
    reducedAudio: true
  }), {
    version: 1,
    master: 1,
    music: 0,
    sfx: 0.35,
    muted: false,
    reducedAudio: true
  });
});

test('screen and authoritative phase map to distinct menu, folding, flight, and result music', () => {
  const { deriveAudioScene } = loadPolicy();

  assert.equal(deriveAudioScene({ screen: 'home' }), 'HOME');
  assert.equal(deriveAudioScene({ screen: 'room', phase: 'waiting' }), 'WAITING');
  assert.equal(deriveAudioScene({ phase: 'folding' }), 'FOLDING');
  assert.equal(deriveAudioScene({ phase: 'launch' }), 'LAUNCH');
  assert.equal(deriveAudioScene({ phase: 'playing', mode: 'DIST' }), 'FLIGHT_DIST');
  assert.equal(deriveAudioScene({ phase: 'playing', mode: 'ARENA' }), 'FLIGHT_ARENA');
  assert.equal(deriveAudioScene({ phase: 'results', showsResults: true }), 'RESULTS');
  assert.equal(deriveAudioScene({ phase: 'results', showsResults: false }), 'WAITING');
});

test('deadline cues fire once per crossed second, avoid catch-up bursts, and skip live arena', () => {
  const { deadlineCue } = loadPolicy();

  assert.equal(deadlineCue(10.2, 9.8, { enabled: true }), 10);
  assert.equal(deadlineCue(9.8, 9.2, { enabled: true }), null);
  assert.equal(deadlineCue(9.2, 3.4, { enabled: true }), 4);
  assert.equal(deadlineCue(2.1, 0.9, { enabled: true }), 1);
  assert.equal(deadlineCue(10.2, 9.8, { enabled: false }), null);
});

test('repeated server phase snapshots emit launch and start stings only once per round', () => {
  const { createPhaseEventState, phaseTransitionEvent } = loadPolicy();
  const state = createPhaseEventState();

  assert.equal(phaseTransitionEvent(state, { phase: 'launch', mode: 'DIST', seed: 42 }), 'launch');
  assert.equal(phaseTransitionEvent(state, { phase: 'launch', mode: 'DIST', seed: 42 }), null);
  assert.equal(phaseTransitionEvent(state, { phase: 'playing', mode: 'DIST', seed: 42 }), 'start');
  assert.equal(phaseTransitionEvent(state, { phase: 'playing', mode: 'DIST', seed: 42 }), null);
  assert.equal(phaseTransitionEvent(state, { phase: 'playing', mode: 'DIST', seed: 43 }), 'start');
  assert.equal(phaseTransitionEvent(state, { phase: 'playing', mode: 'ARENA', seed: 43 }), 'start');
  assert.equal(phaseTransitionEvent(state, { phase: 'results', mode: 'ARENA', seed: 43 }), 'result');
  assert.equal(phaseTransitionEvent(state, { phase: 'results', mode: 'ARENA', seed: 43 }), null);
});

test('flight ambience parameters are bounded, silent when dead, and stronger while dashing', () => {
  const { windParams } = loadPolicy();

  assert.deepEqual(windParams({ speed: 100, dashing: false, alive: false }), { gain: 0, frequency: 240 });
  const cruise = windParams({ speed: 30, dashing: false, alive: true });
  const dash = windParams({ speed: 30, dashing: true, alive: true });
  assert.ok(cruise.gain > 0 && cruise.gain <= 0.32);
  assert.ok(dash.gain > cruise.gain);
  assert.ok(dash.frequency > cruise.frequency);
});

test('procedural audio engine defines original scene arrangements and detailed game SFX', () => {
  const engine = fs.readFileSync(path.join(projectRoot, 'public/audio-engine.js'), 'utf8');

  for (const scene of ['HOME', 'WAITING', 'FOLDING', 'LAUNCH', 'FLIGHT_DIST', 'FLIGHT_ARENA', 'RESULTS']) {
    assert.match(engine, new RegExp(`${scene}:`));
  }
  for (const effect of ['uiClick', 'uiHover', 'select', 'ready', 'countdown', 'start', 'finalTen', 'launch', 'dash', 'fire', 'pickup', 'hit', 'crash', 'score', 'respawn', 'result']) {
    assert.match(engine, new RegExp(`${effect}\\(`));
  }
  assert.match(engine, /createDynamicsCompressor/);
  assert.match(engine, /createBufferSource/);
  assert.match(engine, /setFlight\(state\)/);
  assert.match(engine, /visibilitychange/);
  const canPlayBody = engine.match(/function canPlay\(name\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.doesNotMatch(canPlayBody, /ensureContext/);
  assert.match(canPlayBody, /context.*state.*running/);
  assert.match(engine, /nextNoteTime/);
  assert.match(engine, /while \(layer\.nextNoteTime/);
  assert.match(engine, /setInterval\(schedule, 25\)/);
  assert.match(engine, /stepsPerBeat:\s*[24]/);
  assert.match(engine, /chords:\s*\[/);
  assert.match(engine, /drums:\s*['"][^'"]*[KSH][^'"]*['"]/);
  for (const layer of ['kick', 'snare', 'hat', 'chordStab']) assert.match(engine, new RegExp(`function ${layer}\\(`));
  assert.match(engine, /section.*%/);
  assert.match(engine, /addUnlockListeners\(\)/);
});

test('client loads audio before the game module and wires scenes, cues, actions, and settings', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');
  const policyIndex = html.indexOf('<script src="./audio-policy.js"></script>');
  const engineIndex = html.indexOf('<script src="./audio-engine.js"></script>');
  const moduleIndex = html.indexOf('<script type="module">');

  assert.ok(policyIndex >= 0 && engineIndex > policyIndex && moduleIndex > engineIndex);
  for (const id of ['audio-quick-toggle', 'settings-quick-toggle', 'audio-muted', 'audio-master', 'audio-music', 'audio-sfx', 'audio-reduced']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /function updateAudioQuickToggle/);
  assert.match(html, /let liveSpawnGeneration = 0/);
  assert.match(html, /liveSpawnGeneration\+\+ === 0[\s\S]*audioDirector\.play\('start'\)[\s\S]*audioDirector\.play\('respawn'\)/);
  assert.match(html, /case 'spawned':[\s\S]{0,1800}audioDirector\.setScene\('FLIGHT_ARENA'\)/);
  assert.match(html, /createAudioDirector/);
  assert.match(html, /audioDirector\.setScene/);
  assert.match(html, /audioDirector\.updateDeadline/);
  assert.match(html, /audioDirector\.setFlight/);
  assert.match(html, /audioDirector\.play\('fire'\)/);
  assert.match(html, /audioDirector\.play\('crash'\)/);
  assert.match(html, /audioDirector\.play\('pickup'\)/);
  assert.match(html, /paper-plane-selected[\s\S]*audioDirector\.play\('select'\)/);
  assert.doesNotMatch(html, /function showResults\(results\) \{[\s\S]{0,220}audioDirector\.play\('result'\)/);
});

test('leaving a round silences flight ambience before the server acknowledgement', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf8');
  const leaveBody = html.match(/function requestRoundLeave\(\) \{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(leaveBody, /game\.phase = 'leaving'/);
  assert.match(leaveBody, /game\.frozen = true/);
  assert.match(leaveBody, /audioDirector\.setFlight\(\{[^}]*alive:\s*false[^}]*\}\)/);
  assert.match(leaveBody, /audioDirector\.setScene\('HOME'\)/);
  assert.match(leaveBody, /audioDirector\.updateDeadline\(NaN\)/);
  assert.match(leaveBody, /send\(\{ t: 'leave' \}\)/);
  assert.match(html, /\$\('pause-leave-btn'\)\.addEventListener\('click',[\s\S]{0,220}requestRoundLeave\(\)/);
  assert.match(html, /\$\('respawn-leave-btn'\)\.addEventListener\('click',[\s\S]{0,260}requestRoundLeave\(\)/);
});
