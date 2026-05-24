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
    if (!seqCtx) seqCtx = new (window.AudioContext || window.webkitAudioContext)();
    return seqCtx.currentTime;
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
    if (!seqCtx) seqCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (seqCtx.state === 'suspended') { try { seqCtx.resume(); } catch (e) {} }
    const ctx = seqCtx;
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
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
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
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 400);
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

  return { FIFTH_RATIO, midiToFreq, pitchToMidi, midiToName, playSequence, stopSequence, currentTime, createDrone };
})();
