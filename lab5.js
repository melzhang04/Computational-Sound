const ROWS = 12;
const COLS = 16;
const CELL_SIZE = 40;
const STEP_DURATION = 250;
const NUM_GENERATIONS = 9999;

const SCALES = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  whole: [0, 2, 4, 6, 8, 10]
};

let audioCtx = null;
let masterGain = null;
let compressor = null;
let convolver = null;
let reverbGain = null;
let dryGain = null;

let grid = [];
let generationCount = 0;
let playbackActive = false;
let animationFrameId = null;
let loopTimeoutId = null;
const activeOscillators = new Set();

let canvas = null;
let ctx = null;

const recentNoteSets = [];
const STAG_WINDOW = 8;
let stagnantCount = 0;

function init() {
  canvas = document.getElementById("caCanvas");
  if (!canvas) return;

  canvas.width = COLS * CELL_SIZE;
  canvas.height = ROWS * CELL_SIZE;
  ctx = canvas.getContext("2d");

  grid = createRandomGrid(ROWS, COLS, 0.2);
  drawGrid(grid, -1);

  document.getElementById("startBtn").addEventListener("click", startComposition);
  document.getElementById("stopBtn").addEventListener("click", stopComposition);

  document.getElementById("randomizeBtn").addEventListener("click", () => {
    grid = createRandomGrid(ROWS, COLS, parseFloat(document.getElementById("densitySlider").value));
    generationCount = 0;
    recentNoteSets.length = 0;
    stagnantCount = 0;
    drawGrid(grid, -1);
  });

  document.getElementById("clearBtn").addEventListener("click", () => {
    grid = createEmptyGrid(ROWS, COLS);
    generationCount = 0;
    recentNoteSets.length = 0;
    stagnantCount = 0;
    drawGrid(grid, -1);
  });

  document.getElementById("tempoSlider").addEventListener("input", e => {
    document.getElementById("tempoVal").textContent = e.target.value + " ms";
  });

  document.getElementById("reverbSlider").addEventListener("input", e => {
    document.getElementById("reverbVal").textContent = e.target.value + "%";
    setReverb(parseInt(e.target.value));
  });

  document.getElementById("volumeSlider").addEventListener("input", e => {
    document.getElementById("volumeVal").textContent = e.target.value + "%";
    setVolume(parseInt(e.target.value));
  });

  document.getElementById("densitySlider").addEventListener("input", e => {
    document.getElementById("densityVal").textContent = Math.round(e.target.value * 100) + "%";
  });

  [
    { id: "birthSlider", out: "birthVal" },
    { id: "survMinSlider", out: "survMinVal" },
    { id: "survMaxSlider", out: "survMaxVal" }
  ].forEach(({ id, out }) => {
    document.getElementById(id).addEventListener("input", e => {
      document.getElementById(out).textContent = e.target.value;
    });
  });

  canvas.addEventListener("click", handleCanvasClick);
}

function setupAudio() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 8;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.2;
  compressor.connect(audioCtx.destination);

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.55;
  masterGain.connect(compressor);

  convolver = audioCtx.createConvolver();

  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * 1.4);
  const buf = audioCtx.createBuffer(2, len, sr);

  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
  }

  convolver.buffer = buf;

  reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0.08;

  dryGain = audioCtx.createGain();
  dryGain.gain.value = 0.92;

  convolver.connect(reverbGain);
  reverbGain.connect(masterGain);
  dryGain.connect(masterGain);
}

function setVolume(v) {
  if (masterGain) {
    masterGain.gain.value = (v / 100) * 0.75;
  }
}

function setReverb(v) {
  if (reverbGain && dryGain) {
    reverbGain.gain.value = (v / 100) * 0.35;
    dryGain.gain.value = 1 - (v / 100) * 0.25;
  }
}

function getScaleFrequencies() {
  const scaleName = document.getElementById("scaleSelect").value;
  const rootNote = parseInt(document.getElementById("rootSelect").value);
  const oscType = document.getElementById("oscSelect").value;
  const scale = SCALES[scaleName];

  const freqs = [];
  let i = 0;

  while (freqs.length < ROWS) {
    const semitone = rootNote + scale[i % scale.length] + Math.floor(i / scale.length) * 12;
    freqs.push(440 * Math.pow(2, (semitone - 69) / 12));
    i++;
  }

  return { freqs: freqs.slice(0, ROWS), oscType };
}

