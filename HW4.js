let audioCtx = null;
let vizRaf   = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function gv(id)  { return parseFloat(document.getElementById("s-" + id).value); }

function syncValue(id, outId, suffix = "", decimals) {
  const v = gv(id);
  document.getElementById(outId).textContent =
    decimals !== undefined ? v.toFixed(decimals) + suffix : Math.round(v) + suffix;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function safeGain(v)       { return clamp(v, 0, 1); }
function safeFreq(v)       { return clamp(v, 1, getCtx().sampleRate / 2 - 1); }

function makeWhiteNoiseBuffer(ctx, dur) {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function makeBrownNoiseBuffer(ctx, dur) {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  let last  = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last    = (last + 0.02 * w) / 1.02;
    d[i]    = clamp(last * 2.8, -1, 1);
  }
  return buf;
}

function makeSoftClipCurve(amount = 1) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * (1 + amount * 4));
  }
  return c;
}

function makeAbsCurve() {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i/(n-1))*2-1; c[i] = Math.abs(x); }
  return c;
}

function makeParabolicCurve() {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i/(n-1))*2-1; c[i] = x*x; }
  return c;
}

function makeNWaveCurve() {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.sign(x) * x * x;
  }
  return c;
}

function createNoiseSource(ctx, type, dur) {
  const src  = ctx.createBufferSource();
  src.buffer = type === "brown" ? makeBrownNoiseBuffer(ctx, dur)
                                : makeWhiteNoiseBuffer(ctx, dur);
  return src;
}

function scheduleRandomSteps(param, start, dur, base, range, lo = 0.06, hi = 0.18) {
  let t = start;
  param.setValueAtTime(base, start);
  while (t < start + dur) {
    const step = lo + Math.random() * (hi - lo);
    param.linearRampToValueAtTime(base + (Math.random()*2-1)*range, t + step);
    t += step;
  }
}

function makeStrikeBurst(ctx, t, e, dest) {
  const decayTime = 0.05 + 3.0 * Math.pow(1 - e, 5);
  const srcDur = decayTime + 0.08;

  const src = createNoiseSource(ctx, "white", srcDur);

  const bp1 = ctx.createBiquadFilter();
  bp1.type = "bandpass";
  bp1.frequency.value = safeFreq(100 + e * 1200);
  bp1.Q.value = 1.2;

  const bp2 = ctx.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.frequency.value = safeFreq((100 + e * 1200) * 0.5);
  bp2.Q.value = 1.2;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(Math.min(0.18, e * 0.18), t + 0.0015);
  env.gain.setTargetAtTime(0, t + 0.0015, Math.max(0.012, decayTime * 0.28));

  src.connect(bp1);
  bp1.connect(bp2);
  bp2.connect(env);
  env.connect(dest);

  src.start(t);
  src.stop(t + srcDur);
}

function makeStrikeCombo(ctx, now, params, dest) {
  let accMs = 1;
  let voice = 0;

  while (accMs < 100) {
    const eBase = 1 - accMs / 100;
    const e = clamp(eBase * params.intensity, 0.05, 1);

    const t = now + accMs / 1000 + voice * 0.0004;
    makeStrikeBurst(ctx, t, e, dest);

    accMs += Math.random() * 9.9;
    voice = (voice + 1) % 4;
  }
}

