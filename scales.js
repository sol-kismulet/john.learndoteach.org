// Scales practice page. Circle-of-fifths selector picks the tonal center; each
// scale gets ascending and descending playback; an optional root+fifth drone.
// Audio helpers (pitchToMidi, playSequence, the drone engine) live in audio.js.

const NS = 'http://www.w3.org/2000/svg';

// Tonal centers clockwise around the circle of fifths, starting at the top.
// sig = major-key signature: positive = sharps, negative = flats.
const CIRCLE = [
  { label: 'C',  root: 'C',  sig: 0,  minor: 'Am' },
  { label: 'G',  root: 'G',  sig: 1,  minor: 'Em' },
  { label: 'D',  root: 'D',  sig: 2,  minor: 'Bm' },
  { label: 'A',  root: 'A',  sig: 3,  minor: 'F♯m' },
  { label: 'E',  root: 'E',  sig: 4,  minor: 'C♯m' },
  { label: 'B',  alt: 'C♭', root: 'B',  sig: 5,  minor: 'G♯m', minorAlt: 'A♭m' },
  { label: 'G♭', alt: 'F♯', root: 'Gb', sig: -6, minor: 'E♭m', minorAlt: 'D♯m' },
  { label: 'D♭', alt: 'C♯', root: 'Db', sig: -5, minor: 'B♭m', minorAlt: 'A♯m' },
  { label: 'A♭', root: 'Ab', sig: -4, minor: 'Fm' },
  { label: 'E♭', root: 'Eb', sig: -3, minor: 'Cm' },
  { label: 'B♭', root: 'Bb', sig: -2, minor: 'Gm' },
  { label: 'F',  root: 'F',  sig: -1, minor: 'Dm' },
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

// Semitone offsets from the tonic, including the octave (one octave).
// group: 'basic' rows always show (with the friendlier basicName); 'mode' and
// 'other' rows only appear under "show additional scales", under group headings.
// descIntervals: distinct descending form (melodic minor goes up raised,
// down as natural minor); when absent, descending is just the reverse.
const MODES = [
  { name: 'Ionian (major)',          basicName: 'Major',         group: 'basic', intervals: [0, 2, 4, 5, 7, 9, 11, 12] },
  { name: 'Melodic minor',           basicName: 'Melodic minor', group: 'basic', intervals: [0, 2, 3, 5, 7, 9, 11, 12], descIntervals: [0, 2, 3, 5, 7, 8, 10, 12] },
  { name: 'Aeolian (natural minor)', basicName: 'Natural minor', group: 'basic', intervals: [0, 2, 3, 5, 7, 8, 10, 12] },
  { name: 'Dorian',                  group: 'mode',  intervals: [0, 2, 3, 5, 7, 9, 10, 12] },
  { name: 'Phrygian',                group: 'mode',  intervals: [0, 1, 3, 5, 7, 8, 10, 12] },
  { name: 'Lydian',                  group: 'mode',  intervals: [0, 2, 4, 6, 7, 9, 11, 12] },
  { name: 'Mixolydian',              group: 'mode',  intervals: [0, 2, 4, 5, 7, 9, 10, 12] },
  { name: 'Locrian',                 group: 'mode',  intervals: [0, 1, 3, 5, 6, 8, 10, 12] },
  { name: 'Major pentatonic',        group: 'other', intervals: [0, 2, 4, 7, 9, 12] },
  { name: 'Minor pentatonic',        group: 'other', intervals: [0, 3, 5, 7, 10, 12] },
  { name: 'Whole tone',              group: 'other', intervals: [0, 2, 4, 6, 8, 10, 12] },
  { name: 'Chromatic',               group: 'other', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];

const GROUP_LABEL = { mode: 'modes', other: 'other scales' };

let selectedIndex = 0; // default C
let showExtra = false; // "show additional scales"
let octaves = 1;

const { pitchToMidi } = AudioKit;

// --- scale playback ---
let autoDescend = false;
let tempoBpm = 120;
let articulation = 'legato';
let loopOn = false;
let repeatEnds = false; // when looping, repeat the turnaround (top/bottom) notes
let playingButton = null; // the play button whose scale is currently sounding
let currentPlay = null; // { baseMidi, makeSeq, rowReadout } for re-triggering a loop

// Note value per beat: how many scale notes fit in one quarter-note beat.
let subdivIndex = 0;
const SUBDIVS = [
  { label: '♩', name: 'quarter',   perBeat: 1 },
  { label: '♪', name: 'eighth',    perBeat: 2 },
  { label: '♪³', name: 'triplet',  perBeat: 3 },
  { label: '♬', name: 'sixteenth', perBeat: 4 },
];

// gate = fraction of the beat the note sounds; sustain = held level (0 = plucked,
// for staccato); atk/release = envelope edges. Tuned so legato actually connects.
const ARTIC = {
  staccato: { gate: 0.32, atk: 0.004, sustain: 0,    release: 0.04 },
  portato:  { gate: 0.62, atk: 0.010, sustain: 0.55, release: 0.06 },
  legato:   { gate: 1.0,  atk: 0.025, sustain: 0.9,  release: 0.06 },
};

// Expand a one-octave interval set (ending on 12) across `octaves` octaves,
// e.g. major over 2 octaves -> 0,2,4,5,7,9,11,12,14,16,17,19,21,23,24.
function expand(oneOctave, n) {
  const degrees = oneOctave.slice(0, -1);
  const out = [];
  for (let o = 0; o < n; o++) for (const d of degrees) out.push(d + 12 * o);
  out.push(12 * n);
  return out;
}

// Sequence builders (semitone offsets from the tonic, across `octaves`). A mode
// may carry a distinct descIntervals (e.g. melodic minor); otherwise descending
// is just the ascending form reversed.
const seqAsc = (mode) => expand(mode.intervals, octaves);
const seqDesc = (mode) => expand(mode.descIntervals || mode.intervals, octaves).reverse();
// up then back down, with the top note as a single turnaround.
const seqUpDown = (mode) => {
  const up = expand(mode.intervals, octaves);
  const down = expand(mode.descIntervals || mode.intervals, octaves);
  return up.concat(down.slice(0, -1).reverse());
};

function clearReadouts() {
  const center = document.getElementById('playing-note');
  if (center) center.textContent = '';
  document.querySelectorAll('.note-readout').forEach(el => { el.textContent = ''; });
}

// Stop whatever scale is sounding and reset the play-button state.
function stopPlayback() {
  AudioKit.stopSequence();
  if (playingButton) playingButton.classList.remove('playing');
  playingButton = null;
  currentPlay = null;
  clearReadouts();
}

// Click handler for a play button: toggles stop if it's already this button's
// scale, otherwise switches to the new scale (never stacks two at once).
function togglePlay(button, baseMidi, makeSeq, rowReadout) {
  if (playingButton === button) { stopPlayback(); return; }
  if (playingButton) playingButton.classList.remove('playing');
  playingButton = button;
  button.classList.add('playing');
  currentPlay = { baseMidi, makeSeq, rowReadout };
  runSequence(baseMidi, makeSeq, rowReadout);
}

// Re-trigger the current looping scale so a toggled option takes effect now
// instead of only after a manual stop/restart.
function restartIfLooping() {
  if (playingButton && loopOn && currentPlay) {
    runSequence(currentPlay.baseMidi, currentPlay.makeSeq, currentPlay.rowReadout);
  }
}

function runSequence(baseMidi, makeSeq, rowReadout) {
  const seq = makeSeq();
  const step = (60 / tempoBpm) / SUBDIVS[subdivIndex].perBeat;
  const art = ARTIC[articulation] || ARTIC.legato;
  const preferFlats = CIRCLE[selectedIndex].sig < 0;
  const center = document.getElementById('playing-note');
  clearReadouts();
  // When looping without repeating the turnaround, drop a trailing note that
  // duplicates the first (e.g. up-then-down) so the bottom isn't struck twice.
  const noRepeat = loopOn && !repeatEnds && seq.length > 1 && seq[0] === seq[seq.length - 1];
  const toPlay = noRepeat ? seq.slice(0, -1) : seq;
  AudioKit.playSequence(baseMidi, toPlay, {
    step,
    gate: step * art.gate,
    attack: art.atk,
    sustain: art.sustain,
    release: art.release,
    onNote: (semi) => {
      const name = AudioKit.midiToName(baseMidi + semi, preferFlats);
      if (center) center.textContent = name;
      if (rowReadout) rowReadout.textContent = name;
    },
    onEnd: () => {
      if (loopOn && playingButton) {
        runSequence(baseMidi, makeSeq, rowReadout); // re-evaluate trim/options each pass
      } else {
        stopPlayback();
      }
    },
  });
}

// --- drone (root + optional fifth), shared engine in audio.js ---
const drone = AudioKit.createDrone();
drone.setRoot(pitchToMidi(CIRCLE[selectedIndex].root, 3));

// --- UI ---
function buildCircle() {
  const svg = document.getElementById('circle');
  const cx = 180, cy = 180, ringR = 118, sigR = 152, minorR = 74;
  CIRCLE.forEach((entry, i) => {
    const ang = (-90 + i * 30) * Math.PI / 180;
    const x = cx + ringR * Math.cos(ang);
    const y = cy + ringR * Math.sin(ang);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'node');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${entry.label}${entry.alt ? ' or ' + entry.alt : ''}, ${sigLabel(entry.sig)}`);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 24);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('y', entry.alt ? y - 6 : y); // shift up to make room for the enharmonic
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
    if (entry.alt) {
      const a = document.createElementNS(NS, 'text');
      a.setAttribute('class', 'alt');
      a.setAttribute('x', x); a.setAttribute('y', y + 9);
      a.setAttribute('text-anchor', 'middle');
      a.setAttribute('dominant-baseline', 'central');
      a.textContent = entry.alt;
      g.appendChild(a);
    }
    // relative minor, on the inner ring (informational, not a click target)
    const m = document.createElementNS(NS, 'text');
    m.setAttribute('class', 'minor');
    m.setAttribute('x', cx + minorR * Math.cos(ang));
    m.setAttribute('y', cy + minorR * Math.sin(ang));
    m.setAttribute('text-anchor', 'middle');
    m.setAttribute('dominant-baseline', 'central');
    m.textContent = entry.minor;
    g.appendChild(m);
    g.addEventListener('click', () => select(i));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); }
    });
    svg.appendChild(g);
    entry.el = g;
  });

  // Center readout for the note currently sounding during scale playback.
  const playing = document.createElementNS(NS, 'text');
  playing.setAttribute('id', 'playing-note');
  playing.setAttribute('x', cx);
  playing.setAttribute('y', cy);
  playing.setAttribute('text-anchor', 'middle');
  playing.setAttribute('dominant-baseline', 'central');
  svg.appendChild(playing);
}

function select(i) {
  selectedIndex = i;
  CIRCLE.forEach((e, j) => e.el.classList.toggle('selected', j === i));
  const c = CIRCLE[i];
  document.getElementById('center-label').textContent = c.alt ? `${c.label} / ${c.alt}` : c.label;
  drone.setRoot(pitchToMidi(CIRCLE[i].root, 3));
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
  stopPlayback(); // rebuilding replaces the buttons; don't leave an orphan scale
  const root = CIRCLE[selectedIndex].root;
  const label = CIRCLE[selectedIndex].label;
  const base = pitchToMidi(root, 4);
  const wrap = document.getElementById('modes');
  wrap.innerHTML = '';
  const list = showExtra ? MODES : MODES.filter(m => m.group === 'basic');
  let lastGroup = null;
  list.forEach(mode => {
    if (mode.group !== 'basic' && mode.group !== lastGroup) {
      const h = document.createElement('div');
      h.className = 'mode-group';
      h.textContent = GROUP_LABEL[mode.group];
      wrap.appendChild(h);
    }
    lastGroup = mode.group;
    const row = document.createElement('div');
    row.className = 'mode-row';
    const name = document.createElement('span');
    name.className = 'mode-name';
    const labelEl = document.createElement('span');
    labelEl.className = 'mode-label';
    const display = mode.basicName || mode.name;
    labelEl.textContent = `${label} ${display}`;
    // Per-row note readout, shown in the empty space before the button so the
    // sounding note stays visible when the circle is scrolled off-screen.
    const readout = document.createElement('span');
    readout.className = 'note-readout';
    name.append(labelEl, readout);
    const asc = document.createElement('button');
    asc.type = 'button';
    asc.textContent = autoDescend ? '▲▼ up + down' : '▲ ascending';
    asc.addEventListener('click', () =>
      togglePlay(asc, base, () => (autoDescend ? seqUpDown(mode) : seqAsc(mode)), readout));
    const desc = document.createElement('button');
    desc.type = 'button';
    desc.textContent = '▼ descending';
    desc.addEventListener('click', () => togglePlay(desc, base, () => seqDesc(mode), readout));
    row.append(name, asc, desc);
    wrap.appendChild(row);
  });
}

function initDroneControls() {
  const btn = document.getElementById('drone-btn');
  btn.addEventListener('click', () => {
    if (drone.playing) {
      drone.stop();
      btn.textContent = 'drone';
      btn.classList.remove('on');
    } else {
      drone.start();
      btn.textContent = 'stop drone';
      btn.classList.add('on');
    }
  });
  const fifth = document.getElementById('drone-fifth');
  fifth.addEventListener('change', () => drone.setFifth(fifth.checked));
  const vol = document.getElementById('drone-volume');
  drone.setVolume(parseFloat(vol.value));
  vol.addEventListener('input', () => drone.setVolume(parseFloat(vol.value)));
}

function initScaleOptions() {
  const ad = document.getElementById('auto-descend');
  ad.addEventListener('change', () => {
    autoDescend = ad.checked;
    buildModes();
  });

  const oct = document.getElementById('octaves');
  const octVal = document.getElementById('octaves-val');
  octaves = parseInt(oct.value, 10);
  octVal.textContent = octaves;
  oct.addEventListener('input', () => {
    octaves = parseInt(oct.value, 10);
    octVal.textContent = octaves;
  });

  const tempo = document.getElementById('tempo');
  tempoBpm = parseInt(tempo.value, 10);
  tempo.addEventListener('input', () => {
    const v = parseInt(tempo.value, 10);
    if (Number.isFinite(v) && v > 0) tempoBpm = v;
  });

  const subdiv = document.getElementById('subdiv');
  const subdivVal = document.getElementById('subdiv-val');
  const showSubdiv = () => {
    const s = SUBDIVS[subdivIndex];
    subdivVal.textContent = `${s.label} ${s.name}`;
  };
  subdivIndex = parseInt(subdiv.value, 10);
  showSubdiv();
  subdiv.addEventListener('input', () => {
    subdivIndex = parseInt(subdiv.value, 10);
    showSubdiv();
  });

  const loop = document.getElementById('loop');
  loopOn = loop.checked;
  loop.addEventListener('change', () => { loopOn = loop.checked; });

  const repeat = document.getElementById('repeat-ends');
  repeatEnds = repeat.checked;
  repeat.addEventListener('change', () => {
    repeatEnds = repeat.checked;
    restartIfLooping(); // apply immediately to a running loop
  });

  const artic = document.getElementById('articulation');
  articulation = artic.value;
  artic.addEventListener('change', () => { articulation = artic.value; });
}

function initViewToggles() {
  const svg = document.getElementById('circle');
  const sig = document.getElementById('toggle-sig');
  sig.addEventListener('change', () => svg.classList.toggle('show-sig', sig.checked));

  const extra = document.getElementById('toggle-extra');
  extra.addEventListener('change', () => {
    showExtra = extra.checked;
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
