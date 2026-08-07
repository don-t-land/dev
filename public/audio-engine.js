(function (root) {
  'use strict';

  const policy = root.gameAudioPolicy;
  const STORAGE_KEY = 'pp_audio';
  const SCENES = Object.freeze({
    // Bright arcade-pop loops: 16-step hooks, four-bar chord cycles, bass and drum grooves.
    HOME: {
      tempo: 126, stepsPerBeat: 2, wave: 'triangle',
      notes: [72, null, 76, 79, 81, null, 79, 76, 74, null, 76, 79, 84, 81, 79, 76],
      chords: [[60,64,67], [57,60,64], [65,69,72], [67,71,74]], bass: [36,45,41,43],
      drums: 'K.H.S.H.K.H.SHH.', gain: .13
    },
    WAITING: {
      tempo: 132, stepsPerBeat: 2, wave: 'square',
      notes: [74,78,81,null,86,81,78,null,76,79,83,null,88,83,79,null],
      chords: [[62,66,69], [59,62,66], [67,71,74], [69,73,76]], bass: [38,47,43,45],
      drums: 'K.H.S.H.KKHS.HH.', gain: .12
    },
    FOLDING: {
      tempo: 136, stepsPerBeat: 2, wave: 'triangle',
      notes: [69,73,76,81,78,76,73,null,71,74,78,83,81,78,74,null],
      chords: [[57,61,64], [54,57,61], [62,66,69], [64,68,71]], bass: [33,42,38,40],
      drums: 'K.H.SHH.K.H.S.H.', gain: .12
    },
    LAUNCH: {
      tempo: 150, stepsPerBeat: 4, wave: 'square',
      notes: [67,null,74,79,71,null,76,83,74,null,79,86,76,79,83,86],
      chords: [[55,59,62], [57,60,64], [59,62,66], [60,64,67]], bass: [31,33,35,36],
      drums: 'K.HHK.HSKKHHSHHH', gain: .105
    },
    FLIGHT_DIST: {
      tempo: 144, stepsPerBeat: 4, wave: 'sawtooth',
      notes: [72,null,76,79,84,79,76,null,74,null,77,81,86,81,77,null],
      chords: [[60,64,67], [57,60,64], [65,69,72], [67,71,74]], bass: [36,45,41,43],
      drums: 'K.HHK.HSK.HHKSHH', gain: .105
    },
    FLIGHT_ARENA: {
      tempo: 160, stepsPerBeat: 4, wave: 'square',
      notes: [76,null,79,83,88,83,79,76,74,null,79,83,86,83,79,null],
      chords: [[52,55,59], [48,52,55], [55,59,62], [57,60,64]], bass: [28,36,31,33],
      drums: 'KHHHSHHKK.HHSHHK', gain: .095
    },
    RESULTS: {
      tempo: 126, stepsPerBeat: 2, wave: 'triangle',
      notes: [72,76,79,84,83,79,76,null,74,77,81,86,84,81,79,null],
      chords: [[60,64,67], [65,69,72], [62,65,69], [67,71,74]], bass: [36,41,38,43],
      drums: 'K.H.S.H.K.H.SHH.', gain: .125
    }
  });
  const COOLDOWNS = Object.freeze({
    uiClick: 45, uiHover: 90, select: 80, ready: 180, countdown: 350,
    start: 800, finalTen: 350, launch: 700, dash: 220, fire: 75,
    pickup: 100, hit: 100, crash: 700, score: 180, respawn: 500, result: 900
  });
  const midi = note => 440 * Math.pow(2, (note - 69) / 12);
  const nowMs = () => typeof performance !== 'undefined' ? performance.now() : Date.now();

  function createAudioDirector(options) {
    options ||= {};
    let settings = policy?.parseAudioSettings?.(safeStorageGet()) || {
      version: 1, master: .8, music: .55, sfx: .8, muted: false, reducedAudio: false
    };
    let context = null, master = null, music = null, sfx = null, compressor = null;
    let desiredScene = 'HOME', activeScene = null, sceneSerial = 0;
    let windSource = null, windFilter = null, windGain = null;
    let previousDeadline = null, destroyed = false, hiddenSuspended = false;
    const layers = new Set(), liveNodes = new Set(), lastPlayed = new Map();
    const phaseEvents = policy?.createPhaseEventState?.() || {};

    function safeStorageGet() {
      try { return root.localStorage?.getItem(STORAGE_KEY); } catch (_) { return null; }
    }
    function saveSettings() {
      try { root.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) { /* private mode */ }
    }
    function audioContextClass() { return root.AudioContext || root.webkitAudioContext || null; }

    function ensureContext() {
      if (destroyed) return false;
      if (context && context.state !== 'closed') return true;
      const AudioContextClass = audioContextClass();
      if (!AudioContextClass) return false;
      try {
        context = new AudioContextClass({ latencyHint: 'interactive' });
        master = context.createGain();
        music = context.createGain();
        sfx = context.createGain();
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 5;
        compressor.attack.value = .004;
        compressor.release.value = .22;
        music.connect(compressor);
        sfx.connect(compressor);
        compressor.connect(master);
        master.connect(context.destination);
        applySettings(false);
        createWind();
        return true;
      } catch (_) {
        context = master = music = sfx = compressor = null;
        return false;
      }
    }

    function unlock() {
      if (!ensureContext()) return Promise.resolve(false);
      let resumed;
      try { resumed = context.resume(); }
      catch (_) {
        addUnlockListeners();
        return Promise.resolve(false);
      }
      return Promise.resolve(resumed).then(() => {
        if (context.state !== 'running') {
          addUnlockListeners();
          return false;
        }
        removeUnlockListeners();
        if (activeScene !== desiredScene) transitionScene(desiredScene);
        return true;
      }).catch(() => {
        addUnlockListeners();
        return false;
      });
    }
    const unlockEvents = ['pointerdown', 'touchend', 'keydown'];
    const unlockFromGesture = () => { void unlock(); };
    function addUnlockListeners() {
      if (!root.document?.addEventListener) return;
      unlockEvents.forEach(type => root.document.addEventListener(type, unlockFromGesture, { capture: true, passive: true }));
    }
    function removeUnlockListeners() {
      if (!root.document?.removeEventListener) return;
      unlockEvents.forEach(type => root.document.removeEventListener(type, unlockFromGesture, { capture: true }));
    }

    function setParam(param, value, seconds = .03) {
      if (!context || !param) return;
      const t = context.currentTime;
      try {
        param.cancelScheduledValues(t);
        param.setTargetAtTime(value, t, Math.max(.005, seconds));
      } catch (_) { param.value = value; }
    }
    function applySettings(persist = true) {
      if (policy?.normalizeAudioSettings) settings = policy.normalizeAudioSettings(settings);
      const muted = settings.muted ? 0 : settings.master;
      setParam(master?.gain, muted, .025);
      setParam(music?.gain, settings.music, .04);
      setParam(sfx?.gain, settings.sfx, .025);
      if (persist) saveSettings();
    }
    function setSettings(next) {
      settings = policy?.normalizeAudioSettings?.({ ...settings, ...next }) || { ...settings, ...next };
      applySettings(true);
      return getSettings();
    }
    function getSettings() { return { ...settings }; }

    function track(node) {
      liveNodes.add(node);
      const previous = node.onended;
      node.onended = event => {
        liveNodes.delete(node);
        try { node.disconnect(); } catch (_) { /* already disconnected */ }
        if (typeof previous === 'function') previous.call(node, event);
      };
      return node;
    }
    function tone(frequency, start, duration, volume, type = 'sine', destination = sfx, glide = null) {
      if (!context || context.state !== 'running' || !destination) return;
      const oscillator = track(context.createOscillator());
      const envelope = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
      if (glide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, glide), start + duration);
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), start + Math.min(.018, duration / 3));
      envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(envelope).connect(destination);
      oscillator.onended = () => {
        liveNodes.delete(oscillator);
        try { oscillator.disconnect(); envelope.disconnect(); } catch (_) { /* cleanup */ }
      };
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
    }
    function noise(start, duration, volume, destination = sfx, highpass = 300) {
      if (!context || context.state !== 'running' || !destination) return;
      const frames = Math.max(1, Math.ceil(context.sampleRate * duration));
      const buffer = context.createBuffer(1, frames, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      const source = track(context.createBufferSource());
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      source.buffer = buffer;
      filter.type = 'highpass'; filter.frequency.value = highpass;
      envelope.gain.setValueAtTime(volume, start);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
      source.connect(filter).connect(envelope).connect(destination);
      source.onended = () => {
        liveNodes.delete(source);
        try { source.disconnect(); filter.disconnect(); envelope.disconnect(); } catch (_) { /* cleanup */ }
      };
      source.start(start); source.stop(start + duration + .01);
    }

    function kick(start, destination, volume = .13) {
      tone(150, start, .14, volume, 'sine', destination, 46);
    }
    function snare(start, destination, volume = .065) {
      noise(start, .11, volume, destination, 1100);
      tone(190, start, .075, volume * .38, 'triangle', destination, 105);
    }
    function hat(start, destination, volume = .026) {
      noise(start, .035, volume, destination, 5200);
    }
    function chordStab(notes, start, duration, volume, destination, wave = 'triangle') {
      for (const note of notes) tone(midi(note), start, duration, volume / notes.length, wave, destination);
    }

    function makeLayer(sceneName) {
      const arrangement = SCENES[sceneName];
      if (!arrangement || !context || context.state !== 'running') return null;
      const bus = context.createGain();
      bus.gain.setValueAtTime(.0001, context.currentTime);
      bus.connect(music);
      const beat = 60 / arrangement.tempo;
      const stepDuration = beat / arrangement.stepsPerBeat;
      const barSteps = arrangement.stepsPerBeat * 4;
      const layer = {
        bus, timer: null, stopped: false, step: 0, sceneName,
        nextNoteTime: context.currentTime + .035
      };
      layers.add(layer);
      const scheduleNote = start => {
        const i = layer.step++;
        const section = Math.floor(i / arrangement.notes.length) % 4;
        const note = arrangement.notes[i % arrangement.notes.length];
        if (note != null) {
          const lifted = note + (section === 3 && i % 4 === 2 ? 12 : 0);
          const leadVolume = section === 0 ? .09 : .115;
          tone(midi(lifted), start, stepDuration * .78, leadVolume, arrangement.wave, bus);
          if (!settings.reducedAudio && section === 2 && i % 4 === 0)
            tone(midi(note + 12), start + stepDuration * .45, stepDuration * .4, .035, 'square', bus);
        }

        if (i % arrangement.stepsPerBeat === 0) {
          const bar = Math.floor(i / barSteps);
          const beatInBar = Math.floor(i / arrangement.stepsPerBeat) % 4;
          const bassNote = arrangement.bass[bar % arrangement.bass.length] + (beatInBar === 2 ? 12 : 0);
          tone(midi(bassNote), start, beat * .62, .09, 'square', bus);
        }
        if (!settings.reducedAudio && i % barSteps === 0) {
          const chord = arrangement.chords[Math.floor(i / barSteps) % arrangement.chords.length];
          chordStab(chord, start, beat * 1.45, section === 1 ? .09 : .07, bus);
        }

        const drum = arrangement.drums[i % arrangement.drums.length];
        if (drum === 'K') kick(start, bus, sceneName === 'FLIGHT_ARENA' ? .15 : .12);
        else if (drum === 'S') snare(start, bus, .055);
        else if (drum === 'H' && !settings.reducedAudio) hat(start, bus, section === 3 ? .033 : .023);
        if (!settings.reducedAudio && section === 3 && i % barSteps >= barSteps - 2)
          hat(start + stepDuration * .5, bus, .02);
      };
      const schedule = () => {
        if (layer.stopped || context.state !== 'running') return;
        if (layer.nextNoteTime < context.currentTime - .25) layer.nextNoteTime = context.currentTime + .035;
        const horizon = context.currentTime + .14;
        while (layer.nextNoteTime < horizon) {
          scheduleNote(layer.nextNoteTime);
          layer.nextNoteTime += stepDuration;
        }
      };
      schedule();
      layer.timer = root.setInterval(schedule, 25);
      bus.gain.exponentialRampToValueAtTime(arrangement.gain, context.currentTime + .65);
      return layer;
    }
    function stopLayer(layer, fade = .65) {
      if (!layer || layer.stopped) return;
      layer.stopped = true;
      root.clearInterval(layer.timer);
      const t = context?.currentTime || 0;
      try {
        layer.bus.gain.cancelScheduledValues(t);
        layer.bus.gain.setValueAtTime(Math.max(.0001, layer.bus.gain.value), t);
        layer.bus.gain.exponentialRampToValueAtTime(.0001, t + fade);
      } catch (_) { /* context closed */ }
      root.setTimeout(() => {
        try { layer.bus.disconnect(); } catch (_) { /* cleanup */ }
        layers.delete(layer);
      }, fade * 1000 + 80);
    }
    function transitionScene(sceneName) {
      if (!SCENES[sceneName] || sceneName === activeScene) return;
      const oldLayers = [...layers];
      activeScene = sceneName;
      sceneSerial++;
      const next = makeLayer(sceneName);
      if (!next) { activeScene = null; return; }
      oldLayers.forEach(layer => stopLayer(layer, .7));
    }
    function setScene(sceneName) {
      if (!SCENES[sceneName]) return;
      desiredScene = sceneName;
      // Do not construct an AudioContext merely because a server snapshot arrived.
      // iOS requires construction/resume to happen synchronously inside a gesture.
      if (context && context.state === 'running') transitionScene(sceneName);
    }

    function canPlay(name) {
      if (!context || context.state !== 'running' || settings.muted) return false;
      if (settings.reducedAudio && (name === 'uiHover' || name === 'countdown')) return false;
      const time = nowMs(), last = lastPlayed.get(name) ?? -Infinity;
      if (time - last < (COOLDOWNS[name] || 80)) return false;
      lastPlayed.set(name, time);
      return true;
    }
    function uiClick() { if (canPlay('uiClick')) tone(620, context.currentTime, .045, .08, 'sine', sfx, 780); }
    function uiHover() { if (canPlay('uiHover')) tone(900, context.currentTime, .025, .035, 'sine'); }
    function select() { if (canPlay('select')) { const t=context.currentTime; tone(440,t,.08,.1,'triangle'); tone(660,t+.05,.11,.08,'triangle'); } }
    function ready() { if (canPlay('ready')) { const t=context.currentTime; [523,659,784].forEach((f,i)=>tone(f,t+i*.055,.15,.09,'triangle')); } }
    function countdown(value) { if (canPlay('countdown')) tone(value === 1 ? 880 : 660, context.currentTime, .11, .12, 'square'); }
    function start() { if (canPlay('start')) { const t=context.currentTime; [392,523,659,784].forEach((f,i)=>tone(f,t+i*.07,.28,.1,'sawtooth')); noise(t,.22,.045,sfx,1200); } }
    function finalTen(value) { if (canPlay('finalTen')) tone(value <= 3 ? 1046 : 784, context.currentTime, .08, value <= 3 ? .16 : .1, 'square'); }
    function launch() { if (canPlay('launch')) { const t=context.currentTime; tone(110,t,.65,.18,'sawtooth',sfx,880); noise(t,.48,.09,sfx,500); } }
    function dash() { if (canPlay('dash')) { const t=context.currentTime; noise(t,.24,.1,sfx,900); tone(160,t,.22,.08,'sawtooth',sfx,520); } }
    function fire() { if (canPlay('fire')) { const t=context.currentTime; noise(t,.08,.11,sfx,1600); tone(720,t,.1,.1,'square',sfx,230); } }
    function pickup() { if (canPlay('pickup')) { const t=context.currentTime; [740,988,1318].forEach((f,i)=>tone(f,t+i*.04,.14,.075,'sine')); } }
    function hit() { if (canPlay('hit')) { const t=context.currentTime; noise(t,.12,.13,sfx,700); tone(180,t,.16,.11,'square',sfx,80); } }
    function crash() { if (canPlay('crash')) { const t=context.currentTime; noise(t,.55,.19,sfx,100); tone(140,t,.6,.14,'sawtooth',sfx,42); } }
    function score() { if (canPlay('score')) { const t=context.currentTime; [659,784,988].forEach((f,i)=>tone(f,t+i*.045,.18,.08,'triangle')); } }
    function respawn() { if (canPlay('respawn')) { const t=context.currentTime; tone(180,t,.45,.1,'sine',sfx,720); tone(540,t+.22,.28,.08,'triangle'); } }
    function result() { if (canPlay('result')) { const t=context.currentTime; [262,330,392,523].forEach((f,i)=>tone(f,t+i*.11,.5,.09,'triangle')); } }
    const effects = { uiClick, uiHover, select, ready, countdown, start, finalTen, launch, dash, fire, pickup, hit, crash, score, respawn, result };
    function play(name, detail) { try { effects[name]?.(detail); } catch (_) { /* audio never blocks game flow */ } }

    function createWind() {
      if (!context || windSource) return;
      try {
        const seconds = 2, buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
        const channel = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < channel.length; i++) { last = last * .94 + (Math.random() * 2 - 1) * .06; channel[i] = last; }
        windSource = context.createBufferSource();
        windFilter = context.createBiquadFilter();
        windGain = context.createGain();
        windSource.buffer = buffer; windSource.loop = true;
        windFilter.type = 'bandpass'; windFilter.Q.value = .6;
        windGain.gain.value = 0;
        windSource.connect(windFilter).connect(windGain).connect(sfx);
        windSource.start();
      } catch (_) { windSource = windFilter = windGain = null; }
    }
    function setFlight(state) {
      const params = policy?.windParams?.(state) || { gain: 0, frequency: 240 };
      setParam(windGain?.gain, settings.reducedAudio ? params.gain * .45 : params.gain, .08);
      setParam(windFilter?.frequency, params.frequency, .06);
    }
    function updateDeadline(seconds, options) {
      const current = Number(seconds);
      if (!Number.isFinite(current)) { previousDeadline = null; return; }
      const cue = policy?.deadlineCue?.(previousDeadline, current, options);
      previousDeadline = current;
      if (cue != null) play('finalTen', cue);
    }
    function phaseSnapshot(snapshot) {
      const effect = policy?.phaseTransitionEvent?.(phaseEvents, snapshot);
      if (effect) play(effect);
      setScene(policy?.deriveAudioScene?.(snapshot) || desiredScene);
      return effect;
    }

    function onVisibility() {
      if (!context) return;
      if (root.document.hidden) {
        hiddenSuspended = context.state === 'running' || context.state === 'interrupted';
        Promise.resolve(context.suspend()).catch(() => {});
      } else if (hiddenSuspended || context.state === 'suspended' || context.state === 'interrupted') {
        Promise.resolve(context.resume()).then(() => {
          if (context.state !== 'running') {
            addUnlockListeners();
            return;
          }
          hiddenSuspended = false;
          previousDeadline = null; // never catch up missed final-ten cues
          for (const layer of layers) layer.nextNoteTime = context.currentTime + .035;
          removeUnlockListeners();
          if (activeScene !== desiredScene) transitionScene(desiredScene);
        }).catch(() => {
          addUnlockListeners();
        });
      }
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      removeUnlockListeners();
      root.document?.removeEventListener?.('visibilitychange', onVisibility);
      [...layers].forEach(layer => stopLayer(layer, 0));
      for (const node of liveNodes) { try { node.stop(); node.disconnect(); } catch (_) { /* cleanup */ } }
      liveNodes.clear();
      try { windSource?.stop(); windSource?.disconnect(); windFilter?.disconnect(); windGain?.disconnect(); } catch (_) { /* cleanup */ }
      try { master?.disconnect(); music?.disconnect(); sfx?.disconnect(); compressor?.disconnect(); } catch (_) { /* cleanup */ }
      if (context && context.state !== 'closed') Promise.resolve(context.close()).catch(() => {});
      context = master = music = sfx = compressor = windSource = windFilter = windGain = null;
    }

    addUnlockListeners();
    root.document?.addEventListener?.('visibilitychange', onVisibility);
    if (options.scene) desiredScene = options.scene;
    return { setScene, phaseSnapshot, updateDeadline, setFlight, play, unlock, setSettings, getSettings, destroy, scenes: SCENES };
  }

  root.createAudioDirector = createAudioDirector;
  root.gameAudio = { createAudioDirector, SCENES };
})(typeof window !== 'undefined' ? window : globalThis);
