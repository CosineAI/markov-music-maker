(() => {
  'use strict';

  const LEGACY_STEPS_PER_BEAT = 4;
  const DEFAULT_STEPS_PER_BEAT = 1;
  const MAX_STEPS_PER_BEAT = 12;
  const MAX_BEATS_PER_TILE = 32;

  const DRUM_TRACK_COUNT = 3;

  const WAVEFORMS = /** @type {const} */ (['sine', 'square', 'triangle', 'sawtooth']);
  const NOTE_NAMES = /** @type {const} */ (['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);

  const DEFAULT_DRONE = { enabled: false, waveform: 'sine', midi: 48, volume: 0.18 };

  /** @type {null | AudioContext} */
  let audioCtx = null;
  /** @type {null | GainNode} */
  let masterGain = null;
  /** @type {null | AudioBuffer} */
  let noiseBuffer = null;

  /** @type {{ osc: OscillatorNode, gain: GainNode }[]} */
  let droneVoices = [];

  /** @type {number | null} */
  let intervalId = null;
  let stepIndex = 0;
  let playbackRequestId = 0;

  const ui = {
    dronesOpen: false,
    notesOpen: false,
  };

  const els = {
    tilesList: /** @type {HTMLElement} */ (document.getElementById('tiles-list')),
    createTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('create-tile')),
    copyTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('copy-tile')),
    renameTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('rename-tile')),
    deleteTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('delete-tile')),
    startTileSelect: /** @type {HTMLSelectElement} */ (document.getElementById('start-tile-select')),

    playBtn: /** @type {HTMLButtonElement} */ (document.getElementById('play')),
    stopBtn: /** @type {HTMLButtonElement} */ (document.getElementById('stop')),
    playbackStatus: /** @type {HTMLElement} */ (document.getElementById('playback-status')),

    copyShareUrlBtn: /** @type {HTMLButtonElement} */ (document.getElementById('copy-share-url')),
    resetAllBtn: /** @type {HTMLButtonElement} */ (document.getElementById('reset-all')),

    activeTileBadge: /** @type {HTMLElement} */ (document.getElementById('active-tile-badge')),
    activeTileId: /** @type {HTMLElement} */ (document.getElementById('active-tile-id')),

    tempoRange: /** @type {HTMLInputElement} */ (document.getElementById('tempoRange')),
    tempoNumber: /** @type {HTMLInputElement} */ (document.getElementById('tempoNumber')),
    clearPatternBtn: /** @type {HTMLButtonElement} */ (document.getElementById('clear-pattern')),
    randomizePatternBtn: /** @type {HTMLButtonElement} */ (document.getElementById('randomize-pattern')),

    tileSettings: /** @type {HTMLElement} */ (document.getElementById('tile-settings')),
    instrumentSettings: /** @type {HTMLElement} */ (document.getElementById('instrument-settings')),

    gridMount: /** @type {HTMLElement} */ (document.getElementById('grid-mount')),
    transitionsTitle: /** @type {HTMLElement} */ (document.getElementById('transitions-title')),
    transitionsList: /** @type {HTMLElement} */ (document.getElementById('transitions-list')),

    loopTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('loop-tile')),
    chainGraph: /** @type {HTMLElement} */ (document.getElementById('chain-graph')),
    chainCanvas: /** @type {HTMLCanvasElement} */ (document.getElementById('chain-canvas')),
    chainNodes: /** @type {HTMLElement} */ (document.getElementById('chain-nodes')),
  };

  /**
   * @typedef {'kick' | 'snare' | 'hat'} DrumName
   */

  /**
   * @typedef TrackBase
   * @property {string} id
   * @property {string} label
   */

  /**
   * @typedef {TrackBase & { kind: 'drum', drum: DrumName }} DrumTrack
   */

  /**
   * @typedef {TrackBase & { kind: 'note', midi: number, waveform: (typeof WAVEFORMS)[number] }} NoteTrack
   */

  /**
   * @typedef {DrumTrack | NoteTrack} Track
   */

  /**
   * @typedef DroneSettings
   * @property {boolean} enabled
   * @property {(typeof WAVEFORMS)[number]} waveform
   * @property {number} midi
   * @property {number} volume
   */

  /**
   * @typedef Tile
   * @property {string} id
   * @property {string} name
   * @property {number} beats
   * @property {DroneSettings[]} drones
   * @property {boolean[][]} grid
   * @property {Record<string, number>} transitions
   */

  /**
   * @typedef AppState
   * @property {number} bpm
   * @property {number} stepsPerBeat
   * @property {string | null} startTileId
   * @property {string | null} activeTileId
   * @property {string | null} loopTileId
   * @property {Track[]} tracks
   * @property {Tile[]} tiles
   */

  /** @type {AppState} */
  let state = {
    bpm: 120,
    stepsPerBeat: DEFAULT_STEPS_PER_BEAT,
    startTileId: null,
    activeTileId: null,
    loopTileId: null,
    tracks: [],
    tiles: [],
  };

  // --------------------- Utils ---------------------

  function clampInt(n, min, max) {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
  }

  function clampFloat(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `t_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function midiToNoteName(midi) {
    const name = NOTE_NAMES[midi % 12] || 'C';
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave}`;
  }

  const NOTE_CHOICES = (() => {
    const out = [];
    for (let midi = 36; midi <= 96; midi++) {
      out.push({ midi, name: midiToNoteName(midi) });
    }
    return out;
  })();

  function waveformToU8(waveform) {
    const idx = WAVEFORMS.indexOf(waveform);
    return idx >= 0 ? idx : 0;
  }

  function u8ToWaveform(n) {
    return WAVEFORMS[n] || 'sine';
  }

  function drumToU8(drum) {
    if (drum === 'kick') return 0;
    if (drum === 'snare') return 1;
    return 2;
  }

  function u8ToDrum(n) {
    if (n === 0) return 'kick';
    if (n === 1) return 'snare';
    return 'hat';
  }

  function createDefaultTracks() {
    /** @type {Track[]} */
    const tracks = [
      { id: uuid(), label: 'Kick', kind: 'drum', drum: 'kick' },
      { id: uuid(), label: 'Snare', kind: 'drum', drum: 'snare' },
      { id: uuid(), label: 'Hat', kind: 'drum', drum: 'hat' },
      { id: uuid(), label: 'C4', kind: 'note', midi: 60, waveform: 'square' },
      { id: uuid(), label: 'D4', kind: 'note', midi: 62, waveform: 'square' },
      { id: uuid(), label: 'E4', kind: 'note', midi: 64, waveform: 'square' },
      { id: uuid(), label: 'G4', kind: 'note', midi: 67, waveform: 'square' },
      { id: uuid(), label: 'A4', kind: 'note', midi: 69, waveform: 'square' },
    ];
    return tracks;
  }

  /** @returns {DroneSettings} */
  function createDefaultDroneSettings() {
    return { ...DEFAULT_DRONE };
  }

  /** @param {DroneSettings | undefined | null} drone */
  function normalizeDroneSettings(drone) {
    const d = drone || createDefaultDroneSettings();
    return {
      enabled: Boolean(d.enabled),
      waveform: u8ToWaveform(waveformToU8(d.waveform)),
      midi: clampInt(d.midi, 0, 127),
      volume: clampFloat(d.volume, 0, 1),
    };
  }

  /**
   * @param {unknown} drones
   * @param {unknown} legacyDrone
   */
  function normalizeDroneList(drones, legacyDrone) {
    const list = Array.isArray(drones) ? drones : [];
    const fallback = !list.length && legacyDrone ? [legacyDrone] : list;
    return fallback.map((d) => normalizeDroneSettings(/** @type {any} */ (d)));
  }

  function getStepsPerBeat() {
    return clampInt(state.stepsPerBeat, 1, MAX_STEPS_PER_BEAT);
  }

  function stepsForBeats(beats, stepsPerBeat = getStepsPerBeat()) {
    return clampInt(beats, 1, MAX_BEATS_PER_TILE) * clampInt(stepsPerBeat, 1, MAX_STEPS_PER_BEAT);
  }

  function stepsForTile(tile) {
    return stepsForBeats(tile.beats, getStepsPerBeat());
  }

  function createEmptyGrid(trackCount, steps) {
    return Array.from({ length: trackCount }, () => Array.from({ length: steps }, () => false));
  }

  function resizeGrid(grid, trackCount, steps) {
    const next = createEmptyGrid(trackCount, steps);
    for (let r = 0; r < trackCount; r++) {
      const row = grid[r] || [];
      for (let s = 0; s < steps; s++) {
        next[r][s] = Boolean(row[s]);
      }
    }
    return next;
  }

  function ensureTileGrids() {
    const trackCount = state.tracks.length;
    for (const tile of state.tiles) {
      tile.beats = clampInt(tile.beats, 1, MAX_BEATS_PER_TILE);
      tile.drones = normalizeDroneList(tile.drones, /** @type {any} */ (tile).drone);
      if ('drone' in tile) delete tile.drone;
      const steps = stepsForTile(tile);
      tile.grid = resizeGrid(tile.grid, trackCount, steps);
    }
  }

  function getTile(tileId) {
    return state.tiles.find((t) => t.id === tileId) || null;
  }

  function getActiveTile() {
    if (!state.activeTileId) return null;
    return getTile(state.activeTileId);
  }

  function ensureTransitionsComplete() {
    const ids = state.tiles.map((t) => t.id);
    for (const t of state.tiles) {
      for (const id of ids) {
        if (!(id in t.transitions)) t.transitions[id] = 0;
      }
      for (const key of Object.keys(t.transitions)) {
        if (!ids.includes(key)) delete t.transitions[key];
      }
    }
  }

  function createTile(name, beats = 16) {
    const b = clampInt(beats, 1, MAX_BEATS_PER_TILE);
    /** @type {Tile} */
    const tile = {
      id: uuid(),
      name,
      beats: b,
      drones: [createDefaultDroneSettings()],
      grid: createEmptyGrid(state.tracks.length, stepsForBeats(b)),
      transitions: {},
    };
    return tile;
  }

  function setTileBeats(tile, beats) {
    tile.beats = clampInt(beats, 1, MAX_BEATS_PER_TILE);
    tile.grid = resizeGrid(tile.grid, state.tracks.length, stepsForTile(tile));
    if (intervalId !== null) {
      stepIndex = stepIndex % stepsForTile(tile);
    }
  }

  function addNoteChannel() {
    const noteTracks = state.tracks.filter((t) => t.kind === 'note');
    const label = `Note ${noteTracks.length + 1}`;
    /** @type {NoteTrack} */
    const track = {
      id: uuid(),
      label,
      kind: 'note',
      midi: 60,
      waveform: 'sine',
    };

    state.tracks.push(track);
    ensureTileGrids();
    renderAll();
    scheduleUrlUpdate();
  }

  function removeNoteChannel(trackId) {
    const idx = state.tracks.findIndex((t) => t.id === trackId);
    if (idx < DRUM_TRACK_COUNT) return;

    state.tracks.splice(idx, 1);
    ensureTileGrids();

    renderAll();
    scheduleUrlUpdate();
  }

  function addDroneToActiveTile() {
    const tile = getActiveTile();
    if (!tile) return;

    tile.drones = normalizeDroneList(tile.drones, null);
    tile.drones.push(createDefaultDroneSettings());

    renderAll();
    scheduleUrlUpdate();
  }

  function removeDroneFromActiveTile(index) {
    const tile = getActiveTile();
    if (!tile) return;

    tile.drones = normalizeDroneList(tile.drones, null);
    tile.drones.splice(index, 1);

    renderAll();
    scheduleUrlUpdate();
  }

  // --------------------- Audio ---------------------

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

  /** @param {DroneSettings} drone */
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

  // --------------------- UI: Tile Settings ---------------------

  function renderTileSettings() {
    const tile = getActiveTile();
    if (!tile || !els.tileSettings) return;

    els.tileSettings.innerHTML = `
      <div class="subsection">
        <div class="subsection__title">Tile</div>
        <div class="subsection__content">
          <label class="field" style="min-width: 160px; max-width: 220px;">
            <span>Beats per tile</span>
            <input id="tileBeats" class="input" type="number" min="1" max="${MAX_BEATS_PER_TILE}" value="${tile.beats}" />
          </label>
          <label class="field" style="min-width: 160px; max-width: 220px;">
            <span>Steps per beat</span>
            <input id="stepsPerBeat" class="input" type="number" min="1" max="${MAX_STEPS_PER_BEAT}" value="${getStepsPerBeat()}" />
          </label>
        </div>
      </div>
    `;

    const beatsInput = /** @type {HTMLInputElement | null} */ (els.tileSettings.querySelector('#tileBeats'));
    const spbInput = /** @type {HTMLInputElement | null} */ (els.tileSettings.querySelector('#stepsPerBeat'));

    beatsInput?.addEventListener('input', () => {
      const t = getActiveTile();
      if (!t) return;
      const next = clampInt(beatsInput.value, 1, MAX_BEATS_PER_TILE);
      beatsInput.value = String(next);
      setTileBeats(t, next);
      renderGrid();
      scheduleUrlUpdate();
    });

    spbInput?.addEventListener('input', () => {
      const next = clampInt(spbInput.value, 1, MAX_STEPS_PER_BEAT);
      spbInput.value = String(next);
      state.stepsPerBeat = next;

      ensureTileGrids();

      const t = getActiveTile();
      if (intervalId !== null && t) {
        stepIndex = stepIndex % stepsForTile(t);
        updatePlaybackSpeed();
      }

      renderGrid();
      scheduleUrlUpdate();
    });
  }

  // --------------------- UI: Instrument Settings ---------------------

  function renderInstrumentSettings() {
    if (!els.instrumentSettings) return;

    const tile = getActiveTile();
    const droneDisabledAttr = tile ? '' : 'disabled';

    const drones = tile ? normalizeDroneList(tile.drones, null) : [];

    const droneRows = drones
      .map((d, idx) => {
        const noteOptions = NOTE_CHOICES.map((n) => {
          const selected = n.midi === d.midi ? 'selected' : '';
          return `<option value="${n.midi}" ${selected}>${n.name}</option>`;
        }).join('');

        const waveOptions = WAVEFORMS.map((w) => {
          const selected = w === d.waveform ? 'selected' : '';
          return `<option value="${w}" ${selected}>${w}</option>`;
        }).join('');

        return `
          <div class="drone-row" data-drone-index="${idx}">
            <label class="drone-row__label">
              <span>Enabled</span>
              <select class="select js-drone-enabled" ${droneDisabledAttr}>
                <option value="0" ${d.enabled ? '' : 'selected'}>Off</option>
                <option value="1" ${d.enabled ? 'selected' : ''}>On</option>
              </select>
            </label>
            <label class="drone-row__label">
              <span>Note</span>
              <select class="select js-drone-note" ${droneDisabledAttr}>${noteOptions}</select>
            </label>
            <label class="drone-row__label">
              <span>Wave</span>
              <select class="select js-drone-wave" ${droneDisabledAttr}>${waveOptions}</select>
            </label>
            <label class="drone-row__label">
              <span>Volume</span>
              <input class="input js-drone-vol" type="number" min="0" max="100" step="1" value="${Math.round(d.volume * 100)}" ${droneDisabledAttr} />
            </label>
            <button class="btn danger js-drone-remove" type="button" ${droneDisabledAttr}>Remove</button>
          </div>
        `;
      })
      .join('');

    const dronesBody = droneRows ? `<div class="rows">${droneRows}</div>` : '<div class="small muted">No drones.</div>';

    const noteRows = state.tracks
      .filter((t) => t.kind === 'note')
      .map((t) => {
        const noteOptions = NOTE_CHOICES.map((n) => {
          const selected = n.midi === t.midi ? 'selected' : '';
          return `<option value="${n.midi}" ${selected}>${n.name}</option>`;
        }).join('');

        const waveOptions = WAVEFORMS.map((w) => {
          const selected = w === t.waveform ? 'selected' : '';
          return `<option value="${w}" ${selected}>${w}</option>`;
        }).join('');

        return `
          <div class="channel-row" data-track-id="${t.id}">
            <label class="channel-row__label">
              <span>Name</span>
              <input class="input js-track-name" type="text" value="${escapeHtml(t.label)}" />
            </label>
            <label class="channel-row__label">
              <span>Note</span>
              <select class="select js-track-note">${noteOptions}</select>
            </label>
            <label class="channel-row__label">
              <span>Wave</span>
              <select class="select js-track-wave">${waveOptions}</select>
            </label>
            <button class="btn danger js-track-remove" type="button">Remove</button>
          </div>
        `;
      })
      .join('');

    const notesBody = noteRows ? `<div class="rows">${noteRows}</div>` : '<div class="small muted">No note channels.</div>';

    const dronesOpenAttr = ui.dronesOpen ? 'open' : '';
    const notesOpenAttr = ui.notesOpen ? 'open' : '';

    els.instrumentSettings.innerHTML = `
      <details id="dronesDetails" class="subsection subsection--collapsible" ${dronesOpenAttr}>
        <summary class="subsection__title">Drones (per tile)</summary>
        <div class="subsection__content">
          ${tile ? '' : '<div class="small muted">Select a tile to edit drone settings.</div>'}
          ${dronesBody}
          <div>
            <button id="addDrone" class="btn primary" type="button" ${droneDisabledAttr}>+ Add drone</button>
          </div>
        </div>
      </details>

      <details id="notesDetails" class="subsection subsection--collapsible" ${notesOpenAttr}>
        <summary class="subsection__title">Note channels</summary>
        <div class="subsection__content">
          ${notesBody}
          <div>
            <button id="addNoteChannel" class="btn primary" type="button">+ Add note channel</button>
          </div>
        </div>
      </details>
    `;

    const dronesDetails = /** @type {HTMLDetailsElement | null} */ (els.instrumentSettings.querySelector('#dronesDetails'));
    dronesDetails?.addEventListener('toggle', () => {
      ui.dronesOpen = Boolean(dronesDetails.open);
    });

    const notesDetails = /** @type {HTMLDetailsElement | null} */ (els.instrumentSettings.querySelector('#notesDetails'));
    notesDetails?.addEventListener('toggle', () => {
      ui.notesOpen = Boolean(notesDetails.open);
    });

    const addDroneBtn = /** @type {HTMLButtonElement | null} */ (els.instrumentSettings.querySelector('#addDrone'));
    addDroneBtn?.addEventListener('click', addDroneToActiveTile);

    const addBtn = /** @type {HTMLButtonElement | null} */ (els.instrumentSettings.querySelector('#addNoteChannel'));
    addBtn?.addEventListener('click', addNoteChannel);

    const droneEls = els.instrumentSettings.querySelectorAll('.drone-row');
    droneEls.forEach((row) => {
      const idx = clampInt(row.getAttribute('data-drone-index'), 0, 255);

      const enabledSel = /** @type {HTMLSelectElement | null} */ (row.querySelector('.js-drone-enabled'));
      const noteSel = /** @type {HTMLSelectElement | null} */ (row.querySelector('.js-drone-note'));
      const waveSel = /** @type {HTMLSelectElement | null} */ (row.querySelector('.js-drone-wave'));
      const volInput = /** @type {HTMLInputElement | null} */ (row.querySelector('.js-drone-vol'));
      const removeBtn = /** @type {HTMLButtonElement | null} */ (row.querySelector('.js-drone-remove'));

      enabledSel?.addEventListener('change', () => {
        const t = getActiveTile();
        if (!t) return;
        t.drones = normalizeDroneList(t.drones, null);
        const d = t.drones[idx];
        if (!d) return;
        t.drones[idx] = normalizeDroneSettings({ ...d, enabled: enabledSel.value === '1' });
        syncDronePlayback();
        scheduleUrlUpdate();
      });

      noteSel?.addEventListener('change', () => {
        const t = getActiveTile();
        if (!t) return;
        t.drones = normalizeDroneList(t.drones, null);
        const d = t.drones[idx];
        if (!d) return;
        t.drones[idx] = normalizeDroneSettings({ ...d, midi: clampInt(noteSel.value, 0, 127) });
        syncDronePlayback();
        scheduleUrlUpdate();
      });

      waveSel?.addEventListener('change', () => {
        const t = getActiveTile();
        if (!t) return;
        t.drones = normalizeDroneList(t.drones, null);
        const d = t.drones[idx];
        if (!d) return;
        t.drones[idx] = normalizeDroneSettings({ ...d, waveform: u8ToWaveform(waveformToU8(waveSel.value)) });
        syncDronePlayback();
        scheduleUrlUpdate();
      });

      volInput?.addEventListener('input', () => {
        const t = getActiveTile();
        if (!t) return;
        t.drones = normalizeDroneList(t.drones, null);
        const d = t.drones[idx];
        if (!d) return;
        const v = clampInt(volInput.value, 0, 100);
        volInput.value = String(v);
        t.drones[idx] = normalizeDroneSettings({ ...d, volume: clampFloat(v / 100, 0, 1) });
        syncDronePlayback();
        scheduleUrlUpdate();
      });

      removeBtn?.addEventListener('click', () => {
        removeDroneFromActiveTile(idx);
      });
    });

    const rows = els.instrumentSettings.querySelectorAll('.channel-row');
    rows.forEach((row) => {
      const id = row.getAttribute('data-track-id');
      if (!id) return;

      const nameInput = /** @type {HTMLInputElement | null} */ (row.querySelector('.js-track-name'));
      const noteInput = /** @type {HTMLSelectElement | null} */ (row.querySelector('.js-track-note'));
      const waveInput = /** @type {HTMLSelectElement | null} */ (row.querySelector('.js-track-wave'));
      const removeBtn = /** @type {HTMLButtonElement | null} */ (row.querySelector('.js-track-remove'));

      nameInput?.addEventListener('change', () => {
        const tr = state.tracks.find((t) => t.id === id);
        if (!tr || tr.kind !== 'note') return;
        tr.label = nameInput.value.trim().slice(0, 60) || tr.label;
        renderGrid();
        scheduleUrlUpdate();
      });

      noteInput?.addEventListener('change', () => {
        const tr = state.tracks.find((t) => t.id === id);
        if (!tr || tr.kind !== 'note') return;
        tr.midi = clampInt(noteInput.value, 0, 127);
        scheduleUrlUpdate();
      });

      waveInput?.addEventListener('change', () => {
        const tr = state.tracks.find((t) => t.id === id);
        if (!tr || tr.kind !== 'note') return;
        tr.waveform = u8ToWaveform(waveformToU8(waveInput.value));
        scheduleUrlUpdate();
      });

      removeBtn?.addEventListener('click', () => {
        removeNoteChannel(id);
      });
    });
  }

  // --------------------- UI: Grid ---------------------

  let gridContainer = null;

  function mountGridUI() {
    els.gridMount.innerHTML = `
      <div class="sequencer__app">
        <div id="sequencerApp"></div>
      </div>
      <p class="sequencer__hint">Click cells to toggle. The playhead highlights the current step.</p>
    `;

    gridContainer = /** @type {HTMLElement} */ (document.getElementById('sequencerApp'));
  }

  function renderGrid() {
    const tile = getActiveTile();
    if (!tile || !gridContainer) return;

    const steps = stepsForTile(tile);
    const stepsPerBeat = getStepsPerBeat();

    const gridEl = document.createElement('div');
    gridEl.className = 'seq-grid';
    gridEl.style.setProperty('--seq-steps', String(steps));

    const header = document.createElement('div');
    header.className = 'seq-header';
    header.textContent = 'Track';
    gridEl.appendChild(header);

    for (let s = 0; s < steps; s++) {
      const stepLabel = document.createElement('div');
      stepLabel.className = 'seq-step-label';
      stepLabel.textContent = String(s + 1);
      gridEl.appendChild(stepLabel);
    }

    const playheadStep = intervalId !== null ? stepIndex % steps : null;

    for (let r = 0; r < state.tracks.length; r++) {
      const label = document.createElement('div');
      label.className = 'seq-track-label';
      label.textContent = state.tracks[r].label;
      gridEl.appendChild(label);

      for (let s = 0; s < steps; s++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'seq-cell';
        btn.dataset.row = String(r);
        btn.dataset.step = String(s);

        if (tile.grid[r][s]) btn.classList.add('is-active');
        if (playheadStep !== null && s === playheadStep) btn.classList.add('is-playhead');
        if (stepsPerBeat > 1 && s % stepsPerBeat === 0) btn.classList.add('is-downbeat');

        btn.addEventListener('click', () => {
          const t = getActiveTile();
          if (!t) return;
          t.grid[r][s] = !t.grid[r][s];
          renderGrid();
          scheduleUrlUpdate();
        });

        gridEl.appendChild(btn);
      }
    }

    gridContainer.replaceChildren(gridEl);
  }

  function updatePlayheadClasses(prevStep, nextStep) {
    if (!gridContainer) return;
    const prevCells = gridContainer.querySelectorAll(`.seq-cell[data-step="${prevStep}"]`);
    prevCells.forEach((c) => c.classList.remove('is-playhead'));
    const nextCells = gridContainer.querySelectorAll(`.seq-cell[data-step="${nextStep}"]`);
    nextCells.forEach((c) => c.classList.add('is-playhead'));
  }

  // --------------------- UI: Tiles ---------------------

  function renderTilesList() {
    els.tilesList.replaceChildren();

    for (const tile of state.tiles) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile-item';
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', tile.id === state.activeTileId ? 'true' : 'false');
      btn.dataset.id = tile.id;

      const name = document.createElement('div');
      name.className = 'tile-item__name';
      name.textContent = tile.name;

      const meta = document.createElement('div');
      meta.className = 'tile-item__meta';
      meta.textContent = tile.id === state.startTileId ? 'Start' : '';

      btn.appendChild(name);
      btn.appendChild(meta);

      btn.addEventListener('click', () => {
        setActiveTile(tile.id);
      });

      els.tilesList.appendChild(btn);
    }
  }

  function renderStartTileSelect() {
    els.startTileSelect.replaceChildren();
    for (const tile of state.tiles) {
      const opt = document.createElement('option');
      opt.value = tile.id;
      opt.textContent = tile.name;
      if (tile.id === state.startTileId) opt.selected = true;
      els.startTileSelect.appendChild(opt);
    }
  }

  function renderActiveTileHeader() {
    const tile = getActiveTile();
    if (!tile) {
      els.activeTileBadge.textContent = '';
      els.activeTileId.textContent = '';
      if (els.loopTileBtn) {
        els.loopTileBtn.disabled = true;
        els.loopTileBtn.classList.remove('is-active');
        els.loopTileBtn.textContent = 'Loop tile';
        els.loopTileBtn.setAttribute('aria-pressed', 'false');
      }
      return;
    }

    els.activeTileBadge.textContent = tile.name;
    els.activeTileId.textContent = tile.id;
    els.transitionsTitle.textContent = `Transitions from “${tile.name}”`;

    if (els.loopTileBtn) {
      const isLooping = state.loopTileId === tile.id;
      els.loopTileBtn.disabled = false;
      els.loopTileBtn.classList.toggle('is-active', isLooping);
      els.loopTileBtn.textContent = isLooping ? 'Stop tile' : 'Play tile';
      els.loopTileBtn.setAttribute('aria-pressed', isLooping ? 'true' : 'false');
    }
  }

  function setActiveTile(tileId, opts = {}) {
    const tile = getTile(tileId);
    if (!tile) return;

    state.activeTileId = tileId;
    if (state.loopTileId) state.loopTileId = tileId;

    if (intervalId !== null) {
      stepIndex = stepIndex % stepsForTile(tile);
    }

    if (!opts.skipRender) {
      renderAll();
    } else {
      syncDronePlayback();
    }

    scheduleUrlUpdate();
  }

  // --------------------- UI: Transitions ---------------------

  function renderTransitions() {
    const from = getActiveTile();
    if (!from) return;

    els.transitionsList.replaceChildren();

    for (const to of state.tiles) {
      const row = document.createElement('div');
      row.className = 'transition-row';

      const label = document.createElement('div');
      label.className = 'transition-row__label';

      const top = document.createElement('div');
      top.textContent = `→ ${to.name}`;
      top.style.fontWeight = '650';

      const bottom = document.createElement('div');
      bottom.className = 'small';
      bottom.textContent = to.id === from.id ? 'Self-loop' : to.id;

      label.appendChild(top);
      label.appendChild(bottom);

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.className = 'weight-input';
      input.value = String(from.transitions[to.id] ?? 0);

      input.addEventListener('input', () => {
        const val = clampInt(input.value, 0, 65535);
        input.value = String(val);
        from.transitions[to.id] = val;
        scheduleUrlUpdate();
      });

      row.appendChild(label);
      row.appendChild(input);
      els.transitionsList.appendChild(row);
    }
  }

  // --------------------- Markov Graph ---------------------

  function renderChainNodes() {
    if (!els.chainNodes) return;
    els.chainNodes.replaceChildren();

    for (const tile of state.tiles) {
      const node = document.createElement('div');
      node.className = 'chain-node';

      if (tile.id === state.activeTileId) node.classList.add('is-active');
      if (tile.id === state.startTileId) node.classList.add('is-start');

      const title = document.createElement('div');
      title.className = 'chain-node__title';
      title.textContent = tile.name;

      const chips = document.createElement('div');
      chips.className = 'chain-node__chips';

      if (tile.id === state.startTileId) {
        const chip = document.createElement('span');
        chip.className = 'chain-chip is-start';
        chip.textContent = 'Start';
        chips.appendChild(chip);
      }

      if (tile.id === state.activeTileId) {
        const chip = document.createElement('span');
        chip.className = 'chain-chip is-active';
        chip.textContent = 'Active';
        chips.appendChild(chip);
      }

      const totalWeight = Object.values(tile.transitions).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
      const meta = document.createElement('div');
      meta.className = 'small muted';
      meta.textContent = `Outgoing weight: ${totalWeight}`;

      node.appendChild(title);
      node.appendChild(chips);
      node.appendChild(meta);

      node.addEventListener('click', () => {
        setActiveTile(tile.id);
      });

      els.chainNodes.appendChild(node);
    }
  }

  function renderChainGraph() {
    if (!els.chainCanvas || !els.chainGraph) return;

    const rect = els.chainGraph.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width <= 0 || height <= 0) return;

    const ctx = els.chainCanvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const pxWidth = Math.floor(width * dpr);
    const pxHeight = Math.floor(height * dpr);

    if (els.chainCanvas.width !== pxWidth || els.chainCanvas.height !== pxHeight) {
      els.chainCanvas.width = pxWidth;
      els.chainCanvas.height = pxHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const count = state.tiles.length;
    if (count === 0) return;

    const paddingX = 46;
    const paddingY = 34;
    const availableWidth = Math.max(0, width - paddingX * 2);
    const spacing = count > 1 ? availableWidth / (count - 1) : 0;
    const maxRadius = 22;
    const minRadius = 14;
    const radius = Math.max(minRadius, Math.min(maxRadius, spacing > 0 ? spacing * 0.35 : maxRadius));
    const centerY = height / 2;
    const maxArc = Math.max(24, centerY - radius - paddingY);

    const positions = state.tiles.map((_, i) => ({
      x: count === 1 ? width / 2 : paddingX + spacing * i,
      y: centerY,
    }));

    const weights = [];
    for (const tile of state.tiles) {
      for (const target of state.tiles) {
        const weight = Math.max(0, Number(tile.transitions[target.id] || 0));
        if (weight > 0) weights.push(weight);
      }
    }
    const maxWeight = Math.max(1, ...weights);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '11px system-ui';

    for (let i = 0; i < count; i++) {
      const from = state.tiles[i];
      const fromPos = positions[i];

      for (let j = 0; j < count; j++) {
        const to = state.tiles[j];
        const weight = Math.max(0, Number(from.transitions[to.id] || 0));
        if (weight <= 0) continue;

        const strength = weight / maxWeight;
        const alpha = 0.2 + 0.6 * strength;
        const lineWidth = 1 + 2.2 * strength;
        const color = from.id === state.activeTileId ? `rgba(245, 158, 11, ${alpha})` : `rgba(37, 99, 235, ${alpha})`;

        if (i === j) {
          const loopRadius = Math.min(radius * 0.8, maxArc);
          const loopCenterX = fromPos.x;

          const desiredCenterY = fromPos.y + radius * 2.25;
          const minCenterY = fromPos.y + radius * 1.3;
          const maxCenterY = height - paddingY - loopRadius - 10;
          const loopCenterY = maxCenterY >= minCenterY ? clampFloat(desiredCenterY, minCenterY, maxCenterY) : desiredCenterY;

          const startAngle = Math.PI / 3; // 60deg
          const endAngle = (2 * Math.PI) / 3; // 120deg

          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          ctx.arc(loopCenterX, loopCenterY, loopRadius, startAngle, endAngle);
          ctx.stroke();

          const arrowAngle = endAngle + Math.PI / 2;
          const endX = loopCenterX + Math.cos(endAngle) * loopRadius;
          const endY = loopCenterY + Math.sin(endAngle) * loopRadius;
          const head = 5 + 4 * strength;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(endX - head * Math.cos(arrowAngle - 0.5), endY - head * Math.sin(arrowAngle - 0.5));
          ctx.lineTo(endX - head * Math.cos(arrowAngle + 0.5), endY - head * Math.sin(arrowAngle + 0.5));
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
          ctx.fillText(String(weight), loopCenterX, Math.min(height - paddingY - 6, loopCenterY + loopRadius + 12));
          continue;
        }

        const direction = j > i ? 1 : -1;
        const span = Math.abs(j - i);
        const arcHeight = Math.min(maxArc, 18 + span * 12);
        const startX = fromPos.x + direction * radius;
        const endX = positions[j].x - direction * radius;
        const controlX = (startX + endX) / 2;
        const controlY = centerY - direction * arcHeight;

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(startX, centerY);
        ctx.quadraticCurveTo(controlX, controlY, endX, centerY);
        ctx.stroke();

        const angle = Math.atan2(centerY - controlY, endX - controlX);
        const head = 5 + 4 * strength;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(endX, centerY);
        ctx.lineTo(endX - head * Math.cos(angle - 0.4), centerY - head * Math.sin(angle - 0.4));
        ctx.lineTo(endX - head * Math.cos(angle + 0.4), centerY - head * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.fillText(String(weight), controlX, controlY - direction * 10);
      }
    }

    for (let i = 0; i < count; i++) {
      const tile = state.tiles[i];
      const pos = positions[i];
      const isActive = tile.id === state.activeTileId;
      const isStart = tile.id === state.startTileId;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? 'rgba(37, 99, 235, 0.95)' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = isStart ? 2.5 : 1.5;
      ctx.strokeStyle = isStart ? 'rgba(245, 158, 11, 0.9)' : 'rgba(37, 99, 235, 0.35)';
      ctx.stroke();

      const initials = tile.name.trim().slice(0, 2).toUpperCase();
      ctx.fillStyle = isActive ? '#ffffff' : '#0f172a';
      ctx.font = '12px system-ui';
      ctx.fillText(initials, pos.x, pos.y);

      const label = tile.name.length > 12 ? `${tile.name.slice(0, 10)}…` : tile.name;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.font = '11px system-ui';
      ctx.fillText(label, pos.x, pos.y + radius + 14);
    }
  }

  // --------------------- Markov Playback ---------------------

  function chooseNextTileId(fromTileId) {
    const from = getTile(fromTileId);
    if (!from) return fromTileId;

    const weights = state.tiles.map((t) => Math.max(0, Number(from.transitions[t.id] || 0)));
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return fromTileId;

    let r = Math.random() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return state.tiles[i].id;
    }

    return fromTileId;
  }

  function renderPlaybackStatus() {
    const tile = getActiveTile();
    if (intervalId !== null) {
      if (state.loopTileId && tile) {
        els.playbackStatus.textContent = `Looping: ${tile.name}`;
      } else {
        els.playbackStatus.textContent = tile ? `Playing: ${tile.name}` : 'Playing';
      }
    } else {
      els.playbackStatus.textContent = 'Stopped';
    }
  }

  function setPlayingUI(isPlaying) {
    els.playBtn.disabled = isPlaying;
    els.stopBtn.disabled = !isPlaying;
    renderPlaybackStatus();
  }

  function tick() {
    const tile = getActiveTile();
    if (!tile) return;

    const steps = stepsForTile(tile);
    const current = stepIndex % steps;

    if (audioCtx) {
      const t = audioCtx.currentTime + 0.01;
      playStep(tile, current, t);
    }

    const next = (current + 1) % steps;
    updatePlayheadClasses(current, next);
    stepIndex = next;

    if (stepIndex === 0) {
      TileMarkov.onLoopComplete();
    }
  }

  async function startPlayback() {
    if (intervalId !== null) return;

    const requestId = ++playbackRequestId;

    ensureAudio();
    if (!audioCtx) return;

    if (audioCtx.state !== 'running') {
      try {
        await audioCtx.resume();
      } catch {
        // ignore
      }
    }

    if (requestId !== playbackRequestId) return;

    const startId = state.loopTileId || state.startTileId || state.tiles[0]?.id || null;
    if (startId) {
      if (!state.startTileId) state.startTileId = startId;
      state.activeTileId = startId;
    }

    stepIndex = 0;

    const stepMs = () => (60_000 / state.bpm) / getStepsPerBeat();
    intervalId = window.setInterval(tick, stepMs());

    renderAll();
    setPlayingUI(true);
    syncDronePlayback();
  }

  function stopPlayback() {
    playbackRequestId += 1;
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }

    syncDronePlayback();
    setPlayingUI(false);

    renderGrid();
  }

  function updatePlaybackSpeed() {
    if (intervalId === null) return;
    window.clearInterval(intervalId);
    intervalId = window.setInterval(tick, (60_000 / state.bpm) / getStepsPerBeat());
  }

  const TileMarkov = {
    onLoopComplete: () => {
      const fromId = state.activeTileId;
      if (!fromId) return;

      if (state.loopTileId) {
        state.activeTileId = state.loopTileId;
        renderAll();
        return;
      }

      const nextId = chooseNextTileId(fromId);
      if (nextId !== fromId) {
        state.activeTileId = nextId;
      }
      renderAll();
    },
  };

  window.TileMarkov = TileMarkov;

  // --------------------- URL Share ---------------------

  class ByteWriter {
    constructor() {
      /** @type {number[]} */
      this.buf = [];
    }
    u8(n) {
      this.buf.push(n & 0xff);
    }
    u16(n) {
      this.buf.push(n & 0xff, (n >> 8) & 0xff);
    }
    bytes(arr) {
      for (const b of arr) this.buf.push(b);
    }
    toUint8Array() {
      return new Uint8Array(this.buf);
    }
  }

  class ByteReader {
    /** @param {Uint8Array} bytes */
    constructor(bytes) {
      this.bytes = bytes;
      this.i = 0;
    }
    u8() {
      if (this.i + 1 > this.bytes.length) throw new Error('EOF');
      return this.bytes[this.i++];
    }
    u16() {
      const lo = this.u8();
      const hi = this.u8();
      return lo | (hi << 8);
    }
    take(n) {
      if (this.i + n > this.bytes.length) throw new Error('EOF');
      const out = this.bytes.slice(this.i, this.i + n);
      this.i += n;
      return out;
    }
  }

  function toBase64Url(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const part = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode(...part);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function fromBase64Url(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function gridToBytes(grid, trackCount, steps) {
    const bitCount = trackCount * steps;
    const bytes = new Uint8Array(Math.ceil(bitCount / 8));
    let k = 0;
    for (let r = 0; r < trackCount; r++) {
      for (let s = 0; s < steps; s++) {
        if (grid[r][s]) bytes[k >> 3] |= 1 << (k & 7);
        k++;
      }
    }
    return bytes;
  }

  function bytesToGrid(bytes, trackCount, steps) {
    const grid = createEmptyGrid(trackCount, steps);
    let k = 0;
    for (let r = 0; r < trackCount; r++) {
      for (let s = 0; s < steps; s++) {
        const on = (bytes[k >> 3] & (1 << (k & 7))) !== 0;
        grid[r][s] = on;
        k++;
      }
    }
    return grid;
  }

  function encodeState() {
    // v4 binary format:
    // [u8 version=4]
    // [u16 bpm]
    // [u8 trackCount]
    // for each track:
    //   [u8 kind 0=drum 1=note]
    //   [u8 labelLen][labelBytes]
    //   if drum: [u8 drumType]
    //   if note: [u8 waveform][u8 midi]
    // [u16 startIndex or 0xFFFF]
    // [u16 tileCount]
    // for each tile:
    //   [u8 nameLen][nameBytes]
    //   [u8 beats]
    //   [u8 droneCount]
    //   for each drone:
    //     [u8 enabled][u8 waveform][u8 midi][u8 volumePercent]
    //   [gridBytes]
    // transitions matrix: tileCount * tileCount * u16 weight

    ensureTransitionsComplete();
    ensureTileGrids();

    const w = new ByteWriter();
    const enc = new TextEncoder();

    const trackCount = clampInt(state.tracks.length, 1, 255);

    w.u8(5);
    w.u16(clampInt(state.bpm, 30, 300));
    w.u8(clampInt(getStepsPerBeat(), 1, MAX_STEPS_PER_BEAT));
    w.u8(trackCount);

    for (let i = 0; i < trackCount; i++) {
      const tr = state.tracks[i];
      if (tr.kind === 'drum') {
        w.u8(0);
        const labelBytes = enc.encode(tr.label);
        const trimmed = labelBytes.length > 60 ? labelBytes.slice(0, 60) : labelBytes;
        w.u8(trimmed.length);
        w.bytes(trimmed);
        w.u8(drumToU8(tr.drum));
      } else {
        w.u8(1);
        const labelBytes = enc.encode(tr.label);
        const trimmed = labelBytes.length > 60 ? labelBytes.slice(0, 60) : labelBytes;
        w.u8(trimmed.length);
        w.bytes(trimmed);
        w.u8(waveformToU8(tr.waveform));
        w.u8(clampInt(tr.midi, 0, 127));
      }
    }

    const tileCount = state.tiles.length;
    const startIndex = state.startTileId ? state.tiles.findIndex((t) => t.id === state.startTileId) : -1;
    w.u16(startIndex >= 0 ? startIndex : 0xffff);
    w.u16(tileCount);

    for (const t of state.tiles) {
      const nameBytes = enc.encode(t.name);
      const trimmed = nameBytes.length > 80 ? nameBytes.slice(0, 80) : nameBytes;
      w.u8(trimmed.length);
      w.bytes(trimmed);

      const beats = clampInt(t.beats, 1, MAX_BEATS_PER_TILE);
      w.u8(beats);

      const drones = normalizeDroneList(t.drones, null);
      const droneCount = clampInt(drones.length, 0, 255);
      w.u8(droneCount);

      for (let i = 0; i < droneCount; i++) {
        const drone = normalizeDroneSettings(drones[i]);
        w.u8(drone.enabled ? 1 : 0);
        w.u8(waveformToU8(drone.waveform));
        w.u8(clampInt(drone.midi, 0, 127));
        w.u8(clampInt(Math.round(clampFloat(drone.volume, 0, 1) * 100), 0, 100));
      }

      const steps = stepsForBeats(beats);
      const gb = gridToBytes(t.grid, trackCount, steps);
      w.bytes(gb);
    }

    for (let i = 0; i < tileCount; i++) {
      const from = state.tiles[i];
      for (let j = 0; j < tileCount; j++) {
        const to = state.tiles[j];
        const weight = clampInt(from.transitions[to.id] ?? 0, 0, 65535);
        w.u16(weight);
      }
    }

    return toBase64Url(w.toUint8Array());
  }

  function decodeStateV1(r, dec) {
    const bpm = r.u16();
    const stepsPerBeat = LEGACY_STEPS_PER_BEAT;
    const startIndex = r.u16();
    const tileCount = r.u16();

    if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

    const tracks = createDefaultTracks();
    const trackCount = tracks.length;
    const steps = 16;
    const gridByteLen = Math.ceil((trackCount * steps) / 8);

    /** @type {Tile[]} */
    const tiles = [];

    for (let i = 0; i < tileCount; i++) {
      const nameLen = r.u8();
      const nameBytes = r.take(nameLen);
      const name = dec.decode(nameBytes) || `Tile ${i + 1}`;
      const gridBytes = r.take(gridByteLen);

      tiles.push({
        id: uuid(),
        name,
        beats: 4,
        drones: [createDefaultDroneSettings()],
        grid: bytesToGrid(gridBytes, trackCount, steps),
        transitions: {},
      });
    }

    for (let i = 0; i < tileCount; i++) {
      for (let j = 0; j < tileCount; j++) {
        const wgt = r.u16();
        tiles[i].transitions[tiles[j].id] = wgt;
      }
    }

    const startId = startIndex !== 0xffff && startIndex < tiles.length ? tiles[startIndex].id : tiles[0].id;

    return {
      bpm: clampInt(bpm, 30, 300),
      stepsPerBeat,
      startTileId: startId,
      activeTileId: startId,
      loopTileId: null,
      tracks,
      tiles,
    };
  }

  function decodeStateV2(r, dec) {
    const bpm = r.u16();
    const stepsPerBeat = LEGACY_STEPS_PER_BEAT;
    const trackCount = r.u8();

    if (trackCount <= 0 || trackCount > 255) throw new Error('Invalid track count');

    /** @type {Track[]} */
    const tracks = [];

    for (let i = 0; i < trackCount; i++) {
      const kind = r.u8();
      const labelLen = r.u8();
      const labelBytes = r.take(labelLen);
      const label = dec.decode(labelBytes) || `Track ${i + 1}`;

      if (kind === 0) {
        const drum = u8ToDrum(r.u8());
        tracks.push({ id: uuid(), label, kind: 'drum', drum });
      } else {
        const waveform = u8ToWaveform(r.u8());
        const midi = r.u8();
        tracks.push({ id: uuid(), label, kind: 'note', midi, waveform });
      }
    }

    const globalDrone = normalizeDroneSettings({
      enabled: r.u8() === 1,
      waveform: u8ToWaveform(r.u8()),
      midi: r.u8(),
      volume: clampFloat(r.u8() / 100, 0, 1),
    });

    const startIndex = r.u16();
    const tileCount = r.u16();

    if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

    /** @type {Tile[]} */
    const tiles = [];

    for (let i = 0; i < tileCount; i++) {
      const nameLen = r.u8();
      const nameBytes = r.take(nameLen);
      const name = dec.decode(nameBytes) || `Tile ${i + 1}`;
      const beats = clampInt(r.u8(), 1, MAX_BEATS_PER_TILE);
      const steps = stepsForBeats(beats, stepsPerBeat);
      const gridByteLen = Math.ceil((trackCount * steps) / 8);
      const gridBytes = r.take(gridByteLen);

      tiles.push({
        id: uuid(),
        name,
        beats,
        drones: [{ ...globalDrone }],
        grid: bytesToGrid(gridBytes, trackCount, steps),
        transitions: {},
      });
    }

    for (let i = 0; i < tileCount; i++) {
      for (let j = 0; j < tileCount; j++) {
        const wgt = r.u16();
        tiles[i].transitions[tiles[j].id] = wgt;
      }
    }

    const startId = startIndex !== 0xffff && startIndex < tiles.length ? tiles[startIndex].id : tiles[0].id;

    return {
      bpm: clampInt(bpm, 30, 300),
      stepsPerBeat,
      startTileId: startId,
      activeTileId: startId,
      loopTileId: null,
      tracks,
      tiles,
    };
  }

 function decodeStateV3(r, dec) {
    const bpm = r.u16();
    const stepsPerBeat = LEGACY_STEPS_PER_BEAT;
    const trackCount = r.u8();

    if (trackCount <= 0 || trackCount > 255) throw new Error('Invalid track count');

    /** @type {Track[]} */
    const tracks = [];

    for (let i = 0; i < trackCount; i++) {
      const kind = r.u8();
      const labelLen = r.u8();
      const labelBytes = r.take(labelLen);
      const label = dec.decode(labelBytes) || `Track ${i + 1}`;

      if (kind === 0) {
        const drum = u8ToDrum(r.u8());
        tracks.push({ id: uuid(), label, kind: 'drum', drum });
      } else {
        const waveform = u8ToWaveform(r.u8());
        const midi = r.u8();
        tracks.push({ id: uuid(), label, kind: 'note', midi, waveform });
      }
    }

    const startIndex = r.u16();
    const tileCount = r.u16();

    if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

    /** @type {Tile[]} */
    const tiles = [];

    for (let i = 0; i < tileCount; i++) {
      const nameLen = r.u8();
      const nameBytes = r.take(nameLen);
      const name = dec.decode(nameBytes) || `Tile ${i + 1}`;

      const beats = clampInt(r.u8(), 1, MAX_BEATS_PER_TILE);
      const drone = normalizeDroneSettings({
        enabled: r.u8() === 1,
        waveform: u8ToWaveform(r.u8()),
        midi: r.u8(),
        volume: clampFloat(r.u8() / 100, 0, 1),
      });

      const steps = stepsForBeats(beats, stepsPerBeat);
      const gridByteLen = Math.ceil((trackCount * steps) / 8);
      const gridBytes = r.take(gridByteLen);

      tiles.push({
        id: uuid(),
        name,
        beats,
        drones: [drone],
        grid: bytesToGrid(gridByteLen ? gridBytes : new Uint8Array(0), trackCount, steps),
        transitions: {},
      });
    }

    for (let i = 0; i < tileCount; i++) {
      for (let j = 0; j < tileCount; j++) {
        const wgt = r.u16();
        tiles[i].transitions[tiles[j].id] = wgt;
      }
    }

    const startId = startIndex !== 0xffff && startIndex < tiles.length ? tiles[startIndex].id : tiles[0].id;

    return {
      bpm: clampInt(bpm, 30, 300),
      stepsPerBeat,
      startTileId: startId,
      activeTileId: startId,
      loopTileId: null,
      tracks,
      tiles,
    };
  }

  function decodeStateV4(r, dec) {
    const bpm = r.u16();
    const stepsPerBeat = LEGACY_STEPS_PER_BEAT;
    const trackCount = r.u8();

    if (trackCount <= 0 || trackCount > 255) throw new Error('Invalid track count');

    /** @type {Track[]} */
    const tracks = [];

    for (let i = 0; i < trackCount; i++) {
      const kind = r.u8();
      const labelLen = r.u8();
      const labelBytes = r.take(labelLen);
      const label = dec.decode(labelBytes) || `Track ${i + 1}`;

      if (kind === 0) {
        const drum = u8ToDrum(r.u8());
        tracks.push({ id: uuid(), label, kind: 'drum', drum });
      } else {
        const waveform = u8ToWaveform(r.u8());
        const midi = r.u8();
        tracks.push({ id: uuid(), label, kind: 'note', midi, waveform });
      }
    }

    const startIndex = r.u16();
    const tileCount = r.u16();

    if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

    /** @type {Tile[]} */
    const tiles = [];

    for (let i = 0; i < tileCount; i++) {
      const nameLen = r.u8();
      const nameBytes = r.take(nameLen);
      const name = dec.decode(nameBytes) || `Tile ${i + 1}`;

      const beats = clampInt(r.u8(), 1, MAX_BEATS_PER_TILE);
      const droneCount = clampInt(r.u8(), 0, 255);

      /** @type {DroneSettings[]} */
      const drones = [];
      for (let d = 0; d < droneCount; d++) {
        drones.push(
          normalizeDroneSettings({
            enabled: r.u8() === 1,
            waveform: u8ToWaveform(r.u8()),
            midi: r.u8(),
            volume: clampFloat(r.u8() / 100, 0, 1),
          })
        );
      }

      const steps = stepsForBeats(beats, stepsPerBeat);
      const gridByteLen = Math.ceil((trackCount * steps) / 8);
      const gridBytes = r.take(gridByteLen);

      tiles.push({
        id: uuid(),
        name,
        beats,
        drones,
        grid: bytesToGrid(gridByteLen ? gridBytes : new Uint8Array(0), trackCount, steps),
        transitions: {},
      });
    }

    for (let i = 0; i < tileCount; i++) {
      for (let j = 0; j < tileCount; j++) {
        const wgt = r.u16();
        tiles[i].transitions[tiles[j].id] = wgt;
      }
    }

    const startId = startIndex !== 0xffff && startIndex < tiles.length ? tiles[startIndex].id : tiles[0].id;

    return {
      bpm: clampInt(bpm, 30, 300),
      stepsPerBeat,
      startTileId: startId,
      activeTileId: startId,
      loopTileId: null,
      tracks,
      tiles,
    };
  }

  function decodeStateV5(r, dec) {
    const bpm = r.u16();
    const stepsPerBeat = clampInt(r.u8(), 1, MAX_STEPS_PER_BEAT);
    const trackCount = r.u8();

    if (trackCount <= 0 || trackCount > 255) throw new Error('Invalid track count');

    /** @type {Track[]} */
    const tracks = [];

    for (let i = 0; i < trackCount; i++) {
      const kind = r.u8();
      const labelLen = r.u8();
      const labelBytes = r.take(labelLen);
      const label = dec.decode(labelBytes) || `Track ${i + 1}`;

      if (kind === 0) {
        const drum = u8ToDrum(r.u8());
        tracks.push({ id: uuid(), label, kind: 'drum', drum });
      } else {
        const waveform = u8ToWaveform(r.u8());
        const midi = r.u8();
        tracks.push({ id: uuid(), label, kind: 'note', midi, waveform });
      }
    }

    const startIndex = r.u16();
    const tileCount = r.u16();

    if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

    /** @type {Tile[]} */
    const tiles = [];

    for (let i = 0; i < tileCount; i++) {
      const nameLen = r.u8();
      const nameBytes = r.take(nameLen);
      const name = dec.decode(nameBytes) || `Tile ${i + 1}`;

      const beats = clampInt(r.u8(), 1, MAX_BEATS_PER_TILE);
      const droneCount = clampInt(r.u8(), 0, 255);

      /** @type {DroneSettings[]} */
      const drones = [];
      for (let d = 0; d < droneCount; d++) {
        drones.push(
          normalizeDroneSettings({
            enabled: r.u8() === 1,
            waveform: u8ToWaveform(r.u8()),
            midi: r.u8(),
            volume: clampFloat(r.u8() / 100, 0, 1),
          })
        );
      }

      const steps = stepsForBeats(beats, stepsPerBeat);
      const gridByteLen = Math.ceil((trackCount * steps) / 8);
      const gridBytes = r.take(gridByteLen);

      tiles.push({
        id: uuid(),
        name,
        beats,
        drones,
        grid: bytesToGrid(gridBytes, trackCount, steps),
        transitions: {},
      });
    }

    for (let i = 0; i < tileCount; i++) {
      for (let j = 0; j < tileCount; j++) {
        const wgt = r.u16();
        tiles[i].transitions[tiles[j].id] = wgt;
      }
    }

    const startId = startIndex !== 0xffff && startIndex < tiles.length ? tiles[startIndex].id : tiles[0].id;

    return {
      bpm: clampInt(bpm, 30, 300),
      stepsPerBeat,
      startTileId: startId,
      activeTileId: startId,
      loopTileId: null,
      tracks,
      tiles,
    };
  }

  function decodeState(encoded) {
    const bytes = fromBase64Url(encoded);
    const r = new ByteReader(bytes);
    const dec = new TextDecoder();

    const version = r.u8();
    if (version === 1) return decodeStateV1(r, dec);
    if (version === 2) return decodeStateV2(r, dec);
    if (version === 3) return decodeStateV3(r, dec);
    if (version === 4) return decodeStateV4(r, dec);
    if (version === 5) return decodeStateV5(r, dec);

    throw new Error(`Unsupported version ${version}`);
  }

  function getEncodedFromUrl() {
    const h = window.location.hash || '';
    const m = h.match(/(?:^#|&)s=([^&]+)/);
    return m ? m[1] : null;
  }

  /** @type {number | null} */
  let urlUpdateTimer = null;

  function scheduleUrlUpdate() {
    if (urlUpdateTimer !== null) window.clearTimeout(urlUpdateTimer);
    urlUpdateTimer = window.setTimeout(() => {
      urlUpdateTimer = null;
      try {
        const encoded = encodeState();
        history.replaceState(null, '', `#s=${encoded}`);
      } catch (e) {
        console.warn('Could not encode URL state', e);
      }
    }, 250);
  }

  // --------------------- Toast ---------------------

  let toastEl = null;
  /** @type {number | null} */
  let toastTimer = null;

  function ensureToast() {
    if (toastEl) return;
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);
  }

  function toast(msg) {
    ensureToast();
    if (!toastEl) return;

    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');

    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl?.classList.remove('is-visible');
      toastTimer = null;
    }, 1400);
  }

  async function copyShareUrl() {
    let url;
    try {
      const encoded = encodeState();
      const base = location.origin === 'null' ? location.href.replace(/#.*$/, '') : `${location.origin}${location.pathname}`;
      url = `${base}#s=${encoded}`;
    } catch (e) {
      console.error(e);
      toast('Could not create share URL');
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      toast('Share URL copied');
    } catch {
      prompt('Copy this URL', url);
    }
  }

  // --------------------- Actions ---------------------

  function addTile() {
    const tile = createTile(`Tile ${state.tiles.length + 1}`);
    state.tiles.push(tile);

    state.activeTileId = tile.id;
    if (!state.startTileId) state.startTileId = tile.id;

    ensureTransitionsComplete();

    renderAll();
    scheduleUrlUpdate();
  }

  function renameActiveTile() {
    const tile = getActiveTile();
    if (!tile) return;
    const next = prompt('Tile name', tile.name);
    if (!next) return;
    tile.name = next.trim().slice(0, 60) || tile.name;
    renderAll();
    scheduleUrlUpdate();
  }

  function copyActiveTile() {
    const tile = getActiveTile();
    if (!tile) return;

    const baseName = `${tile.name} Copy`;
    const existing = new Set(state.tiles.map((t) => t.name));
    let name = baseName;
    let i = 2;
    while (existing.has(name)) {
      name = `${baseName} ${i}`;
      i += 1;
    }

    const copy = createTile(name, tile.beats);
    copy.drones = normalizeDroneList(tile.drones, /** @type {any} */ (tile).drone);
    copy.grid = tile.grid.map((row) => row.slice());

    state.tiles.push(copy);
    ensureTransitionsComplete();

    for (const t of state.tiles) {
      if (t.id === copy.id) continue;
      copy.transitions[t.id] = tile.transitions[t.id] ?? 0;
    }
    copy.transitions[copy.id] = tile.transitions[tile.id] ?? 0;

    state.activeTileId = copy.id;
    renderAll();
    scheduleUrlUpdate();
  }

  function deleteActiveTile() {
    if (state.tiles.length <= 1) {
      toast('Need at least 1 tile');
      return;
    }

    const tile = getActiveTile();
    if (!tile) return;

    if (!confirm(`Delete “${tile.name}”?`)) return;

    const idx = state.tiles.findIndex((t) => t.id === tile.id);
    state.tiles.splice(idx, 1);

    if (state.activeTileId === tile.id) state.activeTileId = state.tiles[Math.max(0, idx - 1)]?.id || state.tiles[0].id;
    if (state.startTileId === tile.id) state.startTileId = state.tiles[0].id;

    ensureTransitionsComplete();

    renderAll();
    scheduleUrlUpdate();
  }

  function clearActivePattern() {
    const tile = getActiveTile();
    if (!tile) return;
    tile.grid = createEmptyGrid(state.tracks.length, stepsForTile(tile));
    renderGrid();
    scheduleUrlUpdate();
  }

  function randomizeActivePattern() {
    const tile = getActiveTile();
    if (!tile) return;

    const steps = stepsForTile(tile);
    const stepsPerBeat = getStepsPerBeat();
    const next = createEmptyGrid(state.tracks.length, steps);

    for (let r = 0; r < state.tracks.length; r++) {
      const tr = state.tracks[r];
      const p = tr.kind === 'drum' ? 0.22 : 0.12;
      for (let s = 0; s < steps; s++) {
        const downbeatBoost = stepsPerBeat > 1 && s % stepsPerBeat === 0 ? 1.35 : 1.0;
        next[r][s] = Math.random() < p * downbeatBoost;
      }
    }

    tile.grid = next;
    renderGrid();
    scheduleUrlUpdate();
  }

  function resetAll() {
    if (!confirm('Reset everything?')) return;
    stopPlayback();
    initDefaultState();
    history.replaceState(null, '', location.pathname);
    renderAll();
  }

  // --------------------- Render ---------------------

  function renderAll() {
    ensureTransitionsComplete();
    ensureTileGrids();

    renderTilesList();
    renderStartTileSelect();
    renderActiveTileHeader();
    renderTileSettings();
    renderInstrumentSettings();
    renderTransitions();
    renderChainNodes();
    renderChainGraph();
    renderGrid();
    renderPlaybackStatus();

    els.tempoRange.value = String(state.bpm);
    els.tempoNumber.value = String(state.bpm);

    syncDronePlayback();
  }

  // --------------------- Init ---------------------

  function initDefaultState() {
    state = {
      bpm: 120,
      stepsPerBeat: DEFAULT_STEPS_PER_BEAT,
      startTileId: null,
      activeTileId: null,
      loopTileId: null,
      tracks: createDefaultTracks(),
      tiles: [],
    };

    const a = createTile('Tile A', 16);
    const b = createTile('Tile B', 16);

    a.grid[0][0] = true;
    a.grid[0][8] = true;
    a.grid[1][4] = true;
    a.grid[1][12] = true;
    for (let s = 0; s < stepsForTile(a); s += 2) a.grid[2][s] = true;

    b.grid[0][0] = true;
    b.grid[0][7] = true;
    b.grid[0][10] = true;
    b.grid[1][4] = true;
    b.grid[1][12] = true;
    for (let s = 1; s < stepsForTile(b); s += 2) b.grid[2][s] = true;

    state.tiles.push(a, b);
    state.startTileId = a.id;
    state.activeTileId = a.id;

    ensureTransitionsComplete();

    a.transitions[a.id] = 8;
    a.transitions[b.id] = 2;
    b.transitions[b.id] = 8;
    b.transitions[a.id] = 2;
  }

  function tryInitFromUrl() {
    const encoded = getEncodedFromUrl();
    if (!encoded) return false;

    try {
      state = decodeState(encoded);
      ensureTransitionsComplete();
      ensureTileGrids();
      return true;
    } catch (e) {
      console.warn('Failed to load URL state; falling back to defaults', e);
      return false;
    }
  }

  function wireEvents() {
    els.createTileBtn.addEventListener('click', addTile);
    els.copyTileBtn.addEventListener('click', copyActiveTile);
    els.renameTileBtn.addEventListener('click', renameActiveTile);
    els.deleteTileBtn.addEventListener('click', deleteActiveTile);

    if (els.loopTileBtn) {
      els.loopTileBtn.addEventListener('click', () => {
        const tile = getActiveTile();
        if (!tile) return;

        if (state.loopTileId === tile.id) {
          state.loopTileId = null;
          stopPlayback();
          renderAll();
          return;
        }

        state.loopTileId = tile.id;
        state.activeTileId = tile.id;
        if (intervalId === null) {
          startPlayback();
        } else {
          renderAll();
        }
      });
    }

    els.startTileSelect.addEventListener('change', () => {
      const id = els.startTileSelect.value;
      if (!getTile(id)) return;
      state.startTileId = id;
      renderAll();
      scheduleUrlUpdate();
    });

    els.playBtn.addEventListener('click', () => {
      state.loopTileId = null;
      startPlayback();
    });
    els.stopBtn.addEventListener('click', stopPlayback);

    els.copyShareUrlBtn.addEventListener('click', copyShareUrl);
    els.resetAllBtn.addEventListener('click', resetAll);

    els.tempoRange.addEventListener('input', () => {
      state.bpm = clampInt(els.tempoRange.value, 30, 300);
      els.tempoNumber.value = String(state.bpm);
      updatePlaybackSpeed();
      scheduleUrlUpdate();
    });

    els.tempoNumber.addEventListener('input', () => {
      state.bpm = clampInt(els.tempoNumber.value, 30, 300);
      els.tempoRange.value = String(state.bpm);
      updatePlaybackSpeed();
      scheduleUrlUpdate();
    });

    els.clearPatternBtn.addEventListener('click', clearActivePattern);
    els.randomizePatternBtn.addEventListener('click', randomizeActivePattern);

    window.addEventListener('resize', () => {
      renderChainGraph();
    });

    window.addEventListener('hashchange', () => {
      const encoded = getEncodedFromUrl();
      if (!encoded) return;
      try {
        const next = decodeState(encoded);
        stopPlayback();
        state = next;
        ensureTransitionsComplete();
        ensureTileGrids();
        renderAll();
        toast('Loaded from URL');
      } catch {
        // ignore
      }
    });
  }

  function runSelfTests() {
    try {
      /** @type {AppState} */
      const before = {
        bpm: 111,
        stepsPerBeat: 3,
        startTileId: null,
        activeTileId: null,
        loopTileId: null,
        tracks: createDefaultTracks(),
        tiles: [],
      };

      const prevState = state;
      state = before;

      state.tiles.push(createTile('X', 3), createTile('Y', 5));
      state.startTileId = state.tiles[0].id;
      state.activeTileId = state.tiles[0].id;

      state.tiles[0].drones = [
        normalizeDroneSettings({ enabled: true, waveform: 'triangle', midi: 50, volume: 0.12 }),
        normalizeDroneSettings({ enabled: true, waveform: 'sine', midi: 62, volume: 0.06 }),
      ];
      state.tiles[1].drones = [normalizeDroneSettings({ enabled: true, waveform: 'sawtooth', midi: 55, volume: 0.2 })];

      state.tiles[0].grid[0][0] = true;
      state.tiles[1].grid[2][3] = true;
      state.tiles[0].transitions[state.tiles[0].id] = 7;
      state.tiles[0].transitions[state.tiles[1].id] = 3;
      state.tiles[1].transitions[state.tiles[0].id] = 2;
      state.tiles[1].transitions[state.tiles[1].id] = 8;

      ensureTransitionsComplete();
      ensureTileGrids();
      const encoded = encodeState();
      const after = decodeState(encoded);

      console.assert(after.tiles.length === 2, 'decode tile count');
      console.assert(after.bpm === 111, 'decode bpm');
      console.assert(after.stepsPerBeat === 3, 'decode stepsPerBeat');
      console.assert(after.tiles[0].beats === 3, 'decode beats');
      console.assert(after.tiles[1].beats === 5, 'decode beats');

      console.assert(after.tiles[0].drones.length === 2, 'decode drone count');
      console.assert(after.tiles[0].drones[0].enabled === true, 'decode drone enabled');
      console.assert(after.tiles[0].drones[0].waveform === 'triangle', 'decode drone waveform');
      console.assert(after.tiles[0].drones[0].midi === 50, 'decode drone midi');
      console.assert(after.tiles[0].drones[1].midi === 62, 'decode 2nd drone midi');
      console.assert(after.tiles[1].drones[0].waveform === 'sawtooth', 'decode drone waveform');
      console.assert(after.tiles[1].drones[0].midi === 55, 'decode drone midi');

      console.assert(after.tiles[0].grid[0][0] === true, 'grid bit preserved');
      console.assert(after.tiles[1].grid[2][3] === true, 'grid bit preserved');
      console.assert(after.tracks.length === state.tracks.length, 'decode track count');

      state = prevState;

      console.log('[SelfTest] encode/decode OK');
    } catch (e) {
      console.warn('[SelfTest] failed', e);
    }
  }

  function main() {
    mountGridUI();

    const loaded = tryInitFromUrl();
    if (!loaded) initDefaultState();

    wireEvents();

    setPlayingUI(false);
    renderAll();
    scheduleUrlUpdate();

    runSelfTests();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();