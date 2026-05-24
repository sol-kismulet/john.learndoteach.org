// Scales practice page — prototype.
// Circle-of-fifths selector picks the tonal center; each mode gets ascending
// and descending playback; an optional root+fifth drone.
//
// NOTE: the audio helpers (pitchToMidi, playScale, the drone engine) are
// duplicated from song.js for now. If this graduates past prototype, extract
// a shared audio module so the two pages can't drift apart.

const NS = 'http://www.w3.org/2000/svg';

// Tonal centers clockwise around the circle of fifths, starting at the top.
// sig = major-key signature: positive = sharps, negative = flats.
const CIRCLE = [
  { label: 'C',  root: 'C',  sig: 0 },
  { label: 'G',  root: 'G',  sig: 1 },
  { label: 'D',  root: 'D',  sig: 2 },
  { label: 'A',  root: 'A',  sig: 3 },
  { label: 'E',  root: 'E',  sig: 4 },
  { label: 'B',  root: 'B',  sig: 5 },
  { label: 'G♭', root: 'Gb', sig: -6 },
  { label: 'D♭', root: 'Db', sig: -5 },
  { label: 'A♭', root: 'Ab', sig: -4 },
  { label: 'E♭', root: 'Eb', sig: -3 },
  { label: 'B♭', root: 'Bb', sig: -2 },
  { label: 'F',  root: 'F',  sig: -1 },
];

function sigLabel(n) {
  if (n === 0) return '0';
  return Math.abs(n) + (n > 0 ? '♯' : '♭');
}

// Key-signature engraving. Accidentals appear in a fixed order at fixed staff
// positions. Position units: 1 per line/space, 0 = bottom staff line, higher =
// higher pitch. Values below are for treble clef; bass clef is shifted down 2.
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const SHARP_POS_TREBLE = [8, 5, 9, 6, 3, 7, 4];
const FLAT_POS_TREBLE = [4, 7, 3, 6, 2, 5, 1];

// Semitone offsets from the tonic, including the octave.
// basic: shown when "show modes" is off (with the friendlier basicName).
// descIntervals: distinct descending form (melodic minor goes up raised,
// down as natural minor); when absent, descending is just the reverse.
const MODES = [
  { name: 'Ionian (major)',          basicName: 'Major',         basic: true, intervals: [0, 2, 4, 5, 7, 9, 11, 12] },
  { name: 'Dorian',                  intervals: [0, 2, 3, 5, 7, 9, 10, 12] },
  { name: 'Phrygian',                intervals: [0, 1, 3, 5, 7, 8, 10, 12] },
  { name: 'Lydian',                  intervals: [0, 2, 4, 6, 7, 9, 11, 12] },
  { name: 'Mixolydian',              intervals: [0, 2, 4, 5, 7, 9, 10, 12] },
  { name: 'Aeolian (natural minor)', basicName: 'Natural minor', basic: true, intervals: [0, 2, 3, 5, 7, 8, 10, 12] },
  { name: 'Melodic minor',           basicName: 'Melodic minor', basic: true, intervals: [0, 2, 3, 5, 7, 9, 11, 12], descIntervals: [0, 2, 3, 5, 7, 8, 10, 12] },
  { name: 'Locrian',                 intervals: [0, 1, 3, 5, 6, 8, 10, 12] },
];

let selectedIndex = 0; // default C
let showModes = false;

