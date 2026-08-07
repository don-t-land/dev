(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.gameAudioPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_AUDIO_SETTINGS = Object.freeze({
    version: 1, master: 0.8, music: 0.55, sfx: 0.8, muted: false, reducedAudio: false
  });

  const clamp01 = value => Number.isFinite(Number(value))
    ? Math.max(0, Math.min(1, Number(value)))
    : null;

  function normalizeAudioSettings(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      version: 1,
      master: clamp01(input.master) ?? DEFAULT_AUDIO_SETTINGS.master,
      music: clamp01(input.music) ?? DEFAULT_AUDIO_SETTINGS.music,
      sfx: clamp01(input.sfx) ?? DEFAULT_AUDIO_SETTINGS.sfx,
      muted: typeof input.muted === 'boolean' ? input.muted : DEFAULT_AUDIO_SETTINGS.muted,
      reducedAudio: typeof input.reducedAudio === 'boolean' ? input.reducedAudio : DEFAULT_AUDIO_SETTINGS.reducedAudio
    };
  }

  function parseAudioSettings(serialized) {
    if (typeof serialized !== 'string' || !serialized) return { ...DEFAULT_AUDIO_SETTINGS };
    try { return normalizeAudioSettings(JSON.parse(serialized)); }
    catch (_) { return { ...DEFAULT_AUDIO_SETTINGS }; }
  }

  function deriveAudioScene(state) {
    const value = state || {};
    if (value.phase === 'results') return value.showsResults === false ? 'WAITING' : 'RESULTS';
    if (value.phase === 'playing' || value.phase === 'live')
      return value.mode === 'ARENA' ? 'FLIGHT_ARENA' : 'FLIGHT_DIST';
    if (value.phase === 'launch' || value.phase === 'countdown') return 'LAUNCH';
    if (value.phase === 'folding') return 'FOLDING';
    if (value.screen === 'room' || value.phase === 'waiting') return 'WAITING';
    return 'HOME';
  }

  // Returns only the newest crossed integer. This deliberately prevents a stalled tab
  // from replaying every missed cue when it becomes visible again.
  function deadlineCue(previousSeconds, currentSeconds, options) {
    if (!options?.enabled) return null;
    const previous = Number(previousSeconds), current = Number(currentSeconds);
    if (!Number.isFinite(previous) || !Number.isFinite(current) || current >= previous) return null;
    const cue = Math.ceil(current);
    if (cue < 1 || cue > 10 || previous < cue) return null;
    return cue;
  }

  function createPhaseEventState() {
    return { round: null, launch: false, start: false, result: false, phase: null };
  }

  function phaseTransitionEvent(state, snapshot) {
    if (!state || !snapshot) return null;
    const round = `${snapshot.mode || 'UNKNOWN'}:${String(snapshot.seed ?? 'no-seed')}`;
    if (state.round !== round) {
      state.round = round;
      state.launch = false;
      state.start = false;
      state.result = false;
      state.phase = null;
    }
    const phase = snapshot.phase;
    let event = null;
    if (phase === 'launch' && !state.launch) {
      state.launch = true;
      event = 'launch';
    } else if (phase === 'playing' && !state.start) {
      state.start = true;
      event = 'start';
    } else if (phase === 'results' && !state.result) {
      state.result = true;
      event = 'result';
    }
    state.phase = phase;
    return event;
  }

  function windParams(state) {
    const alive = Boolean(state?.alive);
    const speed = Math.max(0, Math.min(100, Number(state?.speed) || 0));
    if (!alive) return { gain: 0, frequency: 240 };
    const dash = Boolean(state?.dashing);
    return {
      gain: Math.min(0.32, 0.025 + speed / 430 + (dash ? 0.075 : 0)),
      frequency: Math.min(1800, 240 + speed * 12 + (dash ? 260 : 0))
    };
  }

  return {
    DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings, parseAudioSettings,
    deriveAudioScene, deadlineCue, createPhaseEventState, phaseTransitionEvent, windParams
  };
});
