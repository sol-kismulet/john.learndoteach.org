// Player + audio engine for song.html. Driven entirely by the song's entry in
// songs.json (looked up via the ?s=<slug> query param). See README.md.

const params = new URLSearchParams(window.location.search);
const slug = params.get('s');

if (!slug) {
  document.getElementById('song-title').textContent = 'no song specified';
} else {
  init(slug);
}

// Scale-degree patterns (semitone offsets from the root, including the octave).
const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11, 12],
  major: [0, 2, 4, 5, 7, 9, 11, 12],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12],
  phrygian: [0, 1, 3, 5, 7, 8, 10, 12],
  lydian: [0, 2, 4, 6, 7, 9, 11, 12],
  mixolydian: [0, 2, 4, 5, 7, 9, 10, 12],
  aeolian: [0, 2, 3, 5, 7, 8, 10, 12],
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
  'natural minor': [0, 2, 3, 5, 7, 8, 10, 12],
  locrian: [0, 1, 3, 5, 6, 8, 10, 12],
};

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

function init(slug) {
  let player;
  let playerReady = false;
  let loopActive = false;
  let playActive = false;
  let currentLoopIndex = null;
  let loops = [];
  let isVideoMode = false;
  let isAudioMode = false;
  let fineTune = false;

  const loopsContainer = document.getElementById('loops');
  const addLoopBtn = document.getElementById('add-loop');
  const playBtn = document.getElementById('play-btn');
  const speedInput = document.getElementById('speed');
  const speedDisplay = document.getElementById('speed-display');
  const audioElement = document.getElementById('audio');
  const videoWrapper = document.getElementById('video-wrapper');
  const audioWrapper = document.getElementById('audio-wrapper');
  const scoreWrapper = document.getElementById('score-wrapper');
  const scoreImg = document.getElementById('score-img');

  // --- Scale buttons (data-driven via the song's "scales" field) ---
  let audioCtx = null;
  function playScale(baseMidi, semitoneOffsets) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const noteDur = 0.42;
    const start = ctx.currentTime + 0.05;
    semitoneOffsets.forEach((semi, i) => {
      const t = start + i * noteDur;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = midiToFreq(baseMidi + semi);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + noteDur * 0.92);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + noteDur);
    });
  }

  function setupScales(scales) {
    const container = document.getElementById('scale-tools');
    const root = scales.root || 'A♭';
    const baseMidi = pitchToMidi(root, 4);
    if (baseMidi === null) return;
    (scales.items || []).forEach((item) => {
      const intervals = MODES[String(item.mode).toLowerCase()];
      if (!intervals) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label || `${root} ${item.mode}`;
      btn.addEventListener('click', () => playScale(baseMidi, intervals));
      container.appendChild(btn);
    });
    if (container.children.length) container.style.display = 'flex';
  }

  // --- Drone (borrowed from mojotrio) — sustained root with optional perfect fifth.
  // Root pitch comes from the song's "drone" field (note name, octave optional);
  // a missing/null field leaves the drone off. ---
  const FIFTH_RATIO = 1.5;
  const dronePanel = document.getElementById('drone-panel');
  const droneBtn = document.getElementById('drone-btn');
  const fifthToggle = document.getElementById('drone-fifth');
  const volumeInput = document.getElementById('drone-volume');
  let droneNodes = null;
  let fifthOn = false;
  let droneVolume = parseFloat(volumeInput.value);
  let droneRootMidi = 56; // A♭3 default
  let droneLabel = 'A♭';

  function startDrone() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const root = midiToFreq(droneRootMidi);

    const rootOsc = ctx.createOscillator();
    const fifthOsc = ctx.createOscillator();
    const fifthGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const fA = ctx.createBiquadFilter();
    const fB = ctx.createBiquadFilter();
    const fC = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    rootOsc.type = 'sawtooth'; rootOsc.frequency.value = root;
    fifthOsc.type = 'sawtooth'; fifthOsc.frequency.value = root * FIFTH_RATIO;
    fifthGain.gain.value = fifthOn ? 1 : 0;

    filter.type = 'lowpass'; filter.frequency.value = 5000; filter.Q.value = 0.7;
    fA.type = 'peaking'; fA.frequency.value = 250; fA.Q.value = 4; fA.gain.value = 8;
    fB.type = 'peaking'; fB.frequency.value = 450; fB.Q.value = 3; fB.gain.value = 6;
    fC.type = 'peaking'; fC.frequency.value = 1800; fC.Q.value = 2; fC.gain.value = 5;

    // sub-audible noise prevents Bluetooth codec silence-gating (audible pulsing)
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf; noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass'; noiseFilter.frequency.value = 2000; noiseFilter.Q.value = 0.6;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = 0.012;

    rootOsc.connect(filter);
    fifthOsc.connect(fifthGain); fifthGain.connect(filter);
    filter.connect(fA); fA.connect(fB); fB.connect(fC); fC.connect(gain);
    noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(droneVolume, 0.0001), now + 0.15);

    rootOsc.start(); fifthOsc.start(); noise.start();
    droneNodes = { ctx, rootOsc, fifthOsc, fifthGain, noise, gain };
    droneBtn.textContent = 'stop';
    droneBtn.classList.add('on');
  }

  function stopDrone() {
    if (!droneNodes) return;
    const { ctx, rootOsc, fifthOsc, noise, gain } = droneNodes;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    [rootOsc, fifthOsc, noise].forEach(o => { try { o.stop(now + 0.25); } catch (e) {} });
    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 400);
    droneNodes = null;
    droneBtn.textContent = droneLabel;
    droneBtn.classList.remove('on');
  }

  droneBtn.addEventListener('click', () => { droneNodes ? stopDrone() : startDrone(); });
  fifthToggle.addEventListener('change', () => {
    fifthOn = fifthToggle.checked;
    if (droneNodes) {
      droneNodes.fifthGain.gain.setTargetAtTime(fifthOn ? 1 : 0, droneNodes.ctx.currentTime, 0.03);
    }
  });
  volumeInput.addEventListener('input', () => {
    droneVolume = parseFloat(volumeInput.value);
    if (droneNodes) {
      droneNodes.gain.gain.setTargetAtTime(droneVolume, droneNodes.ctx.currentTime, 0.03);
    }
  });

  function showScore(src) {
    if (!src) { scoreWrapper.classList.remove('active'); return; }
    scoreImg.src = src;
    scoreWrapper.classList.add('active');
  }
  function hideScore() {
    scoreWrapper.classList.remove('active');
  }

  function parseTime(t) {
    const parts = t.split(':');
    if (parts.length === 1) return parseFloat(parts[0]) || 0;
    if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function formatTimeFine(sec) {
    const tenths = Math.max(0, Math.round(sec * 10));
    const m = Math.floor(tenths / 600);
    const s = String(Math.floor(tenths / 10) % 60).padStart(2, '0');
    return `${m}:${s}.${tenths % 10}`;
  }

  function nudge(input, delta) {
    const cur = parseTime(input.value);
    const base = Number.isFinite(cur) ? cur : 0;
    input.value = formatTimeFine(base + delta);
  }

  function makeNudgeButtons(input) {
    const wrap = document.createElement('span');
    wrap.className = 'nudge';
    const target = input.className;
    const mk = (label, delta, action) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nudge-btn';
      b.textContent = label;
      b.title = `${label}0.1s`;
      b.setAttribute('aria-label', `${action} ${target} by 0.1 seconds`);
      b.addEventListener('click', () => nudge(input, delta));
      return b;
    };
    wrap.appendChild(mk('−', -0.1, 'decrease'));
    wrap.appendChild(mk('+', 0.1, 'increase'));
    return wrap;
  }

  function createLoopElement(startVal, endVal, label, scoreSrc) {
    if (label) {
      const labelDiv = document.createElement('div');
      labelDiv.className = 'loop-label';
      labelDiv.textContent = label;
      loopsContainer.appendChild(labelDiv);
    }

    const div = document.createElement('div');
    div.className = 'loop';

    const startLabel = document.createElement('label');
    startLabel.textContent = 'start ';
    const startInput = document.createElement('input');
    startInput.type = 'text';
    startInput.className = 'start';
    startInput.value = startVal;
    startLabel.appendChild(startInput);
    if (fineTune) startLabel.appendChild(makeNudgeButtons(startInput));

    const endLabel = document.createElement('label');
    endLabel.textContent = 'end ';
    const endInput = document.createElement('input');
    endInput.type = 'text';
    endInput.className = 'end';
    endInput.value = endVal;
    endLabel.appendChild(endInput);
    if (fineTune) endLabel.appendChild(makeNudgeButtons(endInput));

    const btn = document.createElement('button');
    btn.textContent = 'loop section';
    btn.className = 'loop-btn';
    const index = loops.length;
    btn.addEventListener('click', () => handleLoopButton(index));

    div.appendChild(startLabel);
    div.appendChild(endLabel);
    div.appendChild(btn);
    loopsContainer.appendChild(div);

    loops.push({ start: startInput, end: endInput, button: btn, scoreSrc: scoreSrc || null });
  }

  function stopLoop() {
    if (currentLoopIndex !== null) {
      loops[currentLoopIndex].button.textContent = 'loop section';
    }
    if (isVideoMode && player && loopActive) {
      player.pauseVideo();
    } else if (isAudioMode && loopActive) {
      audioElement.pause();
    }
    loopActive = false;
    currentLoopIndex = null;
  }

  function startLoop(i) {
    if (isVideoMode && !playerReady) return;
    if (isAudioMode && !audioElement.src) return;
    playActive = false;
    playBtn.textContent = 'play piece';
    const start = parseTime(loops[i].start.value);
    if (isVideoMode) {
      player.seekTo(start, true);
      player.playVideo();
    } else {
      audioElement.currentTime = start;
      audioElement.play();
    }
    loops[i].button.textContent = 'stop';
    currentLoopIndex = i;
    loopActive = true;
    showScore(loops[i].scoreSrc);
  }

  function checkLoop() {
    if (!loopActive || currentLoopIndex === null) return;
    try {
      const start = parseTime(loops[currentLoopIndex].start.value);
      const end = parseTime(loops[currentLoopIndex].end.value);
      if (end <= start) return;
      let currentTime;
      if (isVideoMode) {
        currentTime = player.getCurrentTime();
        if (currentTime >= end) {
          player.seekTo(start, true);
        }
      } else if (isAudioMode) {
        currentTime = audioElement.currentTime;
        if (currentTime >= end) {
          audioElement.currentTime = start;
        }
      }
    } catch (e) {}
  }

  function handleLoopButton(i) {
    if (loopActive && currentLoopIndex === i) {
      stopLoop();
    } else {
      stopLoop();
      startLoop(i);
    }
  }

  addLoopBtn.addEventListener('click', () => {
    if (loops.length === 0) return;
    const last = loops[loops.length - 1];
    const startVal = last.end.value;
    const startSec = parseTime(startVal);
    const fmt = fineTune ? formatTimeFine : formatTime;
    createLoopElement(startVal, fmt(startSec + 10));
  });

  playBtn.addEventListener('click', () => {
    if (isVideoMode && !playerReady) return;
    if (isAudioMode && !audioElement.src) return;
    if (!playActive) {
      stopLoop();
      if (isVideoMode) {
        player.seekTo(0, true);
        player.playVideo();
      } else {
        audioElement.currentTime = 0;
        audioElement.play();
      }
      playBtn.textContent = 'stop';
      playActive = true;
    } else {
      if (isVideoMode) {
        player.pauseVideo();
      } else {
        audioElement.pause();
      }
      playBtn.textContent = 'play piece';
      playActive = false;
    }
  });

  speedInput.addEventListener('input', () => {
    const r = parseFloat(speedInput.value);
    if (isVideoMode && playerReady) {
      player.setPlaybackRate(r);
    } else if (isAudioMode && audioElement.src) {
      audioElement.playbackRate = r;
    }
    speedDisplay.textContent = r.toFixed(2) + 'x';
  });

  // Load song data and initialize
  fetch('songs.json')
    .then(r => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(data => {
      const song = (data.songs || {})[slug];
      if (!song) {
        document.getElementById('song-title').textContent = 'song not found';
        return;
      }

      document.title = song.title;
      document.getElementById('song-title').textContent = song.title;

      // Determine mode
      if (song.videoId) {
        isVideoMode = true;
        audioWrapper.classList.remove('active');
        videoWrapper.style.display = 'block';
      } else if (song.audio) {
        isAudioMode = true;
        videoWrapper.style.display = 'none';
        audioWrapper.classList.add('active');
        audioElement.src = song.audio;
        audioElement.preservesPitch = true;
        audioElement.mozPreservesPitch = true;
        audioElement.webkitPreservesPitch = true;
      }

      // Speed slider min
      if (song.speedMin) {
        speedInput.min = song.speedMin;
      }

      fineTune = !!song.fineTune;

      if (song.scales) {
        setupScales(song.scales);
      }

      const droneMidi = song.drone != null ? pitchToMidi(song.drone) : null;
      if (droneMidi !== null) {
        droneRootMidi = droneMidi;
        droneLabel = String(song.drone);
        droneBtn.textContent = droneLabel;
        dronePanel.classList.add('active');
      }

      // Build loop elements from JSON
      (song.loops || []).forEach((loop) => {
        const start = Array.isArray(loop) ? loop[0] : loop.start;
        const end = Array.isArray(loop) ? loop[1] : loop.end;
        const label = Array.isArray(loop) ? null : loop.label;
        const scoreSrc = Array.isArray(loop) ? null : loop.score;
        createLoopElement(start, end, label, scoreSrc);
      });

      // Show the first loop's score by default
      const firstScore = loops.find(l => l.scoreSrc);
      if (firstScore) showScore(firstScore.scoreSrc);

      // Initialize YouTube player if video mode
      if (isVideoMode) {
        window.onYouTubeIframeAPIReady = function () {
          player = new YT.Player('player', {
            width: '100%',
            height: '100%',
            videoId: song.videoId,
            playerVars: {
              origin: window.location.origin,
              rel: 0
            },
            events: {
              onReady: () => {
                playerReady = true;
              },
              onStateChange: (event) => {
                clearInterval(loopTimer);
                if (event.data === YT.PlayerState.PLAYING && loopActive) {
                  loopTimer = setInterval(checkLoop, 200);
                } else if (event.data === YT.PlayerState.ENDED) {
                  playActive = false;
                  playBtn.textContent = 'play piece';
                }
              },
              onError: () => {
                playerReady = false;
                stopLoop();
                playActive = false;
                playBtn.textContent = 'play piece';
              }
            }
          });
        };

        let loopTimer = null;

        // If the API already loaded before our callback was set
        if (window.YT && window.YT.Player) {
          window.onYouTubeIframeAPIReady();
        }
      } else if (isAudioMode) {
        // Audio mode: use timeupdate event for loop checking
        audioElement.addEventListener('timeupdate', checkLoop);
        audioElement.addEventListener('ended', () => {
          playActive = false;
          playBtn.textContent = 'play piece';
        });
      }

      // Footer
      if (song.footer) {
        const p = document.createElement('p');
        p.className = 'footer-note';
        p.innerHTML = song.footer;
        document.getElementById('footer-area').appendChild(p);
      }

      // Lyrics
      if (song.lyrics) {
        const pre = document.createElement('pre');
        pre.className = 'lyrics';
        pre.textContent = song.lyrics;
        document.getElementById('footer-area').appendChild(pre);
      }
    })
    .catch(err => {
      console.error('Failed to load songs.json:', err);
      document.getElementById('song-title').textContent = 'failed to load';
    });
}
