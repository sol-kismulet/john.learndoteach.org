// Shared audio engine for the song and scales pages. Loaded as a plain script
// before song.js / scales.js, which call into the AudioKit namespace.
//
// Exposes:
//   AudioKit.midiToFreq(midi)
//   AudioKit.pitchToMidi(name, defaultOctave = 3)
//   AudioKit.playSequence(baseMidi, semitoneOffsets, opts)
//   AudioKit.createDrone()  -> { start, stop, retune, setRoot, setFifth, setVolume, playing }
const AudioKit = (() => {
  const FIFTH_RATIO = 1.5;

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // "A♭", "Eb", "G3", "F#4" → MIDI number; null if unparseable.
  // Octave is optional and falls back to defaultOctave.
  function pitchToMidi(name, defaultOctave = 3) {
    const m = String(name).trim().match(/^([A-Ga-g])([#♯b♭]?)(-?\d+)?$/);
    if (!m) return null;
    const semis = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
    const accidental = (m[2] === '#' || m[2] === '♯') ? 1 : (m[2] === 'b' || m[2] === '♭') ? -1 : 0;
    const octave = m[3] !== undefined ? parseInt(m[3], 10) : defaultOctave;
    return semis + accidental + (octave + 1) * 12;
  }

  const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  // MIDI number → pitch-class name. preferFlats picks the accidental spelling.
  function midiToName(midi, preferFlats) {
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[pc];
  }

  // One AudioContext shared across scale playbacks (the drone makes its own).
  let seqCtx = null;
  // Pending visual-callback timers, cleared when a sequence is stopped/replaced.
  let seqTimers = [];
  // Oscillators currently scheduled, so a new (or stopped) sequence can silence
  // them instead of layering a second scale on top of the first.
  let activeVoices = [];

  // Track every live AudioContext so we can resume them after an interruption.
  // iOS suspends audio on screen lock / phone calls and leaves the context in
  // the non-standard 'interrupted' state (not 'suspended') — so checking only
  // for 'suspended' misses it, and playback stays dead until a reload. We resume
  // on any non-running state, on the next user gesture (via playSequence/drone),
  // and when the page becomes visible/focused again.
  const liveCtxs = new Set();
  const AC = window.AudioContext || window.webkitAudioContext;

  function getSeqCtx() {
    if (!seqCtx) { seqCtx = new AC(); liveCtxs.add(seqCtx); }
    return seqCtx;
  }
  function resumeCtxs() {
    liveCtxs.forEach(c => {
      if (c && c.state !== 'running' && c.state !== 'closed') {
        try { c.resume(); } catch (e) {}
      }
    });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeCtxs(); });
    window.addEventListener('focus', resumeCtxs);
    window.addEventListener('pageshow', resumeCtxs);
  }

  // Stop the current scale: cancel pending visual callbacks and fade out any
  // scheduled oscillators. Safe to call when nothing is playing.
  function stopSequence() {
    seqTimers.forEach(id => clearTimeout(id));
    seqTimers = [];
    if (seqCtx) {
      const now = seqCtx.currentTime;
      activeVoices.forEach(({ osc, gain }) => {
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
          osc.stop(now + 0.06);
        } catch (e) {}
      });
    }
    activeVoices = [];
  }

  // The shared "cello-ish" voice: a sawtooth shaped by a gentle lowpass and
  // three formant peaks. Connect a source into `input`; take `output`. Used by
  // both the drone and the scale note player so their timbre stays identical.
  function celloFilters(ctx) {
    const lp = ctx.createBiquadFilter();
    const fA = ctx.createBiquadFilter();
    const fB = ctx.createBiquadFilter();
    const fC = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 5000; lp.Q.value = 0.7;
    fA.type = 'peaking'; fA.frequency.value = 250; fA.Q.value = 4; fA.gain.value = 8;
    fB.type = 'peaking'; fB.frequency.value = 450; fB.Q.value = 3; fB.gain.value = 6;
    fC.type = 'peaking'; fC.frequency.value = 1800; fC.Q.value = 2; fC.gain.value = 5;
    lp.connect(fA); fA.connect(fB); fB.connect(fC);
    return { input: lp, output: fC };
  }

  // Current audio-clock time (creates the shared context if needed). Lets the
  // caller schedule contiguous loop passes against the same timeline.
  function currentTime() {
    return getSeqCtx().currentTime;
  }

  // Plays a sequence of semitone offsets from baseMidi using the cello voice.
  // opts: step (onset spacing, s), gate (sounding length, s), attack (s),
  // peak (gain), sustain (0 = plucked decay over the whole gate; >0 = hold at
  // that fraction of peak until a short release — needed for legato/portato),
  // release (release length, s), onNote(semi, i) fired as each note sounds,
  // when (absolute audio-clock start time; default = now + 0.05), chain (true =
  // keep the previous sequence's voices instead of stopping them, for gapless
  // looping). Returns the audio-clock time the next contiguous note would start
  // (= start + seq.length * step), so a loop can schedule the next pass exactly.
  function playSequence(baseMidi, seq, opts = {}) {
    const ctx = getSeqCtx();
    // Resume on any non-running state (covers iOS 'interrupted' after a lock),
    // running inside this user-gesture call so iOS allows it.
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
    const step = opts.step != null ? opts.step : 0.42;
    const gate = Math.max(opts.gate != null ? opts.gate : step * 0.92, 0.04);
    const attack = opts.attack != null ? opts.attack : 0.02;
    const peak = opts.peak != null ? opts.peak : 0.16;
    const sustain = opts.sustain != null ? opts.sustain : 0;
    const release = opts.release != null ? opts.release : 0.05;
    const onNote = typeof opts.onNote === 'function' ? opts.onNote : null;
    // Never layer a second scale over the first, unless chaining a loop pass.
    if (!opts.chain) stopSequence();
    const now = ctx.currentTime;
    const start = opts.when != null ? Math.max(opts.when, now) : now + 0.05;
    seq.forEach((semi, i) => {
      const t = start + i * step;
      const osc = ctx.createOscillator();
      const voice = celloFilters(ctx);
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(baseMidi + semi);
      const atk = Math.min(attack, gate * 0.5);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peak, t + atk);
      if (sustain > 0) {
        // attack → quick decay to the sustain plateau → hold → release
        const susLevel = Math.max(peak * sustain, 0.0002);
        const decayEnd = t + Math.min(atk + 0.04, gate * 0.6);
        gain.gain.linearRampToValueAtTime(susLevel, decayEnd);
        gain.gain.setValueAtTime(susLevel, Math.max(decayEnd, t + gate - release));
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, t + gate);
      osc.connect(voice.input);
      voice.output.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + gate + 0.05);
      const rec = { osc, gain };
      activeVoices.push(rec);
      osc.onended = () => { const k = activeVoices.indexOf(rec); if (k >= 0) activeVoices.splice(k, 1); };
      if (onNote) {
        const id = setTimeout(() => {
          const k = seqTimers.indexOf(id); if (k >= 0) seqTimers.splice(k, 1);
          onNote(semi, i);
        }, Math.max(0, (t - now) * 1000));
        seqTimers.push(id);
      }
    });
    return start + seq.length * step;
  }

  // Sustained root with an optional perfect fifth. A sub-audible noise layer
  // keeps Bluetooth codecs from silence-gating the steady tone.
  function createDrone() {
    let nodes = null;
    let rootMidi = 57;
    let fifthOn = false;
    let volume = 0.1;

    function start() {
      if (nodes) return;
      const ctx = new AC();
      liveCtxs.add(ctx);
      if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
      const root = midiToFreq(rootMidi);

      const rootOsc = ctx.createOscillator();
      const fifthOsc = ctx.createOscillator();
      const fifthGain = ctx.createGain();
      const voice = celloFilters(ctx);
      const gain = ctx.createGain();

      rootOsc.type = 'sawtooth'; rootOsc.frequency.value = root;
      fifthOsc.type = 'sawtooth'; fifthOsc.frequency.value = root * FIFTH_RATIO;
      fifthGain.gain.value = fifthOn ? 1 : 0;

      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf; noise.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass'; noiseFilter.frequency.value = 2000; noiseFilter.Q.value = 0.6;
      const noiseGain = ctx.createGain(); noiseGain.gain.value = 0.012;

      rootOsc.connect(voice.input);
      fifthOsc.connect(fifthGain); fifthGain.connect(voice.input);
      voice.output.connect(gain);
      noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0001), now + 0.15);

      rootOsc.start(); fifthOsc.start(); noise.start();
      nodes = { ctx, rootOsc, fifthOsc, fifthGain, noise, gain };
    }

    function stop() {
      if (!nodes) return;
      const { ctx, rootOsc, fifthOsc, noise, gain } = nodes;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      [rootOsc, fifthOsc, noise].forEach(o => { try { o.stop(now + 0.25); } catch (e) {} });
      setTimeout(() => { try { ctx.close(); } catch (e) {} liveCtxs.delete(ctx); }, 400);
      nodes = null;
    }

    function retune() {
      if (!nodes) return;
      const root = midiToFreq(rootMidi);
      nodes.rootOsc.frequency.setTargetAtTime(root, nodes.ctx.currentTime, 0.03);
      nodes.fifthOsc.frequency.setTargetAtTime(root * FIFTH_RATIO, nodes.ctx.currentTime, 0.03);
    }

    function setRoot(midi) { rootMidi = midi; retune(); }
    function setFifth(on) {
      fifthOn = on;
      if (nodes) nodes.fifthGain.gain.setTargetAtTime(on ? 1 : 0, nodes.ctx.currentTime, 0.03);
    }
    function setVolume(v) {
      volume = v;
      if (nodes) nodes.gain.gain.setTargetAtTime(v, nodes.ctx.currentTime, 0.03);
    }

    return {
      start, stop, retune, setRoot, setFifth, setVolume,
      get playing() { return !!nodes; },
    };
  }

  // Polyphonic, press-and-hold synth for the virtual keyboard. Two timbres:
  // 'piano' (struck string: bright attack, decaying tail) and 'cello' (bowed:
  // sustained, reuses the shared cello voice). With the fifth toggle on, every
  // note also sounds the pitch seven semitones above — a *tempered* fifth
  // (equal-tempered, ratio 2^(7/12) ≈ 1.498), not the just 3:2 the drone uses.
  function createPolySynth() {
    let ctx = null, master = null;
    let instrument = 'piano';
    let fifthOn = false;
    let pianoWave = null;
    // midi -> { count, voices }. count tracks how many inputs (pointers, keys)
    // are holding the note so overlapping presses don't cut each other off.
    const held = new Map();

    function ensure() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.85;
        // Soft knee so dense chords don't clip.
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
      }
      // iOS uses an "interrupted" state after backgrounding, not just
      // "suspended" — resume whenever it isn't actively running.
      if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }

    function getPianoWave() {
      if (!pianoWave) {
        const real = new Float32Array([0, 1, 0.62, 0.42, 0.28, 0.19, 0.13, 0.09, 0.06, 0.04, 0.028, 0.02]);
        pianoWave = ctx.createPeriodicWave(real, new Float32Array(real.length));
      }
      return pianoWave;
    }

    function pianoVoice(freq, now) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(getPianoWave());
      osc.frequency.value = freq;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = Math.min(freq * 7 + 800, 12000); lp.Q.value = 0.4;
      const gain = ctx.createGain();
      const peak = 0.22;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.005);
      gain.gain.exponentialRampToValueAtTime(peak * 0.3, now + 0.5);
      gain.gain.setTargetAtTime(0.0001, now + 0.5, 2.5); // slow tail while held
      osc.connect(lp); lp.connect(gain); gain.connect(master);
      osc.start(now);
      return { gain, oscs: [osc], release: 0.18 };
    }

    function celloVoice(freq, now) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = freq;
      const voice = celloFilters(ctx);
      const gain = ctx.createGain();
      const peak = 0.16;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.09);       // bow attack
      gain.gain.setTargetAtTime(peak * 0.82, now + 0.09, 0.4);   // settle to sustain
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 5;
      lfoGain.gain.setValueAtTime(0.0001, now);
      lfoGain.gain.linearRampToValueAtTime(freq * 0.006, now + 0.6); // vibrato fades in
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      osc.connect(voice.input); voice.output.connect(gain); gain.connect(master);
      osc.start(now); lfo.start(now);
      return { gain, oscs: [osc, lfo], release: 0.15 };
    }

    function makeVoice(midi) {
      const freq = midiToFreq(midi);
      const now = ctx.currentTime;
      return instrument === 'cello' ? celloVoice(freq, now) : pianoVoice(freq, now);
    }

    function stopVoice(v) {
      const t = ctx.currentTime;
      try {
        v.gain.gain.cancelScheduledValues(t);
        if (v.gain.gain.cancelAndHoldAtTime) v.gain.gain.cancelAndHoldAtTime(t);
        else v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), t);
        v.gain.gain.setTargetAtTime(0.0001, t, v.release);
        const end = t + v.release * 8 + 0.1;
        v.oscs.forEach(o => { try { o.stop(end); } catch (e) {} });
      } catch (e) {}
    }

    function noteOn(midi) {
      ensure();
      const entry = held.get(midi);
      if (entry) { entry.count++; return; }
      const voices = [makeVoice(midi)];
      if (fifthOn) voices.push(makeVoice(midi + 7)); // tempered fifth: +7 semitones
      held.set(midi, { count: 1, voices });
    }

    function noteOff(midi) {
      const entry = held.get(midi);
      if (!entry) return;
      if (--entry.count > 0) return;
      entry.voices.forEach(stopVoice);
      held.delete(midi);
    }

    function allOff() {
      held.forEach(entry => entry.voices.forEach(stopVoice));
      held.clear();
    }

    // iOS won't produce sound until the context is resumed inside a user
    // gesture; a one-sample silent buffer reliably kick-starts output. Call
    // this from the first touch/click so later notes actually sound.
    function unlock() {
      ensure();
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        src.connect(ctx.destination);
        src.start(0);
      } catch (e) {}
    }

    // Game-show "wrong answer" buzzer: two clashing detuned saws that slide
    // down at the end for that deflating "ahhght".
    function buzzer() {
      ensure();
      const t = ctx.currentTime;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.02);
      g.gain.setValueAtTime(0.3, t + 0.32);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      lp.connect(g); g.connect(master);
      [150, 159].forEach(f0 => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, t);
        o.frequency.setValueAtTime(f0, t + 0.3);
        o.frequency.linearRampToValueAtTime(f0 * 0.85, t + 0.55);
        o.connect(lp);
        o.start(t); o.stop(t + 0.6);
      });
    }

    return {
      noteOn, noteOff, allOff, buzzer, unlock,
      setInstrument(name) { instrument = name === 'cello' ? 'cello' : 'piano'; },
      setFifth(on) { fifthOn = !!on; },
    };
  }

  return { FIFTH_RATIO, midiToFreq, pitchToMidi, midiToName, playSequence, stopSequence, currentTime, createDrone, createPolySynth, resume: resumeCtxs };
})();