function playNote(frequency, startTime, duration, volume, oscType) {
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = oscType || "triangle";
  osc.frequency.setValueAtTime(frequency, startTime);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, startTime);
  filter.Q.setValueAtTime(0.5, startTime);

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.025);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(dryGain || masterGain);

  if (convolver) {
    gainNode.connect(convolver);
  }

  activeOscillators.add(osc);

  osc.onended = () => {
    activeOscillators.delete(osc);
  };

  osc.start(startTime);
  osc.stop(startTime + duration + 0.03);
}

function createEmptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

function createRandomGrid(rows, cols, prob = 0.2) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.random() < prob ? 1 : 0)
  );
}

function countNeighbors(g, row, col) {
  let count = 0;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      count += g[(row + dr + ROWS) % ROWS][(col + dc + COLS) % COLS];
    }
  }

  return count;
}

function nextGeneration(currentGrid) {
  const birthVal = parseInt(document.getElementById("birthSlider").value);
  const survMin = parseInt(document.getElementById("survMinSlider").value);
  const survMax = parseInt(document.getElementById("survMaxSlider").value);
  const newGrid = createEmptyGrid(ROWS, COLS);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const alive = currentGrid[r][c] === 1;
      const n = countNeighbors(currentGrid, r, c);

      if (!alive && n === birthVal) {
        newGrid[r][c] = 1;
      } else if (alive && n >= survMin && n <= survMax) {
        newGrid[r][c] = 1;
      } else {
        newGrid[r][c] = 0;
      }
    }
  }

  return newGrid;
}

function isGridEmpty(g) {
  return g.every(row => row.every(c => c === 0));
}

function columnToFrequencies(g, colIndex, scaleFreqs) {
  const freqs = [];

  for (let row = 0; row < ROWS; row++) {
    if (g[row][colIndex] === 1) {
      const pitchIndex = ROWS - 1 - row;
      freqs.push(scaleFreqs[pitchIndex]);
    }
  }

  return freqs;
}

function scheduleGridPlayback(gridToPlay, offsetTime) {
  const stepMs = parseInt(document.getElementById("tempoSlider").value);
  const noteDur = (stepMs / 1000) * 0.45;
  const maxVoices = 2;
  const { freqs: scaleFreqs, oscType } = getScaleFrequencies();
  const noteKey = [];

  for (let col = 0; col < COLS; col++) {
    const freqs = columnToFrequencies(gridToPlay, col, scaleFreqs);
    const stepTime = offsetTime + col * (stepMs / 1000);
    const selected = chooseMusicalVoices(freqs, maxVoices);

    noteKey.push(selected.map(f => Math.round(f)).join("+"));

    for (let i = 0; i < selected.length; i++) {
      playNote(selected[i], stepTime + i * 0.015, noteDur, 0.045, oscType);
    }
  }

  trackStagnation(noteKey.join("|"));
}

function chooseMusicalVoices(freqs, maxVoices) {
  if (freqs.length <= maxVoices) return freqs;

  const sorted = freqs.slice().sort((a, b) => a - b);
  const chosen = [];

  chosen.push(sorted[0]);

  for (let i = 1; i < sorted.length; i++) {
    const last = chosen[chosen.length - 1];
    const ratio = sorted[i] / last;

    if (ratio > 1.18 && chosen.length < maxVoices) {
      chosen.push(sorted[i]);
    }
  }

  return chosen.slice(0, maxVoices);
}

function trackStagnation(fingerprint) {
  recentNoteSets.push(fingerprint);

  if (recentNoteSets.length > STAG_WINDOW) {
    recentNoteSets.shift();
  }

  const aliveCount = countAliveCells(grid);
  const density = aliveCount / (ROWS * COLS);

  if (density > 0.55) {
    stagnantCount++;
  } else if (recentNoteSets.length === STAG_WINDOW) {
    const unique = new Set(recentNoteSets).size;

    if (unique <= 3) {
      stagnantCount++;
    } else {
      stagnantCount = 0;
    }
  }

  if (stagnantCount >= 2) {
    forceVariation();
    recentNoteSets.length = 0;
    stagnantCount = 0;
  }
}