function makeRumble(ctx, now, params, dest) {
  const start = now + 0.04;
  const dur   = params.rumbleDur + 2.0;

  const noiseA = createNoiseSource(ctx, "brown", dur);
  const noiseB = createNoiseSource(ctx, "brown", dur);

  const lpA = ctx.createBiquadFilter();
  lpA.type = "lowpass"; lpA.frequency.value = safeFreq(6); lpA.Q.value = 0.5;

  const lpB = ctx.createBiquadFilter();
  lpB.type = "lowpass"; lpB.frequency.value = safeFreq(4); lpB.Q.value = 0.5;

  const recA = ctx.createGain(); recA.gain.value = 180;
  const recB = ctx.createGain(); recB.gain.value = 140;

  const absA = ctx.createWaveShaper(); absA.curve = makeAbsCurve();

  const ringGain = ctx.createGain(); ringGain.gain.value = 0;

  const lfo = ctx.createOscillator();
  lfo.type           = "triangle";
  lfo.frequency.value = clamp(params.rumbleDensity, 6, 18);

  const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.12;

  const lfoBase = ctx.createConstantSource(); lfoBase.offset.value = 0.0;

  const absB = ctx.createWaveShaper(); absB.curve = makeAbsCurve();
  const para = ctx.createWaveShaper(); para.curve = makeParabolicCurve();

  const driveIn = ctx.createGain(); driveIn.gain.value = 1.4;
  const drive   = ctx.createWaveShaper(); drive.curve = makeSoftClipCurve(0.5);

  const band = ctx.createBiquadFilter();
  band.type = "bandpass"; band.frequency.value = safeFreq(82); band.Q.value = 1.6;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = safeFreq(28);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = safeFreq(180);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0,    start);
  env.gain.linearRampToValueAtTime(0.32, start + 0.15);
  env.gain.setTargetAtTime(0,   start + 0.20, Math.max(0.9, params.rumbleDur * 0.32));

  scheduleRandomSteps(band.frequency, start, dur, 82, 28, 0.08, 0.20);
  noiseA.connect(lpA); lpA.connect(recA); recA.connect(absA);
  noiseB.connect(lpB); lpB.connect(recB); recB.connect(ringGain);

  absA.connect(ringGain.gain);
  lfo.connect(lfoDepth); lfoDepth.connect(ringGain.gain);
  lfoBase.connect(ringGain.gain);

  ringGain.connect(absB);
  absB.connect(para);
  para.connect(driveIn); driveIn.connect(drive);
  drive.connect(band); band.connect(hp); hp.connect(lp);
  lp.connect(env); env.connect(dest);

  noiseA.start(start); noiseB.start(start);
  lfo.start(start);    lfoBase.start(start);
  noiseA.stop(start + dur); noiseB.stop(start + dur);
  lfo.stop(start + dur);    lfoBase.stop(start + dur);
}

function makeAfterimage(ctx, now, params, dest) {
  const start = now + 0.20;
  const dur   = params.rumbleDur + 1.0;

  const modNoise = createNoiseSource(ctx, "brown", dur);
  const sigNoise = createNoiseSource(ctx, "white", dur);

  const modLP = ctx.createBiquadFilter();
  modLP.type = "lowpass"; modLP.frequency.value = safeFreq(2.5); modLP.Q.value = 0.5;

  const modGain = ctx.createGain(); modGain.gain.value = 80;

  const clip = ctx.createWaveShaper(); clip.curve = makeSoftClipCurve(1.5);

  const gate = ctx.createGain(); gate.gain.value = 0;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = safeFreq(300); bp.Q.value = 2.0;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = safeFreq(140);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = safeFreq(700);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0,   start);
  env.gain.linearRampToValueAtTime(safeGain(params.reverb * 0.18), start + 0.04);
  env.gain.setTargetAtTime(0,  start + 0.08, Math.max(0.6, params.rumbleDur * 0.20));

  modNoise.connect(modLP); modLP.connect(modGain);
  modGain.connect(clip); clip.connect(gate.gain);

  sigNoise.connect(gate);
  gate.connect(bp); bp.connect(hp); hp.connect(lp);
  lp.connect(env); env.connect(dest);

  modNoise.start(start); sigNoise.start(start);
  modNoise.stop(start + dur); sigNoise.stop(start + dur);
}

