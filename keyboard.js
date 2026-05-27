// Virtual keyboard page. Renders a piano (white keys flex-laid-out, black keys
// straddling the boundary between them) over a selectable range, and drives the
// polyphonic synth in audio.js. Plays with mouse/touch (glissando + multitouch)
// or the computer keyboard. Range, timbre (piano/cello), the tempered-fifth
// toggle, and note-name labels are all live.

const synth = AudioKit.createPolySynth();
const kbd = document.getElementById('keyboard');
const now = document.getElementById('now');

// iOS gates Web Audio behind a user gesture and suspends/"interrupts" the
// context whenever the page is backgrounded. Resume it on every interaction
// (capture phase, before play handlers) and when the tab becomes visible
// again, so sound keeps working without a refresh.
function resumeAudio() { synth.unlock(); }
['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach(ev =>
  window.addEventListener(ev, resumeAudio, true));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) synth.unlock();
});

// Low..high MIDI (inclusive), all starting/ending on C except the 88-key full
// range (A0–C8). Larger ranges grow downward then upward around middle C.
const RANGES = {
  '1': [60, 72],   // C4–C5
  '2': [48, 72],   // C3–C5
  '3': [48, 84],   // C3–C6
  '4': [36, 84],   // C2–C6
  '5': [36, 96],   // C2–C7
  '6': [24, 96],   // C1–C7
  '7': [24, 108],  // C1–C8
  'full': [21, 108], // A0–C8, 88 keys
};

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const pcOf = m => ((m % 12) + 12) % 12;

function noteLabel(midi) {
  return AudioKit.midiToName(midi, false) + (Math.floor(midi / 12) - 1);
}

let lowMidi = 48, highMidi = 72;

function build(rangeKey) {
  [lowMidi, highMidi] = RANGES[rangeKey] || RANGES['2'];
  kbd.innerHTML = '';
  for (let m = lowMidi; m <= highMidi; m++) {
    if (!WHITE_PCS.has(pcOf(m))) continue; // black keys are added as children below
    const white = document.createElement('div');
    white.className = 'key white';
    white.dataset.midi = m;
    const label = document.createElement('span');
    label.className = 'label';
    const name = AudioKit.midiToName(m, false);
    label.textContent = name === 'C' ? noteLabel(m) : name;
    if (name === 'C') label.classList.add('tonic');
    white.appendChild(label);
    // Black key immediately to the right of this white, if any and in range.
    const bm = m + 1;
    if (bm <= highMidi && !WHITE_PCS.has(pcOf(bm))) {
      const black = document.createElement('div');
      black.className = 'key black';
      black.dataset.midi = bm;
      white.appendChild(black);
    }
    kbd.appendChild(white);
  }
}

function keyEl(midi) {
  return kbd.querySelector('.key[data-midi="' + midi + '"]');
}

function press(midi) {
  if (awaitingGuess) guess(midi); // first press during a pitch test is the answer
  synth.noteOn(midi);
  const el = keyEl(midi);
  if (el) el.classList.add('on');
  now.textContent = noteLabel(midi);
}

function lift(midi) {
  synth.noteOff(midi);
  const el = keyEl(midi);
  if (el) el.classList.remove('on');
}

// --- Pointer (mouse / touch) input -----------------------------------------
// Track the key each active pointer is currently over so dragging across keys
// glides (note-off the old, note-on the new). Capture keeps moves flowing even
// when the finger leaves the key it started on.
const pointers = new Map(); // pointerId -> midi (or null)

function midiFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  const key = el && el.closest('.key');
  if (!key || !kbd.contains(key)) return null;
  return parseInt(key.dataset.midi, 10);
}

kbd.addEventListener('pointerdown', e => {
  e.preventDefault();
  try { kbd.setPointerCapture(e.pointerId); } catch (_) {}
  const midi = midiFromPoint(e.clientX, e.clientY);
  pointers.set(e.pointerId, midi);
  if (midi != null) press(midi);
});

