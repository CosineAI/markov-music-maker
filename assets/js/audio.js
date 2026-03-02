'use strict';

/** @type {null | AudioContext} */
let audioCtx = null;
/** @type {null | GainNode} */
let masterGain = null;
/** @type {null | AudioBuffer} */
let noiseBuffer = null;

/** @type {{ osc: OscillatorNode, gain: GainNode }[]} */
let droneVoices = [];

function getAudioCtx() {
  return audioCtx;
}

function ensureAudio() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    alert('Web Audio API not supported in this browser.');
    return;
  }

  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(audioCtx.destination);

  noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 1.0, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function playKick(t) {
  if (!audioCtx || !masterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.08);
  gain.gain.setValueAtTime(0.9, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.15);
}

/** @param {number} t @param {number} duration @param {{ amp: number, highpassHz?: number, lowpassHz?: number }} options */
function playNoise(t, duration, options) {
  if (!audioCtx || !masterGain || !noiseBuffer) return;

  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(options.amp, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  let node = /** @type {AudioNode} */ (src);

  if (options.highpassHz) {
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(options.highpassHz, t);
    node.connect(hp);
    node = hp;
  }

  if (options.lowpassHz) {
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(options.lowpassHz, t);
    node.connect(lp);
    node = lp;
  }

  node.connect(gain);
  gain.connect(masterGain);

  src.start(t);
  src.stop(t + duration);
}

function playSnare(t) {
  playNoise(t, 0.12, { amp: 0.6, highpassHz: 900, lowpassHz: 9000 });

  if (!audioCtx || !masterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, t);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.1);
}

function playHat(t) {
  playNoise(t, 0.05, { amp: 0.35, highpassHz: 5000, lowpassHz: 13000 });
}

/** @param {number} freq @param {OscillatorType} waveform @param {number} t */
function playNote(freq, waveform, t) {
  if (!audioCtx || !masterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = waveform;
  osc.frequency.setValueAtTime(freq, t);

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.max(1200, freq * 4), t);

  osc.connect(lp);
  lp.connect(gain);
  gain.connect(masterGain);

  osc.start(t);
  osc.stop(t + 0.2);
}

/** @param {import('./state.js').DroneSettings} drone */
function startDroneVoice(drone) {
  if (!audioCtx || !masterGain) return null;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = drone.waveform;
  osc.frequency.setValueAtTime(midiToFreq(drone.midi), audioCtx.currentTime);

  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, drone.volume), audioCtx.currentTime + 0.08);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start();

  return { osc, gain };
}

/** @param {{ osc: OscillatorNode, gain: GainNode }} voice */
function stopDroneVoice(voice) {
  if (!audioCtx) return;

  const t = audioCtx.currentTime;
  voice.gain.gain.cancelScheduledValues(t);
  voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), t);
  voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

  voice.osc.stop(t + 0.14);
}

function stopAllDrones() {
  if (!droneVoices.length) return;

  const voices = droneVoices;
  droneVoices = [];

  if (!audioCtx) return;
  voices.forEach((v) => stopDroneVoice(v));
}

function syncDronePlayback() {
  if (intervalId === null) {
    stopAllDrones();
    return;
  }

  const tile = getActiveTile();
  const drones = tile ? normalizeDroneList(tile.drones, null) : [];
  const enabled = drones.filter((d) => d.enabled);

  if (!enabled.length) {
    stopAllDrones();
    return;
  }

  ensureAudio();
  if (!audioCtx) return;

  while (droneVoices.length > enabled.length) {
    const v = droneVoices.pop();
    if (v) stopDroneVoice(v);
  }

  while (droneVoices.length < enabled.length) {
    const voice = startDroneVoice(enabled[droneVoices.length]);
    if (!voice) break;
    droneVoices.push(voice);
  }

  const t = audioCtx.currentTime;
  for (let i = 0; i < droneVoices.length; i++) {
    const drone = enabled[i];
    const v = droneVoices[i];

    v.osc.type = drone.waveform;
    v.osc.frequency.setValueAtTime(midiToFreq(drone.midi), t);
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setTargetAtTime(Math.max(0.0001, drone.volume), t, 0.03);
  }
}

/** @param {import('./state.js').Tile} tile @param {number} step @param {number} t */
function playStep(tile, step, t) {
  const steps = stepsForTile(tile);
  const s = step % steps;

  for (let r = 0; r < state.tracks.length; r++) {
    if (!tile.grid[r][s]) continue;

    const tr = state.tracks[r];
    if (tr.kind === 'drum') {
      if (tr.drum === 'kick') playKick(t);
      else if (tr.drum === 'snare') playSnare(t);
      else if (tr.drum === 'hat') playHat(t);
    } else {
      playNote(midiToFreq(tr.midi), tr.waveform, t);
    }
  }
}