function makeDeepNoise(ctx, now, params, dest) {
  const start = now + 0.90;
  const dur   = params.rumbleDur + 2.2;

  const src = createNoiseSource(ctx, "brown", dur);

  const lp1 = ctx.createBiquadFilter(); lp1.type = "lowpass"; lp1.frequency.value = safeFreq(80);
  const lp2 = ctx.createBiquadFilter(); lp2.type = "lowpass"; lp2.frequency.value = safeFreq(80);

  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = safeFreq(18);

  const preDrive = ctx.createGain(); preDrive.gain.value = 2.2;
  const drive    = ctx.createWaveShaper(); drive.curve = makeSoftClipCurve(0.9);

  const lp3 = ctx.createBiquadFilter(); lp3.type = "lowpass"; lp3.frequency.value = safeFreq(85);
  const lp4 = ctx.createBiquadFilter(); lp4.type = "lowpass"; lp4.frequency.value = safeFreq(85);

  const env = ctx.createGain();
  const peak = safeGain(params.deepLvl * 0.58);
  env.gain.setValueAtTime(0,    start);
  env.gain.linearRampToValueAtTime(peak, start + Math.max(1.2, params.rumbleDur * 0.58));
  env.gain.setTargetAtTime(0,   start + Math.max(1.2, params.rumbleDur * 0.58),
                            Math.max(1.1, params.rumbleDur * 0.22));

  src.connect(lp1); lp1.connect(lp2); lp2.connect(hp);
  hp.connect(preDrive); preDrive.connect(drive);
  drive.connect(lp3); lp3.connect(lp4); lp4.connect(env);
  env.connect(dest);

  src.start(start); src.stop(start + dur);
}

function makeEchoes(ctx, now, params, sourceBus) {
  const taps = 14;
  const dMax = 5.0;
  const wet  = params.reverb;

  for (let i = 0; i < taps; i++) {
    const r1    = Math.random();
    const r2    = Math.random();
    const dTime = Math.min(dMax, Math.max(0.25, dMax * r1 * r2 + 0.05));
    const pos   = dTime / dMax;

    const delay = ctx.createDelay(dMax + 0.5);
    delay.delayTime.value = dTime;

    const bp = ctx.createBiquadFilter();
    bp.type            = "bandpass";
    bp.frequency.value  = safeFreq(300 + (1 - pos) * 1800);
    bp.Q.value          = 2.0;

    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp((pos * 2 - 1) * 0.7, -1, 1);

    const tapGain = ctx.createGain();
    tapGain.gain.value = safeGain(wet * (0.06 + (1 - pos) * 0.14));

    sourceBus.connect(delay);
    delay.connect(bp); bp.connect(panner);
    panner.connect(tapGain); tapGain.connect(ctx.destination);
  }
}

function strikeThunder(params, analyser) {
  const ctx      = getCtx();
  const now      = ctx.currentTime;
  const totalDur = params.rumbleDur + 8.0;

  const preMaster = ctx.createGain(); preMaster.gain.value = 1;
  const panner    = ctx.createStereoPanner(); panner.pan.value = clamp(params.pan, -1, 1);
  const master    = ctx.createGain(); master.gain.value = safeGain(params.vol);

  const strikeGain = ctx.createGain(); strikeGain.gain.value = 0.58; strikeGain.connect(preMaster);
  const rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0.26; rumbleGain.connect(preMaster);
  const afterGain  = ctx.createGain(); afterGain.gain.value  = 0.14; afterGain.connect(preMaster);
  const deepGain   = ctx.createGain(); deepGain.gain.value   = 0.38; deepGain.connect(preMaster);

  makeStrikeCombo(ctx, now, params, strikeGain);
  makeRumble     (ctx, now, params, rumbleGain);
  makeAfterimage (ctx, now, params, afterGain);
  makeDeepNoise  (ctx, now, params, deepGain);
  makeEchoes     (ctx, now, params, preMaster);

  preMaster.connect(panner); panner.connect(master);

  if (analyser) {
    master.connect(analyser); analyser.connect(ctx.destination);
  } else {
    master.connect(ctx.destination);
  }

  return totalDur;
}

const FACTORY_PRESETS = {
  close:   { intensity: 0.96, numStrikes: 12, rumbleDensity: 18, rumbleDur: 2.2, reverb: 0.10, deepLvl: 0.42, pan: 0 },
  mid:     { intensity: 0.80, numStrikes: 9,  rumbleDensity: 13, rumbleDur: 4.4, reverb: 0.22, deepLvl: 0.40, pan: 0 },
  far:     { intensity: 0.54, numStrikes: 6,  rumbleDensity: 10, rumbleDur: 6.2, reverb: 0.36, deepLvl: 0.34, pan: 0 },
  rolling: { intensity: 0.36, numStrikes: 4,  rumbleDensity:  8, rumbleDur: 8.0, reverb: 0.44, deepLvl: 0.28, pan: 0 }
};

