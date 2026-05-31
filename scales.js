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
// letterSteps: how many letter-names above the tonic each degree spans, so notes
// spell correctly (A♭ Dorian's 3rd is C♭, not B). Omitted = no diatonic spelling
// (chromatic), falls back to sharps/flats by key.
const MODES = [
  { name: 'Ionian (major)',          basicName: 'Major',         group: 'basic', intervals: [0, 2, 4, 5, 7, 9, 11, 12], letterSteps: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'Melodic minor',           basicName: 'Melodic minor', group: 'basic', intervals: [0, 2, 3, 5, 7, 9, 11, 12], descIntervals: [0, 2, 3, 5, 7, 8, 10, 12], letterSteps: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'Aeolian (natural minor)', basicName: 'Natural minor', group: 'basic', intervals: [0, 2, 3, 5, 7, 8, 10, 12], letterSteps: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'Dorian',                  group: 'mode',  intervals: [0, 2, 3, 5, 7, 9, 10, 12], letterSteps: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'Phrygian',                group: 'mode',  intervals: [0, 1, 3, 5, 7, 8, 10, 12], letterSteps: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'Lydian',                  group: 'mode',  intervals: [0, 2, 4, 6, 7, 9, 11, 12], letterSteps: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'Mixolydian',              group: 'mode',  intervals: [0, 2, 4, 5, 7, 9, 10, 12], letterSteps: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'Locrian',                 group: 'mode',  intervals: [0, 1, 3, 5, 6, 8, 10, 12], letterSteps: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'Harmonic minor',          group: 'other', intervals: [0, 2, 3, 5, 7, 8, 11, 12], letterSteps: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: 'Major pentatonic',        group: 'other', intervals: [0, 2, 4, 7, 9, 12], letterSteps: [0, 1, 2, 4, 5, 7] },
  { name: 'Minor pentatonic',        group: 'other', intervals: [0, 3, 5, 7, 10, 12], letterSteps: [0, 2, 3, 4, 6, 7] },
  { name: 'Whole tone',              group: 'other', intervals: [0, 2, 4, 6, 8, 10, 12], letterSteps: [0, 1, 2, 3, 4, 5, 7] },
  { name: 'Chromatic',               group: 'other', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
];

// --- note spelling -------------------------------------------------------
// Spell scale notes by letter name so accidentals are correct for the key
// (e.g. A♭ Dorian: A♭ B♭ C♭ D♭ E♭ F G♭ — not ...B...).
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

function parseTonic(root) {
  const li = LETTERS.indexOf(root[0].toUpperCase());
  const acc = root[1] === 'b' || root[1] === '♭' ? -1 : (root[1] === '#' || root[1] === '♯' ? 1 : 0);
  return { letterIdx: li, pc: (LETTER_PC[li] + acc + 12) % 12 };
}

function spellPc(letterIdx, pc) {
  const diff = ((pc - LETTER_PC[letterIdx] + 6) % 12 + 12) % 12 - 6; // nearest signed offset
  const glyphs = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
  const key = String(diff);
  const glyph = Object.prototype.hasOwnProperty.call(glyphs, key) ? glyphs[key] : '?';
  return LETTERS[letterIdx] + glyph;
}

// Map pitch-class -> spelled name for the scale's notes (and its descending
// form, if any). Returns null when the scale has no diatonic letter mapping.
function buildSpellMap(root, mode) {
  if (!mode.letterSteps) return null;
  const { letterIdx, pc: tonicPc } = parseTonic(root);
  if (letterIdx < 0) return null;
  const map = {};
  const add = (intervals) => intervals.forEach((iv, d) => {
    const step = mode.letterSteps[d];
    if (step == null) return;
    const li = (letterIdx + step) % 7;
    map[(tonicPc + iv) % 12] = spellPc(li, (tonicPc + iv) % 12);
  });
  add(mode.intervals);
  if (mode.descIntervals) add(mode.descIntervals);
  return map;
}

// Returns a function semi -> displayed note name for the given tonal center/scale.
function makeNamer(root, mode) {
  const base = pitchToMidi(root, 4);
  const preferFlats = CIRCLE[selectedIndex].sig < 0;
  const map = buildSpellMap(root, mode);
  return (semi) => {
    const pc = ((base + semi) % 12 + 12) % 12;
    return (map && map[pc] != null) ? map[pc] : AudioKit.midiToName(base + semi, preferFlats);
  };
}

const GROUP_LABEL = { mode: 'modes', other: 'other scales' };

let selectedIndex = 0; // default C
let showExtra = false; // "show additional scales"
let octaves = 1;

const { pitchToMidi } = AudioKit;

// --- scale playback ---
let autoDescend = false;
let tempoBpm = 112;
let articulation = 'legato';
let loopOn = false;
let repeatEnds = false; // when looping, repeat the turnaround (top/bottom) notes
let playingButton = null; // the play button whose scale is currently sounding
let currentPlay = null; // { baseMidi, makeSeq, rowReadout } for re-triggering a loop
let loopTimerId = null; // pending timer that schedules the next loop pass

// Note value per beat: how many scale notes fit in one quarter-note beat.
let subdivIndex = 0;
const SUBDIVS = [
  { label: '𝅝',  name: 'whole',     perBeat: 0.25 },
  { label: '𝅗𝅥',  name: 'half',      perBeat: 0.5  },
  { label: '♩',  name: 'quarter',   perBeat: 1 },
  { label: '♪',  name: 'eighth',    perBeat: 2 },
  { label: '♪³', name: 'triplet',   perBeat: 3 },
  { label: '♬',  name: 'sixteenth', perBeat: 4 },
];

// gate = fraction of the beat the note sounds; sustain = held level; atk/release
// = envelope edges. A smooth continuum: staccato is gently detached (not clipped),
// portato sits midway, legato fully connects.
const ARTIC = {
  staccato: { gate: 0.60, atk: 0.008, sustain: 0.50, release: 0.05 },
  portato:  { gate: 0.80, atk: 0.015, sustain: 0.70, release: 0.06 },
  legato:   { gate: 1.0,  atk: 0.025, sustain: 0.90, release: 0.06 },
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
  document.querySelectorAll('.row-staff .staff-note').forEach(g => {
    while (g.firstChild) g.removeChild(g.firstChild);
  });
}

// Reset the play-button/UI state without cancelling audio (lets the last note
// ring out naturally at the end of a pass).
function finishPlayback() {
  if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
  if (playingButton) playingButton.classList.remove('playing');
  playingButton = null;
  currentPlay = null;
  clearReadouts();
}

// User-initiated stop: silence any scheduled notes and reset.
function stopPlayback() {
  AudioKit.stopSequence();
  finishPlayback();
}

// Click handler for a play button: toggles stop if it's already this button's
// scale, otherwise switches to the new scale (never stacks two at once).
function togglePlay(button, baseMidi, makeSeq, rowReadout, namer, rowStaff) {
  if (playingButton === button) { stopPlayback(); return; }
  if (playingButton) playingButton.classList.remove('playing');
  if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
  playingButton = button;
  button.classList.add('playing');
  currentPlay = { baseMidi, makeSeq, rowReadout, namer, rowStaff };
  clearReadouts();
  schedulePass(baseMidi, makeSeq, rowReadout, namer, null, false, rowStaff);
}

// Re-trigger the current looping scale so a toggled option takes effect now
// instead of only after a manual stop/restart.
function restartIfLooping() {
  if (playingButton && loopOn && currentPlay) {
    if (loopTimerId) { clearTimeout(loopTimerId); loopTimerId = null; }
    clearReadouts();
    schedulePass(currentPlay.baseMidi, currentPlay.makeSeq, currentPlay.rowReadout, currentPlay.namer, null, false, currentPlay.rowStaff);
  }
}

// Play one pass, then either schedule the next pass exactly on the audio clock
// (gapless loop) or finish. `when` is the absolute start time (null = default
// lead-in); `chain` keeps the previous pass's tail so the seam is seamless.
function schedulePass(baseMidi, makeSeq, rowReadout, namer, when, chain, rowStaff) {
  const seq = makeSeq();
  const step = (60 / tempoBpm) / SUBDIVS[subdivIndex].perBeat;
  const art = ARTIC[articulation] || ARTIC.legato;
  const center = document.getElementById('playing-note');
  // When looping without repeating the turnaround, drop a trailing note that
  // duplicates the first (e.g. up-then-down) so the bottom isn't struck twice.
  const noRepeat = loopOn && !repeatEnds && seq.length > 1 && seq[0] === seq[seq.length - 1];
  const toPlay = noRepeat ? seq.slice(0, -1) : seq;
  const nextStart = AudioKit.playSequence(baseMidi, toPlay, {
    step,
    gate: step * art.gate,
    attack: art.atk,
    sustain: art.sustain,
    release: art.release,
    when,
    chain,
    onNote: (semi) => {
      const name = namer(semi);
      if (center) center.textContent = name;
      if (rowReadout) rowReadout.textContent = name;
      if (rowStaff) {
        const treble = document.getElementById('toggle-treble').checked;
        const sig = CIRCLE[selectedIndex].sig;
        highlightOnStaff(rowStaff, baseMidi + semi, name, sig, treble);
      }
    },
  });
  if (loopOn) {
    // Set up the next pass a touch before the seam so its notes are scheduled
    // ahead of time and the loop stays perfectly continuous.
    const lead = Math.min(0.1, toPlay.length * step * 0.5);
    const delay = Math.max(0, (nextStart - lead - AudioKit.currentTime()) * 1000);
    loopTimerId = setTimeout(() => {
      if (loopOn && playingButton) {
        schedulePass(baseMidi, makeSeq, rowReadout, namer, nextStart, true, rowStaff);
      } else {
        loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
      }
    }, delay);
  } else {
    loopTimerId = setTimeout(finishPlayback, Math.max(0, (nextStart - AudioKit.currentTime()) * 1000));
  }
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
}

// --- per-row mini staff ---------------------------------------------------
// Each scale row gets a small SVG staff (key sig + clef). When that row is
// playing, the current note is highlighted on the staff so the user learns
// where each pitch sits on the page. Static parts (lines, clef, key sig) are
// drawn once when the row is created; only the .staff-note group gets
// re-drawn on each note (and cleared when playback ends).
const ROW_STAFF = {
  width: 80, height: 32,
  topY: 8, lineGap: 4, stepY: 2,
  clefX: 4, sigStartX: 22, sigSpacing: 5,
  noteX: 64,
};

const ACC_GLYPHS = { '-2': '𝄫', '-1': '♭', '0': '♮', '1': '♯', '2': '𝄪' };

// Pick the octave so the natural letter pitch is closest to `midi`; lets
// enharmonic spellings (B♯ vs C, C♭ vs B) land on the right staff letter.
function staffPosFor(midi, letterIdx, treble) {
  const naturalPc = LETTER_PC[letterIdx];
  const octave = Math.round((midi - naturalPc) / 12) - 1;
  // treble: pos 0 = E4 (bottom line). bass: pos 0 = G2.
  return (letterIdx + 7 * octave) - (treble ? 30 : 18);
}

function parseSpelled(name) {
  if (!name) return null;
  const li = LETTERS.indexOf(name[0].toUpperCase());
  if (li < 0) return null;
  const accMap = { '': 0, '♯': 1, '♭': -1, '𝄪': 2, '𝄫': -2 };
  const acc = accMap[name.slice(1)];
  if (acc == null) return null;
  return { letterIdx: li, acc };
}

// What accidental does the key signature imply for this letter?
// +1 / -1 if the letter is sharped/flatted by the sig, else 0.
function keyDefaultAcc(letterIdx, sig) {
  const letter = LETTERS[letterIdx];
  if (sig > 0) return SHARP_ORDER.slice(0, sig).includes(letter) ? 1 : 0;
  if (sig < 0) return FLAT_ORDER.slice(0, -sig).includes(letter) ? -1 : 0;
  return 0;
}

function makeRowStaff(sig, treble) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'row-staff');
  svg.setAttribute('viewBox', `0 0 ${ROW_STAFF.width} ${ROW_STAFF.height}`);
  svg.setAttribute('aria-hidden', 'true');
  renderStaff(svg, sig, treble);
  return svg;
}

