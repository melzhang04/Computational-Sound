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
    '90', '83', '88', '68', '67', '86', '71', '66', '72', '78', '74', '77',
    '81', '50', '87', '51', '69', '82', '53', '84', '54', '89', '55', '85'
  ];

  window.addEventListener('keydown', keyDown, false);
  window.addEventListener('keyup', keyUp, false);

  let activeOscillators = {};
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
  globalGain.gain.setValueAtTime(0.7, audioCtx.currentTime);
  globalGain.connect(audioCtx.destination);

  const ADSR = {
    attack: 0.01,
    decay: 0.08,
    sustain: 0.70,
    release: 0.18
  };

  function el(id) {
    return document.getElementById(id);
  }

  function setVal(id, v) {
    const t = el(id);
    if (t) t.textContent = v;
  }

  function ui() {
    return {
      waveform:    el('waveform')    ? el('waveform').value                       : 'sine',
      mode:        el('synthMode')   ? el('synthMode').value                      : 'additive',
      addPartials: el('addPartials') ? parseInt(el('addPartials').value, 10)      : 3,
      addDecay:    el('addDecay')    ? parseFloat(el('addDecay').value)           : 0.55,
      amModFreq:   el('amModFreq')   ? parseFloat(el('amModFreq').value)          : 100,
      amDepth:     el('amDepth')     ? parseFloat(el('amDepth').value)            : 0.5,
      fmModFreq:   el('fmModFreq')   ? parseFloat(el('fmModFreq').value)          : 120,
      fmIndex:     el('fmIndex')     ? parseFloat(el('fmIndex').value)            : 80,
      lfoRate:     el('lfoRate')     ? parseFloat(el('lfoRate').value)            : 5,
      lfoDepth:    el('lfoDepth')    ? parseFloat(el('lfoDepth').value)           : 0.25,
      attack:      el('attack')      ? parseFloat(el('attack').value)             : ADSR.attack,
      decay:       el('decay')       ? parseFloat(el('decay').value)              : ADSR.decay,
      sustain:     el('sustain')     ? parseFloat(el('sustain').value)            : ADSR.sustain,
      release:     el('release')     ? parseFloat(el('release').value)            : ADSR.release,
    };
  }

  function refreshUIReadouts() {
    const p = ui();
    setVal('addPartialsVal', String(p.addPartials));
    setVal('addDecayVal',    p.addDecay.toFixed(2));
    setVal('amModFreqVal',   String(Math.round(p.amModFreq)));
    setVal('amDepthVal',     p.amDepth.toFixed(2));
    setVal('fmModFreqVal',   String(Math.round(p.fmModFreq)));
    setVal('fmIndexVal',     String(Math.round(p.fmIndex)));
    setVal('lfoRateVal',     p.lfoRate.toFixed(1));
    setVal('lfoDepthVal',    p.lfoDepth.toFixed(2));
    setVal('attackVal',      p.attack.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));
    setVal('decayVal',       p.decay.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));
    setVal('sustainVal',     p.sustain.toFixed(2));
    setVal('releaseVal',     p.release.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));
  }

  function applyToActiveVoices() {
    const p = ui();

    ADSR.attack  = p.attack;
    ADSR.decay   = p.decay;
    ADSR.sustain = p.sustain;
    ADSR.release = p.release;

    Object.keys(activeOscillators).forEach((k) => {
      const v = activeOscillators[k];
      if (!v) return;

      if (v.lfoOsc) {
        v.lfoOsc.frequency.setValueAtTime(p.lfoRate, audioCtx.currentTime);
      }

      if (v.mode === 'additive') {
        if (v.lfoDepthGain && v.mixGain) {
          v.lfoDepthGain.gain.setValueAtTime(d, audioCtx.currentTime);
        }

        if (v.partialGains) {
          const count = Math.max(1, Math.min(6, p.addPartials));
          const decay = Math.max(0.10, Math.min(0.95, p.addDecay));
          let amps = [];
          for (let i = 0; i < 6; i++) {
            amps.push(i < count ? Math.pow(decay, i) : 0);
          }
          const sum = amps.reduce((a, b) => a + b, 0) || 1;
          amps = amps.map(a => a / sum);
          for (let i = 0; i < v.partialGains.length; i++) {
            v.partialGains[i].gain.setValueAtTime(amps[i] || 0, audioCtx.currentTime);
          }
        }
      }

      if (v.mode === 'am') {
        if (v.amMod)   v.amMod.frequency.setValueAtTime(p.amModFreq, audioCtx.currentTime);
        if (v.amDepthGain && v.amCarrierGain) {
          const depth = Math.max(0, Math.min(1, p.amDepth));
          v.amCarrierGain.gain.setValueAtTime(1 - depth, audioCtx.currentTime);
          v.amDepthGain.gain.setValueAtTime(depth, audioCtx.currentTime);
        }
        if (v.lfoDepthGain) {
          v.lfoDepthGain.gain.setValueAtTime(Math.max(0, Math.min(1, p.lfoDepth)) * 40, audioCtx.currentTime);
        }
      }

      if (v.mode === 'fm') {
        if (v.fmMod)       v.fmMod.frequency.setValueAtTime(p.fmModFreq, audioCtx.currentTime);
        if (v.fmIndexGain) v.fmIndexGain.gain.setValueAtTime(p.fmIndex, audioCtx.currentTime);
        if (v.lfoDepthGain) {
          v.lfoDepthGain.gain.setValueAtTime(Math.max(0, Math.min(1, p.lfoDepth)) * 60, audioCtx.currentTime);
        }
      }
    });
  }

  ['addPartials','addDecay','amModFreq','amDepth','fmModFreq','fmIndex','lfoRate','lfoDepth',
   'attack','decay','sustain','release','waveform','synthMode'].forEach((id) => {
    const e = el(id);
    if (e) {
      e.addEventListener('input',  () => { refreshUIReadouts(); applyToActiveVoices(); });
      e.addEventListener('change', () => { refreshUIReadouts(); applyToActiveVoices(); });
    }
  });

  refreshUIReadouts();

  function updatePolyphonyGains() {
    const keys = Object.keys(activeOscillators);
    const n    = Math.max(1, keys.length);
    const perVoice = 1 / Math.max(n, 1);
    const now  = audioCtx.currentTime;
    keys.forEach((k) => {
      const voice = activeOscillators[k];
      if (voice && voice.voiceGain) {
        voice.voiceGain.gain.setTargetAtTime(Math.min(1, perVoice), now, 0.01);
      }
    });
  }

  function keyDown(event) {
    const key = (event.detail || event.which).toString();
    if (keyboardFrequencyMap[key]) {
      if (!pressedKeys[key]) {
        pressedKeys[key] = true;
        if (activeOscillators[key]) {
          stopNote(key);
          const waitMs = Math.ceil((ADSR.release + 0.05) * 1000) + 10;
          setTimeout(() => {
            if (pressedKeys[key]) playNote(key);
          }, waitMs);
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
    if (!voice) return;
    const now = audioCtx.currentTime;

    voice.envGain.gain.cancelScheduledValues(now);
    const currentVal = voice.envGain.gain.value;
    voice.envGain.gain.setValueAtTime(currentVal, now);
    voice.envGain.gain.linearRampToValueAtTime(0, now + ADSR.release);

    voice.sources.forEach((src) => {
      try { src.stop(now + ADSR.release); } catch (e) {}
    });
    if (voice.lfoOsc) {
      try { voice.lfoOsc.stop(now + ADSR.release); } catch (e) {}
    }

    if (visualKeys[key]) {
      visualKeys[key].classList.remove('active');
    }

    delete activeOscillators[key];
    updatePolyphonyGains();

    setTimeout(() => {
      try { voice.envGain.disconnect(); } catch(e) {}
      try { voice.voiceGain.disconnect(); } catch(e) {}
    }, Math.ceil((ADSR.release + 0.1) * 1000));
  }

  function nyquist() {
    return audioCtx.sampleRate / 2;
  }

  function getSynthMode() {
    const e = el('synthMode');
    return e ? e.value : 'additive';
  }

  function getWaveform() {
    const e = el('waveform');
    return e ? e.value : 'sine';
  }

  function buildVoiceGraph(mode, baseFreq, envGain) {
    const sources = [];
    const p = ui();

    if (mode === 'additive') {
      const mix = audioCtx.createGain();
      mix.gain.setValueAtTime(1, audioCtx.currentTime);
      mix.connect(envGain);
      const lfoOsc = audioCtx.createOscillator();
      lfoOsc.type = 'sine';
      lfoOsc.frequency.setValueAtTime(p.lfoRate, audioCtx.currentTime);

      const lfoDepthGain = audioCtx.createGain();
      const d = Math.max(0, Math.min(0.5, p.lfoDepth));
      lfoDepthGain.gain.setValueAtTime(d, audioCtx.currentTime);
      lfoOsc.connect(lfoDepthGain);
      lfoDepthGain.connect(mix.gain);

      const partialGains = [];
      const count = Math.max(1, Math.min(6, p.addPartials));
      const decay = Math.max(0.10, Math.min(0.95, p.addDecay));

      let amps = [];
      for (let i = 0; i < 6; i++) {
        amps.push(i < count ? Math.pow(decay, i) : 0);
      }
      const sum = amps.reduce((a, b) => a + b, 0) || 1;
      amps = amps.map(a => a / sum);

      for (let i = 0; i < 6; i++) {
        const f = baseFreq * (i + 1);
        const o = audioCtx.createOscillator();
        o.type = getWaveform();

        const g = audioCtx.createGain();

        if (f >= nyquist() || amps[i] <= 0) {
          g.gain.setValueAtTime(0, audioCtx.currentTime);
          o.frequency.setValueAtTime(Math.min(f, nyquist() - 1), audioCtx.currentTime);
        } else {
          g.gain.setValueAtTime(amps[i], audioCtx.currentTime);
          o.frequency.setValueAtTime(f, audioCtx.currentTime);
        }

        o.connect(g).connect(mix);
        sources.push(o);
        partialGains.push(g);
      }

      lfoOsc.start();

      return {
        sources,
        mode: 'additive',
        lfoOsc,
        lfoDepthGain,
        mixGain: mix,
        partialGains
      };
    }

    if (mode === 'am') {

      const carrier = audioCtx.createOscillator();
      carrier.type = getWaveform();
      carrier.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);

      const carrierGain = audioCtx.createGain();
      const depthVal = Math.max(0, Math.min(1, p.amDepth));
      carrierGain.gain.setValueAtTime(1 - depthVal, audioCtx.currentTime);

      const amDepthGain = audioCtx.createGain();
      amDepthGain.gain.setValueAtTime(depthVal, audioCtx.currentTime);

      const mod = audioCtx.createOscillator();
      mod.type = 'sine';
      mod.frequency.setValueAtTime(p.amModFreq, audioCtx.currentTime);

      const lfoOsc = audioCtx.createOscillator();
      lfoOsc.type = 'sine';
      lfoOsc.frequency.setValueAtTime(p.lfoRate, audioCtx.currentTime);

      const lfoDepthGain = audioCtx.createGain();
      lfoDepthGain.gain.setValueAtTime(
        Math.max(0, Math.min(1, p.lfoDepth)) * 40, audioCtx.currentTime
      );

      lfoOsc.connect(lfoDepthGain).connect(mod.frequency);
      mod.connect(amDepthGain).connect(carrierGain.gain);
      carrier.connect(carrierGain).connect(envGain);

      sources.push(carrier, mod);
      lfoOsc.start();

      return {
        sources,
        mode: 'am',
        lfoOsc,
        lfoDepthGain,
        amMod: mod,
        amDepthGain,
        amCarrierGain: carrierGain
      };
    }

    if (mode === 'fm') {

      const carrier = audioCtx.createOscillator();
      carrier.type = getWaveform();
      carrier.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);

      const mod = audioCtx.createOscillator();
      mod.type = 'sine';
      mod.frequency.setValueAtTime(p.fmModFreq, audioCtx.currentTime);

      const fmIndexGain = audioCtx.createGain();
      fmIndexGain.gain.setValueAtTime(p.fmIndex, audioCtx.currentTime);

      const lfoOsc = audioCtx.createOscillator();
      lfoOsc.type = 'sine';
      lfoOsc.frequency.setValueAtTime(p.lfoRate, audioCtx.currentTime);

      const lfoDepthGain = audioCtx.createGain();
      lfoDepthGain.gain.setValueAtTime(
        Math.max(0, Math.min(1, p.lfoDepth)) * 60, audioCtx.currentTime
      );

      lfoOsc.connect(lfoDepthGain).connect(fmIndexGain.gain);
      mod.connect(fmIndexGain).connect(carrier.frequency);
      carrier.connect(envGain);

      sources.push(carrier, mod);
      lfoOsc.start();

      return {
        sources,
        mode: 'fm',
        lfoOsc,
        lfoDepthGain,
        fmMod: mod,
        fmIndexGain
      };
    }

    const osc = audioCtx.createOscillator();
    osc.type = getWaveform();
    osc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
    osc.connect(envGain);
    sources.push(osc);
    return { sources, mode: 'basic' };
  }

  function playNote(key) {
    const baseFreq = keyboardFrequencyMap[key];

    const envGain = audioCtx.createGain();
    envGain.gain.setValueAtTime(0, audioCtx.currentTime);

    const voiceGain = audioCtx.createGain();
    voiceGain.gain.setValueAtTime(1, audioCtx.currentTime);

    const mode  = getSynthMode();
    const graph = buildVoiceGraph(mode, baseFreq, envGain);

    envGain.connect(voiceGain).connect(globalGain);

    const now          = audioCtx.currentTime;
    const peak         = 1;
    const sustainLevel = Math.max(0, Math.min(1, ADSR.sustain)) * peak;

    envGain.gain.cancelScheduledValues(now);
    envGain.gain.setValueAtTime(0, now);
    envGain.gain.linearRampToValueAtTime(peak, now + Math.max(0.001, ADSR.attack));
    envGain.gain.linearRampToValueAtTime(sustainLevel, now + Math.max(0.001, ADSR.attack) + Math.max(0.001, ADSR.decay));

    activeOscillators[key] = {
      sources:      graph.sources,
      envGain,
      voiceGain,
      mode:         graph.mode,
      lfoOsc:       graph.lfoOsc,
      lfoDepthGain: graph.lfoDepthGain,
      mixGain:      graph.mixGain,
      partialGains: graph.partialGains,
      amMod:        graph.amMod,
      amDepthGain:  graph.amDepthGain,
      amCarrierGain:graph.amCarrierGain,
      fmMod:        graph.fmMod,
      fmIndexGain:  graph.fmIndexGain
    };

    updatePolyphonyGains();

    if (visualKeys[key]) {
      visualKeys[key].classList.add('active');
    }

    spawnFloatingNote();

    graph.sources.forEach((src) => src.start());
  }

  function spawnFloatingNote() {
    const noteEmojis = ['🎵', '🎶', '♪', '♫'];
    const randomNote = noteEmojis[Math.floor(Math.random() * noteEmojis.length)];

    const noteElement = document.createElement('div');
    noteElement.classList.add('floating-note');
    noteElement.textContent = randomNote;

    const randomX = Math.random() * window.innerWidth;
    noteElement.style.left = randomX + 'px';
    noteElement.style.top  = '80%';

    document.body.appendChild(noteElement);

    setTimeout(() => { noteElement.remove(); }, 2000);
  }
});