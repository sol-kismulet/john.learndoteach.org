// Chords exploration page.
//
// Stage 1: the circle of fifths picks a root, a quality menu builds the chord,
// and a focus panel ("now showing") spells the notes and plays them as a block
// or a rolled arpeggio. Audio helpers (pitchToMidi, the poly synth) live in
// audio.js. Later stages add the keyboard highlight, grand staff, inversions,
// extended vocabulary, and the diatonic / borrowed chord lists.

const NS = 'http://www.w3.org/2000/svg';

// Roots clockwise around the circle of fifths, starting at the top (same order
// as the scales page). `root` is the spelling used to build/label the chord;
// `alt` is the enharmonic shown beneath it.
const CIRCLE = [
  { label: 'C',  root: 'C'  },
  { label: 'G',  root: 'G'  },
  { label: 'D',  root: 'D'  },
  { label: 'A',  root: 'A'  },
  { label: 'E',  root: 'E'  },
  { label: 'B',  alt: 'C♭', root: 'B'  },
  { label: 'G♭', alt: 'F♯', root: 'Gb' },
  { label: 'D♭', alt: 'C♯', root: 'Db' },
  { label: 'A♭', root: 'Ab' },
  { label: 'E♭', root: 'Eb' },
  { label: 'B♭', root: 'Bb' },
  { label: 'F',  root: 'F'  },
];

// --- note spelling (same letter-name approach as scales.js) ----------------
// Spell each chord tone by letter so accidentals read correctly for the root
// (e.g. A♭ major = A♭ C E♭, and C dim7's seventh is B𝄫, not A).
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