function renderStaff(svg, sig, treble) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const { topY, lineGap, stepY, clefX, sigStartX, sigSpacing, width } = ROW_STAFF;
  const baseY = topY + 4 * lineGap;
  const posY = (p) => baseY - p * stepY;

  for (let i = 0; i < 5; i++) {
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('class', 'staff-line');
    ln.setAttribute('x1', 2); ln.setAttribute('x2', width - 2);
    ln.setAttribute('y1', topY + i * lineGap); ln.setAttribute('y2', topY + i * lineGap);
    svg.appendChild(ln);
  }

  const clef = document.createElementNS(NS, 'text');
  clef.setAttribute('class', 'clef');
  clef.setAttribute('x', clefX);
  clef.setAttribute('y', treble ? baseY - 1 : baseY - 11);
  clef.setAttribute('font-size', treble ? 22 : 17);
  clef.textContent = treble ? '\u{1D11E}' : '\u{1D122}';
  svg.appendChild(clef);

  const sharps = sig > 0;
  const count = Math.abs(sig);
  const posArr = sharps ? SHARP_POS_TREBLE : FLAT_POS_TREBLE;
  const glyph = sharps ? '♯' : '♭';
  for (let i = 0; i < count; i++) {
    const pos = posArr[i] - (treble ? 0 : 2);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('class', 'accidental');
    t.setAttribute('x', sigStartX + i * sigSpacing);
    t.setAttribute('y', posY(pos));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.textContent = glyph;
    svg.appendChild(t);
  }

  // Empty target group for the highlighted notehead + any ledger lines.
  const noteG = document.createElementNS(NS, 'g');
  noteG.setAttribute('class', 'staff-note');
  svg.appendChild(noteG);
}

