document.addEventListener("DOMContentLoaded", function(event) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const keyboardFrequencyMap = {
    '90': 261.625565300598634,  //Z - C
    '83': 277.182630976872096, //S - C#
    '88': 293.664767917407560,  //X - D
    '68': 311.126983722080910, //D - D#
    '67': 329.627556912869929,  //C - E
    '86': 349.228231433003884,  //V - F
    '71': 369.994422711634398, //G - F#
    '66': 391.995435981749294,  //B - G
    '72': 415.304697579945138, //H - G#
    '78': 440.000000000000000,  //N - A
    '74': 466.163761518089916, //J - A#
    '77': 493.883301256124111,  //M - B
    '81': 523.251130601197269,  //Q - C
    '50': 554.365261953744192, //2 - C#
    '87': 587.329535834815120,  //W - D
    '51': 622.253967444161821, //3 - D#
    '69': 659.255113825739859,  //E - E
    '82': 698.456462866007768,  //R - F
    '53': 739.988845423268797, //5 - F#
    '84': 783.990871963498588,  //T - G
    '54': 830.609395159890277, //6 - G#
    '89': 880.000000000000000,  //Y - A
    '55': 932.327523036179832, //7 - A#
    '85': 987.766602512248223,  //U - B
  };

  const keyLabels = {
    '90': 'Z<br>C', '83': 'S<br>C#', '88': 'X<br>D', '68': 'D<br>D#', '67': 'C<br>E',
    '86': 'V<br>F', '71': 'G<br>F#', '66': 'B<br>G', '72': 'H<br>G#', '78': 'N<br>A',
    '74': 'J<br>A#', '77': 'M<br>B', '81': 'Q<br>C', '50': '2<br>C#', '87': 'W<br>D',
    '51': '3<br>D#', '69': 'E<br>E', '82': 'R<br>F', '53': '5<br>F#', '84': 'T<br>G',
    '54': '6<br>G#', '89': 'Y<br>A', '55': '7<br>A#', '85': 'U<br>B',
  };

  const blackKeys = ['83', '68', '71', '72', '74', '50', '51', '53', '54', '55'];

  const keyOrder = [
    '90', '83', '88', '68', '67', '86', '71', '66', '72', '78', '74', '77',  // Lower octave: Z-M
    '81', '50', '87', '51', '69', '82', '53', '84', '54', '89', '55', '85'   // Upper octave: Q-U
  ];

  window.addEventListener('keydown', keyDown, false);
  window.addEventListener('keyup', keyUp, false);

  activeOscillators = {};
  const visualKeys = {};
  const pressedKeys = {};

  const keyboardDiv = document.getElementById('keyboard');
  keyOrder.forEach((keyCode) => {
    const keyDiv = document.createElement('div');
    keyDiv.className = 'key' + (blackKeys.includes(keyCode) ? ' black' : '');
    keyDiv.innerHTML = keyLabels[keyCode];
    keyDiv.dataset.keyCode = keyCode;
    
    keyDiv.addEventListener('mousedown', () => {
      if (!activeOscillators[keyCode]) {
        playNote(keyCode);
      }
    });
    keyDiv.addEventListener('mouseup', () => {
      if (activeOscillators[keyCode]) {
        stopNote(keyCode);
      }
    });
    keyDiv.addEventListener('mouseleave', () => {
      if (activeOscillators[keyCode]) {
        stopNote(keyCode);
      }
    });

    keyboardDiv.appendChild(keyDiv);
    visualKeys[keyCode] = keyDiv;
  });

  const globalGain = audioCtx.createGain();
  globalGain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  globalGain.connect(audioCtx.destination);

  const ADSR = {
    attack: 0.01,
    decay: 0.08,
    sustain: 0.7,
    release: 0.18
  };

  const EPS = 0.0001;

  function updatePolyphonyGains() {
    const keys = Object.keys(activeOscillators);
    const n = Math.max(1, keys.length);
    const perVoice = 1 / n;

    const now = audioCtx.currentTime;
    keys.forEach((k) => {
      const voice = activeOscillators[k];
      voice.voiceGain.gain.setTargetAtTime(perVoice, now, 0.01);
    });
  }

  function keyDown(event) {
    const key = (event.detail || event.which).toString();

    if (keyboardFrequencyMap[key]) {
      if (!pressedKeys[key]) {
        pressedKeys[key] = true;
        if (activeOscillators[key]) {
          stopNote(key);
          setTimeout(() => playNote(key), 10);
        } else {
          playNote(key);
        }
      }
    }
  }

  function keyUp(event) {
    const key = (event.detail || event.which).toString();
    pressedKeys[key] = false;
    if (keyboardFrequencyMap[key] && activeOscillators[key]) {
      stopNote(key);
    }
  }

  function stopNote(key) {
    const voice = activeOscillators[key];
    const now = audioCtx.currentTime;

    voice.envGain.gain.cancelScheduledValues(now);

    const currentVal = Math.max(EPS, voice.envGain.gain.value);
    voice.envGain.gain.setValueAtTime(currentVal, now);
    voice.envGain.gain.exponentialRampToValueAtTime(EPS, now + ADSR.release);

    voice.osc.stop(now + ADSR.release);

    if (visualKeys[key]) {
      visualKeys[key].classList.remove('active');
    }

    setTimeout(() => {
      if (activeOscillators[key] === voice) {
        delete activeOscillators[key];
        updatePolyphonyGains();
      }
    }, Math.ceil((ADSR.release + 0.05) * 1000));
  }

  function playNote(key) {
    const osc = audioCtx.createOscillator();
    osc.frequency.setValueAtTime(keyboardFrequencyMap[key], audioCtx.currentTime);

    const waveformSelect = document.getElementById('waveform');
    osc.type = waveformSelect.value;

    const envGain = audioCtx.createGain();
    envGain.gain.setValueAtTime(EPS, audioCtx.currentTime);

    const voiceGain = audioCtx.createGain();
    voiceGain.gain.setValueAtTime(1, audioCtx.currentTime);

    osc.connect(envGain).connect(voiceGain).connect(globalGain);

    const now = audioCtx.currentTime;
    const peak = 1;
    const sustainLevel = peak * ADSR.sustain;

    envGain.gain.cancelScheduledValues(now);
    envGain.gain.setValueAtTime(EPS, now);
    envGain.gain.exponentialRampToValueAtTime(peak, now + ADSR.attack);
    envGain.gain.exponentialRampToValueAtTime(sustainLevel, now + ADSR.attack + ADSR.decay);

    activeOscillators[key] = { osc, envGain, voiceGain };
    updatePolyphonyGains();

    if (visualKeys[key]) {
      visualKeys[key].classList.add('active');
    }

    spawnFloatingNote();

    osc.start();
  }

  function spawnFloatingNote() {
    const noteEmojis = ['🎵', '🎶', '♪', '♫'];
    const randomNote = noteEmojis[Math.floor(Math.random() * noteEmojis.length)];
    
    const noteElement = document.createElement('div');
    noteElement.classList.add('floating-note');
    noteElement.textContent = randomNote;
    
    const randomX = Math.random() * window.innerWidth;
    noteElement.style.left = randomX + 'px';
    noteElement.style.top = '80%';
    
    document.body.appendChild(noteElement);
    
    setTimeout(() => {
      noteElement.remove();
    }, 2000);
  }
});