function countAliveCells(g) {
  let count = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (g[r][c] === 1) {
        count++;
      }
    }
  }

  return count;
}

function forceVariation() {
  const density = countAliveCells(grid) / (ROWS * COLS);

  if (density > 0.55) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (Math.random() < 0.55) {
          grid[r][c] = 0;
        }
      }
    }
  }

  for (let i = 0; i < 24; i++) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    grid[r][c] = grid[r][c] === 1 ? 0 : 1;
  }

  generationCount++;
  drawGrid(grid, -1);
}

function drawGrid(gridToDraw, highlightedCol = -1) {
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL_SIZE;
      const y = r * CELL_SIZE;
      const isAlive = gridToDraw[r][c] === 1;
      const isHighlighted = c === highlightedCol;

      if (isAlive) {
        const t = r / (ROWS - 1);
        const rv = Math.round(100 + t * 80);
        const gv = Math.round(90 + t * 40);
        const bv = Math.round(220 - t * 60);

        ctx.fillStyle = isHighlighted
          ? "rgba(255, 150, 70, 0.95)"
          : `rgba(${rv}, ${gv}, ${bv}, 0.9)`;
      } else {
        ctx.fillStyle = isHighlighted ? "#ddeeff" : "#ffffff";
      }

      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
      ctx.strokeStyle = "#c8d8f0";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
    }
  }

  ctx.fillStyle = "rgba(26, 95, 170, 0.65)";
  ctx.font = "11px Arial";
  ctx.fillText("gen " + generationCount, 5, 14);
}

function animatePlayback(durationMs) {
  const stepMs = parseInt(document.getElementById("tempoSlider").value);
  const start = performance.now();

  function frame(now) {
    if (!playbackActive) return;

    const elapsed = now - start;
    const col = Math.floor(elapsed / stepMs);

    if (elapsed < durationMs) {
      drawGrid(grid, Math.min(col, COLS - 1));
      animationFrameId = requestAnimationFrame(frame);
    } else {
      drawGrid(grid, -1);
    }
  }

  animationFrameId = requestAnimationFrame(frame);
}

async function startComposition() {
  if (playbackActive) return;

  setupAudio();

  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  setVolume(parseInt(document.getElementById("volumeSlider").value));
  setReverb(parseInt(document.getElementById("reverbSlider").value));

  playbackActive = true;
  generationCount = 0;
  recentNoteSets.length = 0;
  stagnantCount = 0;

  runGenerativeLoop();
}

function stopComposition() {
  playbackActive = false;

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (loopTimeoutId !== null) {
    clearTimeout(loopTimeoutId);
    loopTimeoutId = null;
  }

  activeOscillators.forEach(osc => {
    try {
      osc.stop(audioCtx ? audioCtx.currentTime : 0);
    } catch (e) {}
  });

  activeOscillators.clear();
  drawGrid(grid, -1);
}

function runGenerativeLoop() {
  if (!playbackActive) return;

  if (generationCount >= NUM_GENERATIONS) {
    stopComposition();
    return;
  }

  const stepMs = parseInt(document.getElementById("tempoSlider").value);
  const totalDuration = COLS * stepMs;
  const now = audioCtx.currentTime + 0.05;

  scheduleGridPlayback(grid, now);
  animatePlayback(totalDuration);

  loopTimeoutId = setTimeout(() => {
    loopTimeoutId = null;

    if (!playbackActive) return;

    grid = nextGeneration(grid);
    generationCount++;

    if (isGridEmpty(grid)) {
      grid = createRandomGrid(ROWS, COLS, parseFloat(document.getElementById("densitySlider").value));
      recentNoteSets.length = 0;
      stagnantCount = 0;
    }

    drawGrid(grid, -1);
    runGenerativeLoop();
  }, totalDuration);
}

function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const col = Math.floor(x / CELL_SIZE);
  const row = Math.floor(y / CELL_SIZE);

  if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
    grid[row][col] = grid[row][col] === 1 ? 0 : 1;
    drawGrid(grid, -1);
  }
}

window.addEventListener("DOMContentLoaded", init);