function highlightOnStaff(svg, midi, name, sig, treble) {
  const noteG = svg.querySelector('.staff-note');
  if (!noteG) return;
  while (noteG.firstChild) noteG.removeChild(noteG.firstChild);
  const parsed = parseSpelled(name);
  if (!parsed) return;
  const { letterIdx, acc } = parsed;
  const pos = staffPosFor(midi, letterIdx, treble);

  const { topY, lineGap, stepY, noteX } = ROW_STAFF;
  const baseY = topY + 4 * lineGap;
  const posY = (p) => baseY - p * stepY;
  const y = posY(pos);

  // Ledger lines (every even pos outside the staff lines 0..8).
  if (pos < 0) {
    for (let p = -2; p >= pos; p -= 2) addLedger(noteG, noteX, posY(p));
  } else if (pos > 8) {
    for (let p = 10; p <= pos; p += 2) addLedger(noteG, noteX, posY(p));
  }

  // Show an explicit accidental only when the note differs from the key sig.
  if (acc !== keyDefaultAcc(letterIdx, sig)) {
    const a = document.createElementNS(NS, 'text');
    a.setAttribute('class', 'note-acc');
    a.setAttribute('x', noteX - 7);
    a.setAttribute('y', y);
    a.setAttribute('text-anchor', 'middle');
    a.setAttribute('dominant-baseline', 'central');
    a.textContent = ACC_GLYPHS[String(acc)] || '';
    noteG.appendChild(a);
  }

  const head = document.createElementNS(NS, 'ellipse');
  head.setAttribute('class', 'notehead');
  head.setAttribute('cx', noteX);
  head.setAttribute('cy', y);
  head.setAttribute('rx', 3.4);
  head.setAttribute('ry', 2.5);
  head.setAttribute('transform', `rotate(-20 ${noteX} ${y})`);
  noteG.appendChild(head);
}

