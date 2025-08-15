// Shared audio playback and looping controls
// Designed to be used on pages with elements:
// #audio, #play-btn, #loops, #add-loop, #speed, #speed-display

(function () {
  const audio = document.getElementById('audio');
  const playBtn = document.getElementById('play-btn');
  const loopsContainer = document.getElementById('loops');
  const addLoopBtn = document.getElementById('add-loop');
  const speedInput = document.getElementById('speed');
  const speedDisplay = document.getElementById('speed-display');

  if (!audio) {
    // Nothing to do if audio element missing.
    return;
  }

  audio.preservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.webkitPreservesPitch = true;

  let loopActive = false;
  let playActive = false;
  let loopHandler = null;
  let currentLoopIndex = null;

  function parseTime(t) {
    const parts = t.split(':');
    if (parts.length === 1) return parseFloat(parts[0]) || 0;
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  let loops = [];

  function stopLoop() {
    audio.pause();
    if (loopHandler) audio.removeEventListener('timeupdate', loopHandler);
    if (currentLoopIndex !== null) {
      loops[currentLoopIndex].button.textContent = 'loop section';
    }
    loopActive = false;
    currentLoopIndex = null;
  }

  function startLoop(i) {
    playActive = false;
    playBtn.textContent = 'play piece';
    audio.pause();
    currentLoopIndex = i;
    const start = parseTime(loops[i].start.value);
    audio.currentTime = start;
    loopHandler = () => {
      const e = parseTime(loops[i].end.value);
      if (audio.currentTime >= e) {
        audio.currentTime = parseTime(loops[i].start.value);
      }
    };
    audio.addEventListener('timeupdate', loopHandler);
    audio.play();
    loops[i].button.textContent = 'stop';
    loopActive = true;
  }

  function handleLoopButton(i) {
    if (loopActive && currentLoopIndex === i) {
      stopLoop();
    } else {
      stopLoop();
      startLoop(i);
    }
  }

  if (loopsContainer) {
    loops = Array.from(loopsContainer.querySelectorAll('.loop')).map((el, i) => {
      const start = el.querySelector('.start');
      const end = el.querySelector('.end');
      let btn = el.querySelector('.loop-btn');
      if (!btn) {
        btn = document.createElement('button');
        btn.textContent = 'loop section';
        btn.className = 'loop-btn';
        // Remove any trailing whitespace nodes so the button aligns
        // consistently with buttons added later via JavaScript.
        while (el.lastChild && el.lastChild.nodeType === Node.TEXT_NODE) {
          el.removeChild(el.lastChild);
        }
        el.appendChild(btn);
      }
      btn.dataset.index = i;
      btn.addEventListener('click', () => handleLoopButton(i));
      return { start, end, button: btn };
    });
  }

  if (addLoopBtn && loopsContainer) {
    addLoopBtn.addEventListener('click', () => {
      const last = loops[loops.length - 1];
      const startVal = last.end.value;
      const startSec = parseTime(startVal);
      const endSec = startSec + 10;

      const loopDiv = document.createElement('div');
      loopDiv.className = 'loop';

      const startLabel = document.createElement('label');
      startLabel.textContent = 'start ';
      const startInput = document.createElement('input');
      startInput.type = 'text';
      startInput.size = 5;
      startInput.className = 'start';
      startInput.value = startVal;
      startLabel.appendChild(startInput);

      const endLabel = document.createElement('label');
      endLabel.textContent = 'end ';
      const endInput = document.createElement('input');
      endInput.type = 'text';
      endInput.size = 5;
      endInput.className = 'end';
      endInput.value = formatTime(endSec);
      endLabel.appendChild(endInput);

      const loopButton = document.createElement('button');
      loopButton.textContent = 'loop section';
      loopButton.className = 'loop-btn';

      loopDiv.appendChild(startLabel);
      loopDiv.appendChild(endLabel);
      loopDiv.appendChild(loopButton);
      loopsContainer.appendChild(loopDiv);
      const index = loops.length;
      loopButton.dataset.index = index;
      loopButton.addEventListener('click', () => handleLoopButton(index));
      loops.push({ start: startInput, end: endInput, button: loopButton });
    });
  }

  playBtn.addEventListener('click', () => {
    if (!playActive) {
      stopLoop();
      if (audio.paused) {
        audio.currentTime = 0;
      }
      audio.play();
      playBtn.textContent = 'stop';
      playActive = true;
    } else {
      audio.pause();
      playBtn.textContent = 'play piece';
      playActive = false;
    }
  });

  speedInput.addEventListener('input', () => {
    const r = parseFloat(speedInput.value);
    audio.playbackRate = r;
    speedDisplay.textContent = r.toFixed(2) + 'x';
  });
})();