function parseRoot(root) {
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

// --- chord qualities -------------------------------------------------------
// intervals: semitone offsets from the root. letterSteps: how many letter-names
// above the root each tone spans, so it spells correctly (a 7th is 6 letters
// up, a 9th is 1 letter up an octave, etc.). symbol: suffix appended to the
// root for the chord name (major triad has none, so it shows just the root).
const QUALITIES = [
  { key: 'maj',    label: 'major',                 symbol: '',      group: 'triad',     intervals: [0, 4, 7],         letterSteps: [0, 2, 4] },
  { key: 'min',    label: 'minor',                 symbol: 'm',     group: 'triad',     intervals: [0, 3, 7],         letterSteps: [0, 2, 4] },
  { key: 'dim',    label: 'diminished',            symbol: 'dim',   group: 'triad',     intervals: [0, 3, 6],         letterSteps: [0, 2, 4] },
  { key: 'aug',    label: 'augmented',             symbol: 'aug',   group: 'triad',     intervals: [0, 4, 8],         letterSteps: [0, 2, 4] },

  { key: '6',      label: 'major 6th',             symbol: '6',     group: 'sixth',     intervals: [0, 4, 7, 9],      letterSteps: [0, 2, 4, 5] },
  { key: 'm6',     label: 'minor 6th',             symbol: 'm6',    group: 'sixth',     intervals: [0, 3, 7, 9],      letterSteps: [0, 2, 4, 5] },
  { key: '69',     label: '6/9',                   symbol: '6/9',   group: 'sixth',     intervals: [0, 4, 7, 9, 14],  letterSteps: [0, 2, 4, 5, 1] },

  { key: '7',      label: 'dominant 7th',          symbol: '7',     group: 'seventh',   intervals: [0, 4, 7, 10],     letterSteps: [0, 2, 4, 6] },
  { key: 'maj7',   label: 'major 7th',             symbol: 'maj7',  group: 'seventh',   intervals: [0, 4, 7, 11],     letterSteps: [0, 2, 4, 6] },
  { key: 'm7',     label: 'minor 7th',             symbol: 'm7',    group: 'seventh',   intervals: [0, 3, 7, 10],     letterSteps: [0, 2, 4, 6] },
  { key: 'dim7',   label: 'diminished 7th',        symbol: 'dim7',  group: 'seventh',   intervals: [0, 3, 6, 9],      letterSteps: [0, 2, 4, 6] },
  { key: 'm7b5',   label: 'half-diminished (m7♭5)', symbol: 'm7♭5', group: 'seventh',   intervals: [0, 3, 6, 10],     letterSteps: [0, 2, 4, 6] },
  { key: 'mMaj7',  label: 'minor-major 7th',       symbol: 'm(maj7)', group: 'seventh', intervals: [0, 3, 7, 11],     letterSteps: [0, 2, 4, 6] },
  { key: 'aug7',   label: 'augmented 7th (7♯5)',   symbol: '7♯5',   group: 'seventh',   intervals: [0, 4, 8, 10],     letterSteps: [0, 2, 4, 6] },

  { key: 'sus2',   label: 'sus2',                  symbol: 'sus2',  group: 'added',     intervals: [0, 2, 7],         letterSteps: [0, 1, 4] },
  { key: 'sus4',   label: 'sus4',                  symbol: 'sus4',  group: 'added',     intervals: [0, 5, 7],         letterSteps: [0, 3, 4] },
  { key: '7sus4',  label: '7sus4',                 symbol: '7sus4', group: 'added',     intervals: [0, 5, 7, 10],     letterSteps: [0, 3, 4, 6] },
  { key: 'add9',   label: 'add9',                  symbol: 'add9',  group: 'added',     intervals: [0, 4, 7, 14],     letterSteps: [0, 2, 4, 1] },
];

const GROUP_LABEL = {
  triad: 'triads',
  sixth: 'sixths',
  seventh: 'sevenths',
  added: 'suspended / added',
};

const { pitchToMidi } = AudioKit;

let rootIndex = 0;        // index into CIRCLE
let qualityIndex = 0;     // index into QUALITIES
let firstInversion = false;

// --- chord building --------------------------------------------------------
// One source of truth: build the voicing as an ordered list of { midi, name },
// applying first inversion if active (the root jumps up an octave so the 3rd
// — or whatever the next tone is — becomes the bass). Everything downstream
// (display, keyboard, playback) reads from this list.
function buildVoicing(root, quality) {
  const { letterIdx, pc } = parseRoot(root);
  const base = pitchToMidi(root, 4);
  const tones = quality.intervals.map((iv, i) => ({
    midi: base + iv,
    name: spellPc((letterIdx + quality.letterSteps[i]) % 7, (pc + iv) % 12),
  }));
  if (firstInversion && tones.length > 1) {
    tones[0].midi += 12;
    tones.sort((a, b) => a.midi - b.midi);
  }
  return tones;
}

function chordName(root, quality, voicing) {
  const { letterIdx, pc } = parseRoot(root);
  const base = spellPc(letterIdx, pc) + quality.symbol;
  if (!firstInversion || quality.intervals.length < 2) return base;
  // Slash chord: lowest voiced tone over the chord symbol (e.g. C/E).
  return base + '/' + voicing[0].name;
}

// --- playback (poly synth in audio.js) -------------------------------------
// AudioKit installs global resume handlers on visibilitychange + first gesture,
// so no per-page wiring is needed for sound to recover after backgrounding.
const synth = AudioKit.createPolySynth();
// iOS still needs the silent-buffer kickstart on first user gesture for sound
// to come out at all on a fresh page load.
['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(ev =>
  window.addEventListener(ev, () => synth.unlock(), true));

let playTimers = [];
let activeBtn = null;

function stopChord() {
  playTimers.forEach(id => clearTimeout(id));
  playTimers = [];
  synth.allOff();
  clearHighlights();
  if (activeBtn) { activeBtn.classList.remove('playing'); activeBtn = null; }
}

// Play the current chord. mode 'block' strikes all tones together; 'arp' rolls
// them low-to-high and lets them ring as a chord, then releases.
function play(mode, btn) {
  const wasActive = activeBtn === btn;
  stopChord();
  if (wasActive) return; // clicking the lit button again stops
  const midis = buildVoicing(CIRCLE[rootIndex].root, QUALITIES[qualityIndex]).map(t => t.midi);
  activeBtn = btn;
  btn.classList.add('playing');
  if (mode === 'block') {
    midis.forEach(m => { synth.noteOn(m); highlightKey(m, true); });
    playTimers.push(setTimeout(stopChord, 1800));
  } else {
    const step = 180; // ms between rolled notes
    midis.forEach((m, i) => playTimers.push(setTimeout(() => {
      synth.noteOn(m);
      highlightKey(m, true);
    }, i * step)));
    playTimers.push(setTimeout(stopChord, midis.length * step + 1400));
  }
}

// --- mini keyboard ---------------------------------------------------------
// A small two-octave-plus piano under the circle that lights up to show the
// chord as it sounds. C4–D6 covers every supported quality in both root
// position and first inversion (e.g. B add9 first inversion tops out at C♯6).
const KBD_LOW = 60, KBD_HIGH = 86;
const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const pcOf = m => ((m % 12) + 12) % 12;

function buildMiniKeyboard() {
  const k = document.getElementById('mini-kbd');
  for (let m = KBD_LOW; m <= KBD_HIGH; m++) {
    if (!WHITE_PCS.has(pcOf(m))) continue;
    const w = document.createElement('div');
    w.className = 'mini-key white';
    w.dataset.midi = m;
    // The black key (if any) sits as a child of the white key to its left so
    // it straddles the boundary cleanly — same trick as the keyboard page.
    const bm = m + 1;
    if (bm <= KBD_HIGH && !WHITE_PCS.has(pcOf(bm))) {
      const b = document.createElement('div');
      b.className = 'mini-key black';
      b.dataset.midi = bm;
      w.appendChild(b);
    }
    k.appendChild(w);
  }
}

function highlightKey(midi, on) {
  const el = document.querySelector(`.mini-key[data-midi="${midi}"]`);
  if (el) el.classList.toggle('on', on);
}

function clearHighlights() {
  document.querySelectorAll('.mini-key.on').forEach(el => el.classList.remove('on'));
}

// --- UI --------------------------------------------------------------------
function buildCircle() {
  const svg = document.getElementById('circle');
  const cx = 180, cy = 180, ringR = 118;
  CIRCLE.forEach((entry, i) => {
    const ang = (-90 + i * 30) * Math.PI / 180;
    const x = cx + ringR * Math.cos(ang);
    const y = cy + ringR * Math.sin(ang);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'node');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${entry.label}${entry.alt ? ' or ' + entry.alt : ''}`);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 24);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('y', entry.alt ? y - 6 : y);
    t.textContent = entry.label;
    g.append(c, t);
    if (entry.alt) {
      const a = document.createElementNS(NS, 'text');
      a.setAttribute('class', 'alt');
      a.setAttribute('x', x); a.setAttribute('y', y + 9);
      a.setAttribute('text-anchor', 'middle');
      a.setAttribute('dominant-baseline', 'central');
      a.textContent = entry.alt;
      g.appendChild(a);
    }
    g.addEventListener('click', () => selectRoot(i));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRoot(i); }
    });
    svg.appendChild(g);
    entry.el = g;
  });
}

function buildQualityMenu() {
  const sel = document.getElementById('quality');
  let lastGroup = null;
  let optgroup = null;
  QUALITIES.forEach((q, i) => {
    if (q.group !== lastGroup) {
      optgroup = document.createElement('optgroup');
      optgroup.label = GROUP_LABEL[q.group];
      sel.appendChild(optgroup);
      lastGroup = q.group;
    }
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = q.label;
    optgroup.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    qualityIndex = parseInt(sel.value, 10);
    renderFocus();
  });
}

function selectRoot(i) {
  rootIndex = i;
  CIRCLE.forEach((e, j) => e.el.classList.toggle('selected', j === i));
  renderFocus();
}

function renderFocus() {
  stopChord(); // changing the chord shouldn't leave the old one ringing
  const root = CIRCLE[rootIndex].root;
  const quality = QUALITIES[qualityIndex];
  const voicing = buildVoicing(root, quality);
  document.getElementById('chord-name').textContent = chordName(root, quality, voicing);
  document.getElementById('chord-quality').textContent =
    quality.label + (firstInversion && quality.intervals.length > 1 ? ' (1st inversion)' : '');
  document.getElementById('chord-notes').textContent = voicing.map(t => t.name).join(' – ');
}

document.getElementById('tone').addEventListener('change', e => {
  stopChord();
  synth.setInstrument(e.target.value);
});
document.getElementById('invert').addEventListener('change', e => {
  firstInversion = e.target.checked;
  renderFocus();
});
document.getElementById('play-block').addEventListener('click', e => play('block', e.currentTarget));
document.getElementById('play-arp').addEventListener('click', e => play('arp', e.currentTarget));

buildCircle();
buildQualityMenu();
buildMiniKeyboard();
selectRoot(0);