function addLedger(parent, x, y) {
  const ll = document.createElementNS(NS, 'line');
  ll.setAttribute('class', 'staff-line ledger');
  ll.setAttribute('x1', x - 5); ll.setAttribute('x2', x + 5);
  ll.setAttribute('y1', y); ll.setAttribute('y2', y);
  parent.appendChild(ll);
}

function buildModes() {
  stopPlayback(); // rebuilding replaces the buttons; don't leave an orphan scale
  const root = CIRCLE[selectedIndex].root;
  const label = CIRCLE[selectedIndex].label;
  const sig = CIRCLE[selectedIndex].sig;
  const treble = document.getElementById('toggle-treble').checked;
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
    // Staff (key sig) + note-readout sit together on the right of the row, so
    // the played note appears both on the staff and as text just beside it.
    const staffNote = document.createElement('span');
    staffNote.className = 'staff-and-note';
    const staff = makeRowStaff(sig, treble);
    const readout = document.createElement('span');
    readout.className = 'note-readout';
    staffNote.append(staff, readout);
    name.append(labelEl, staffNote);
    const namer = makeNamer(root, mode); // spells this scale's notes correctly
    const asc = document.createElement('button');
    asc.type = 'button';
    asc.append(makeArrow(autoDescend ? '▲▼' : '▲'), makeLabel(autoDescend ? 'up + down' : 'ascending'));
    asc.addEventListener('click', () =>
      togglePlay(asc, base, () => (autoDescend ? seqUpDown(mode) : seqAsc(mode)), readout, namer, staff));
    const desc = document.createElement('button');
    desc.type = 'button';
    desc.append(makeArrow('▼'), makeLabel('descending'));
    desc.addEventListener('click', () => togglePlay(desc, base, () => seqDesc(mode), readout, namer, staff));
    row.append(name, asc, desc);
    wrap.appendChild(row);
  });
}

// Build a play button's parts: the arrow always shows; the word label is hidden
// on narrow screens (via CSS) so the row fits on one line on mobile.
function makeArrow(glyph) {
  const s = document.createElement('span');
  s.className = 'btn-arrow';
  s.textContent = glyph;
  return s;
}
function makeLabel(text) {
  const s = document.createElement('span');
  s.className = 'btn-label';
  s.textContent = text;
  return s;
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
  const applyKeysig = () => {
    document.body.classList.toggle('show-staves', keysig.checked);
    clefToggle.style.display = keysig.checked ? 'inline-flex' : 'none';
  };
  applyKeysig();
  keysig.addEventListener('change', applyKeysig);

  document.getElementById('toggle-treble').addEventListener('change', () => {
    const ks = CIRCLE[selectedIndex].sig;
    const treble = document.getElementById('toggle-treble').checked;
    document.querySelectorAll('.row-staff').forEach(s => renderStaff(s, ks, treble));
  });
}

buildCircle();
initDroneControls();
initScaleOptions();
initViewToggles();
select(selectedIndex);