kbd.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const midi = midiFromPoint(e.clientX, e.clientY);
  if (midi === prev) return;
  if (prev != null) lift(prev);
  if (midi != null) press(midi);
  pointers.set(e.pointerId, midi);
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  if (prev != null) lift(prev);
  pointers.delete(e.pointerId);
  try { kbd.releasePointerCapture(e.pointerId); } catch (_) {}
}
kbd.addEventListener('pointerup', endPointer);
kbd.addEventListener('pointercancel', endPointer);

// --- Computer keyboard input ------------------------------------------------
const KEYMAP = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65,
  t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74,
};
let transpose = 0;
const downKeys = new Map(); // key char -> the midi that was actually sounded

window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { transpose -= 12; return; }
  if (k === 'x') { transpose += 12; return; }
  if (!(k in KEYMAP) || downKeys.has(k)) return;
  const midi = KEYMAP[k] + transpose;
  downKeys.set(k, midi);
  press(midi);
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (!downKeys.has(k)) return;
  lift(downKeys.get(k));
  downKeys.delete(k);
});

// Silence everything if the page loses focus mid-press.
window.addEventListener('blur', () => {
  pointers.clear();
  downKeys.clear();
  synth.allOff();
  kbd.querySelectorAll('.key.on').forEach(el => el.classList.remove('on'));
});

// --- Controls ---------------------------------------------------------------
document.getElementById('range').addEventListener('change', e => {
  synth.allOff();
  build(e.target.value);
});
document.getElementById('tone').addEventListener('change', e => {
  synth.allOff();
  synth.setInstrument(e.target.value);
});
document.getElementById('fifth').addEventListener('change', e => synth.setFifth(e.target.checked));
document.getElementById('labels').addEventListener('change', e => {
  kbd.classList.toggle('show-labels', e.target.checked);
});

// --- Pitch test (ear training) ----------------------------------------------
// Play a random pitch from the current range; the first key the player presses
// is their guess. Right note name (any octave) = confetti; wrong = buzzer.
const testBtn = document.getElementById('test-btn');
const replayBtn = document.getElementById('replay-btn');
const testMsg = document.getElementById('test-msg');
const testScore = document.getElementById('test-score');

let targetMidi = null;
let awaitingGuess = false;
let correct = 0, total = 0;
let playTimer = null;

function playTarget() {
  clearTimeout(playTimer);
  synth.noteOff(targetMidi);
  synth.noteOn(targetMidi);
  playTimer = setTimeout(() => synth.noteOff(targetMidi), 1300);
}

function startRound() {
  targetMidi = lowMidi + Math.floor(Math.random() * (highMidi - lowMidi + 1));
  awaitingGuess = true;
  testMsg.textContent = 'listen, then press the key you heard';
  testMsg.className = 'test-msg';
  replayBtn.hidden = false;
  testBtn.textContent = 'new note';
  playTarget();
}

function guess(midi) {
  awaitingGuess = false;
  total++;
  const answer = AudioKit.midiToName(targetMidi, false);
  if (pcOf(midi) === pcOf(targetMidi)) {
    correct++;
    testMsg.textContent = 'correct — it was ' + answer;
    testMsg.className = 'test-msg win';
    confetti();
  } else {
    testMsg.textContent = 'nope — that was ' + AudioKit.midiToName(midi, false) + ', it was ' + answer;
    testMsg.className = 'test-msg lose';
    synth.buzzer();
  }
  replayBtn.hidden = true;
  testScore.textContent = 'score: ' + Math.round(correct / total * 100) + '% (' + correct + '/' + total + ')';
}

function confetti() {
  const colors = ['#9cd8ff', '#ffd86f', '#ff7a9c', '#8cff9c', '#c89cff', '#ffffff'];
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--c', colors[i % colors.length]);
    p.style.setProperty('--dx', (Math.random() * 2 - 1) * 30 + 'vw');
    p.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.animationDelay = Math.random() * 0.2 + 's';
    p.style.animationDuration = 1.2 + Math.random() * 0.9 + 's';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2400);
}

testBtn.addEventListener('click', startRound);
replayBtn.addEventListener('click', playTarget);

build('2');