const PAN_SPREAD = { close: 0.25, mid: 0.75, far: 1.0, rolling: 0.55 };



function readParams() {
  return {
    intensity:    gv("intensity"),
    numStrikes:   gv("numStrikes"),
    rumbleDensity:gv("rumbleDensity"),
    rumbleDur:    gv("rumbleDur"),
    pan:          gv("pan"),
    reverb:       gv("reverb"),
    deepLvl:      gv("deepLvl"),
    vol:          gv("vol")
  };
}

function writeParams(params) {
  for (const key in params) {
    const el = document.getElementById("s-" + key);
    if (el) el.value = params[key];
  }
  syncValue("intensity",     "v-intensity",     "", 2);
  syncValue("numStrikes",    "v-numStrikes",    "");
  syncValue("rumbleDensity", "v-rumbleDensity", " Hz");
  syncValue("rumbleDur",     "v-rumbleDur",     " s", 1);
  syncValue("pan",           "v-pan",           "", 2);
  syncValue("reverb",        "v-reverb",        "", 2);
  syncValue("deepLvl",       "v-deepLvl",       "", 2);
  syncValue("vol",           "v-vol",           "", 2);
}

function strike(presetName, btn) {
  const ctx = getCtx(); ctx.resume();

  if (presetName && FACTORY_PRESETS[presetName]) {
    const preset = { ...FACTORY_PRESETS[presetName] };
    preset.pan = (Math.random() - 0.5) * (PAN_SPREAD[presetName] || 1) * 2;
    preset.vol = gv("vol");
    writeParams(preset);
  }

  const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
  const dur      = strikeThunder(readParams(), analyser);
  startViz(analyser, dur);

  if (btn) {
    btn.classList.add("firing");
    setTimeout(() => btn.classList.remove("firing"), 450);
  }
}

function startViz(analyser, durationSec) {
  cancelAnimationFrame(vizRaf);
  const stopAt = performance.now() + durationSec * 1000;
  const canvas = document.getElementById("viz");

  function draw() {
    if (performance.now() > stopAt) { drawIdle(); return; }
    vizRaf = requestAnimationFrame(draw);

    const w = canvas.clientWidth || 600, h = 100;
    canvas.width = w; canvas.height = h;
    const c    = canvas.getContext("2d");
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    c.clearRect(0, 0, w, h);
    c.strokeStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    c.lineWidth   = 0.5;
    for (let x = 0; x < w; x += 50) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,h); c.stroke(); }
    c.beginPath(); c.moveTo(0, h/2); c.lineTo(w, h/2); c.stroke();

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    c.strokeStyle = dark ? "#f0a538" : "#ba7517";
    c.lineWidth   = 1.5;
    c.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = i * (w / data.length);
      const y = (data[i] / 128) * (h / 2);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
  draw();
}

function drawIdle() {
  const canvas = document.getElementById("viz");
  const w = canvas.clientWidth || 600, h = 100;
  canvas.width = w; canvas.height = h;
  const c    = canvas.getContext("2d");
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  c.clearRect(0, 0, w, h);
  c.strokeStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  c.lineWidth   = 0.5;
  for (let x = 0; x < w; x += 50) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,h); c.stroke(); }
  c.beginPath(); c.moveTo(0, h/2); c.lineTo(w, h/2); c.stroke();
}

window.addEventListener("load", () => {
  syncValue("intensity",     "v-intensity",     "", 2);
  syncValue("numStrikes",    "v-numStrikes",    "");
  syncValue("rumbleDensity", "v-rumbleDensity", " Hz");
  syncValue("rumbleDur",     "v-rumbleDur",     " s", 1);
  syncValue("pan",           "v-pan",           "", 2);
  syncValue("reverb",        "v-reverb",        "", 2);
  syncValue("deepLvl",       "v-deepLvl",       "", 2);
  syncValue("vol",           "v-vol",           "", 2);
  drawIdle();
});