function pitchToMidi(name, defaultOctave = 3) {
  const m = String(name).trim().match(/^([A-Ga-g])([#♯b♭]?)(-?\d+)?$/);
  if (!m) return null;
  const semis = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
  const acc = (m[2] === '#' || m[2] === '♯') ? 1 : (m[2] === 'b' || m[2] === '♭') ? -1 : 0;
  const oct = m[3] !== undefined ? parseInt(m[3], 10) : defaultOctave;
  return semis + acc + (oct + 1) * 12;
}
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

// --- scale playback ---
let audioCtx = null;
let autoDescend = false;

// Sequence builders (arrays of semitone offsets from the tonic). A mode may
// carry a distinct descIntervals (e.g. melodic minor); otherwise descending
// is just the ascending form reversed.
const seqAsc = (mode) => mode.intervals;
const seqDesc = (mode) => (mode.descIntervals || mode.intervals).slice().reverse();
// up then back down, with the octave as a single turnaround note.
const seqUpDown = (mode) =>
  mode.intervals.concat((mode.descIntervals || mode.intervals).slice(0, -1).reverse());

function playSequence(baseMidi, seq) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const ctx = audioCtx;
  const noteDur = 0.38;
  const start = ctx.currentTime + 0.05;
  seq.forEach((semi, i) => {
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

// --- drone (root + optional fifth), same engine as the song page ---
const FIFTH_RATIO = 1.5;
let droneNodes = null;
let fifthOn = false;
let droneVolume = 0.1;
let droneRootMidi = pitchToMidi(CIRCLE[selectedIndex].root, 3);

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
  const btn = document.getElementById('drone-btn');
  btn.textContent = 'stop drone';
  btn.classList.add('on');
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
  const btn = document.getElementById('drone-btn');
  btn.textContent = 'drone';
  btn.classList.remove('on');
}

function retuneDrone() {
  if (!droneNodes) return;
  const root = midiToFreq(droneRootMidi);
  droneNodes.rootOsc.frequency.setTargetAtTime(root, droneNodes.ctx.currentTime, 0.03);
  droneNodes.fifthOsc.frequency.setTargetAtTime(root * FIFTH_RATIO, droneNodes.ctx.currentTime, 0.03);
}

// --- UI ---
function buildCircle() {
  const svg = document.getElementById('circle');
  const cx = 180, cy = 180, ringR = 118, sigR = 152;
  CIRCLE.forEach((entry, i) => {
    const ang = (-90 + i * 30) * Math.PI / 180;
    const x = cx + ringR * Math.cos(ang);
    const y = cy + ringR * Math.sin(ang);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'node');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${entry.label}, ${sigLabel(entry.sig)}`);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 24);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.textContent = entry.label;
    // key-signature label just outside the ring (shown via the show-sig toggle)
    const s = document.createElementNS(NS, 'text');
    s.setAttribute('class', 'sig');
    s.setAttribute('x', cx + sigR * Math.cos(ang));
    s.setAttribute('y', cy + sigR * Math.sin(ang));
    s.setAttribute('text-anchor', 'middle');
    s.setAttribute('dominant-baseline', 'central');
    s.textContent = sigLabel(entry.sig);
    g.append(c, t, s);
    g.addEventListener('click', () => select(i));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
    });
    svg.appendChild(g);
    entry.el = g;
  });
}

function select(i) {
  selectedIndex = i;
  CIRCLE.forEach((e, j) => e.el.classList.toggle('selected', j === i));
  document.getElementById('center-label').textContent = CIRCLE[i].label;
  droneRootMidi = pitchToMidi(CIRCLE[i].root, 3);
  retuneDrone();
  buildModes();
  renderKeySig();
}

// Draws the selected key's signature on a staff, in bass or treble clef.
function renderKeySig() {
  const svg = document.getElementById('keysig');
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const treble = document.getElementById('toggle-treble').checked;
  const sig = CIRCLE[selectedIndex].sig;
  const stepY = 8, lineGap = 16, topY = 42, baseY = topY + 4 * lineGap;
  const x0 = 6, x1 = 162;
  const posY = (pos) => baseY - pos * stepY;

  for (let i = 0; i < 5; i++) {
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('class', 'staff-line');
    ln.setAttribute('x1', x0); ln.setAttribute('x2', x1);
    ln.setAttribute('y1', topY + i * lineGap); ln.setAttribute('y2', topY + i * lineGap);
    svg.appendChild(ln);
  }

  const clef = document.createElementNS(NS, 'text');
  clef.setAttribute('class', 'clef');
  clef.setAttribute('x', 10);
  clef.setAttribute('y', treble ? baseY - 4 : baseY - 40);
  clef.setAttribute('font-size', treble ? 72 : 52);
  clef.textContent = treble ? '\u{1D11E}' : '\u{1D122}';
  svg.appendChild(clef);

  const sharps = sig > 0;
  const count = Math.abs(sig);
  const posArr = sharps ? SHARP_POS_TREBLE : FLAT_POS_TREBLE;
  const glyph = sharps ? '♯' : '♭';
  const startX = 50, spacing = 14;
  for (let i = 0; i < count; i++) {
    const pos = posArr[i] - (treble ? 0 : 2);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('class', 'accidental');
    t.setAttribute('x', startX + i * spacing);
    t.setAttribute('y', posY(pos));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.textContent = glyph;
    svg.appendChild(t);
  }
}

function buildModes() {
  const root = CIRCLE[selectedIndex].root;
  const label = CIRCLE[selectedIndex].label;
  const base = pitchToMidi(root, 4);
  const wrap = document.getElementById('modes');
  wrap.innerHTML = '';
  const list = showModes ? MODES : MODES.filter(m => m.basic);
  list.forEach(mode => {
    const row = document.createElement('div');
    row.className = 'mode-row';
    const name = document.createElement('span');
    name.className = 'mode-name';
    const display = (!showModes && mode.basicName) ? mode.basicName : mode.name;
    name.textContent = `${label} ${display}`;
    const asc = document.createElement('button');
    asc.type = 'button';
    asc.textContent = autoDescend ? '▲▼ up + down' : '▲ ascending';
    asc.addEventListener('click', () =>
      playSequence(base, autoDescend ? seqUpDown(mode) : seqAsc(mode)));
    const desc = document.createElement('button');
    desc.type = 'button';
    desc.textContent = '▼ descending';
    desc.addEventListener('click', () => playSequence(base, seqDesc(mode)));
    row.append(name, asc, desc);
    wrap.appendChild(row);
  });
}

function initDroneControls() {
  document.getElementById('drone-btn').addEventListener('click', () => {
    droneNodes ? stopDrone() : startDrone();
  });
  const fifth = document.getElementById('drone-fifth');
  fifth.addEventListener('change', () => {
    fifthOn = fifth.checked;
    if (droneNodes) {
      droneNodes.fifthGain.gain.setTargetAtTime(fifthOn ? 1 : 0, droneNodes.ctx.currentTime, 0.03);
    }
  });
  const vol = document.getElementById('drone-volume');
  droneVolume = parseFloat(vol.value);
  vol.addEventListener('input', () => {
    droneVolume = parseFloat(vol.value);
    if (droneNodes) {
      droneNodes.gain.gain.setTargetAtTime(droneVolume, droneNodes.ctx.currentTime, 0.03);
    }
  });
}

function initScaleOptions() {
  const ad = document.getElementById('auto-descend');
  ad.addEventListener('change', () => {
    autoDescend = ad.checked;
    buildModes();
  });
}

function initViewToggles() {
  const svg = document.getElementById('circle');
  const sig = document.getElementById('toggle-sig');
  sig.addEventListener('change', () => svg.classList.toggle('show-sig', sig.checked));

  const modes = document.getElementById('toggle-modes');
  modes.addEventListener('change', () => {
    showModes = modes.checked;
    buildModes();
  });

  const keysig = document.getElementById('toggle-keysig');
  const clefToggle = document.getElementById('clef-toggle');
  const staff = document.getElementById('keysig');
  keysig.addEventListener('change', () => {
    staff.classList.toggle('active', keysig.checked);
    clefToggle.style.display = keysig.checked ? 'inline-flex' : 'none';
    renderKeySig();
  });
  document.getElementById('toggle-treble').addEventListener('change', renderKeySig);
}

buildCircle();
initDroneControls();
initScaleOptions();
initViewToggles();
select(selectedIndex);
