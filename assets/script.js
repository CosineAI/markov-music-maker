(() => {
  'use strict';

  const DEFAULT_STEPS = 16;

  const DRUM_TRACKS = [
    { id: 'kick', label: 'Kick', kind: 'drum', drum: 'kick' },
    { id: 'snare', label: 'Snare', kind: 'drum', drum: 'snare' },
    { id: 'hat', label: 'Hat', kind: 'drum', drum: 'hat' },
  ];

  const NOTE_OPTIONS = [
    { name: 'C2', freq: 65.41 },
    { name: 'D2', freq: 73.42 },
    { name: 'E2', freq: 82.41 },
    { name: 'G2', freq: 98.0 },
    { name: 'A2', freq: 110.0 },
    { name: 'C3', freq: 130.81 },
    { name: 'D3', freq: 146.83 },
    { name: 'E3', freq: 164.81 },
    { name: 'G3', freq: 196.0 },
    { name: 'A3', freq: 220.0 },
    { name: 'C4', freq: 261.63 },
    { name: 'D4', freq: 293.66 },
    { name: 'E4', freq: 329.63 },
    { name: 'G4', freq: 392.0 },
    { name: 'A4', freq: 440.0 },
    { name: 'C5', freq: 523.25 },
    { name: 'D5', freq: 587.33 },
    { name: 'E5', freq: 659.25 },
    { name: 'G5', freq: 783.99 },
    { name: 'A5', freq: 880.0 },
  ];

  const WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'];
  const DEFAULT_NOTE_CHANNELS = ['C4', 'D4', 'E4', 'G4', 'A4'];

  /** @type {null | AudioContext} */
  let audioCtx = null;
  /** @type {null | GainNode} */
  let masterGain = null;
  /** @type {null | AudioBuffer} */
  let noiseBuffer = null;

  /** @type {number | null} */
  let intervalId = null;
  let stepIndex = 0;
  let playbackRequestId = 0;

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

    gridMount: /** @type {HTMLElement} */ (document.getElementById('grid-mount')),
    transitionsTitle: /** @type {HTMLElement} */ (document.getElementById('transitions-title')),
    transitionsList: /** @type {HTMLElement} */ (document.getElementById('transitions-list')),

    tileStepsInput: /** @type {HTMLInputElement} */ (document.getElementById('tile-steps')),
    addChannelBtn: /** @type {HTMLButtonElement} */ (document.getElementById('add-channel')),
    channelsList: /** @type {HTMLElement} */ (document.getElementById('channels-list')),
    droneEnabled: /** @type {HTMLInputElement} */ (document.getElementById('drone-enabled')),
    droneNote: /** @type {HTMLSelectElement} */ (document.getElementById('drone-note')),
    droneWaveform: /** @type {HTMLSelectElement} */ (document.getElementById('drone-waveform')),

    loopTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('loop-tile')),
    chainGraph: /** @type {HTMLElement} */ (document.getElementById('chain-graph')),
    chainCanvas: /** @type {HTMLCanvasElement} */ (document.getElementById('chain-canvas')),
    chainNodes: /** @type {HTMLElement} */ (document.getElementById('chain-nodes')),
  };

  /**
   * @typedef TileChannel
   * @property {string} id
   * @property {string} note
   * @property {string} waveform
   */

  /**
   * @typedef Tile
   * @property {string} id
   * @property {string} name
   * @property {number} steps
   * @property {TileChannel[]} channels
   * @property {{enabled: boolean, note: string, waveform: string}} drone
   * @property {boolean[][]} grid
   * @property {Record<string, number>} transitions
   */

  /**
   * @typedef AppState
   * @property {number} bpm
   * @property {string | null} startTileId
   * @property {string | null} activeTileId
   * @property {string | null} loopTileId
   * @property {Tile[]} tiles
   */

  /** @type {AppState} */
  let state = {
    bpm: 120,
    startTileId: null,
    activeTileId: null,
    loopTileId: null,
    tiles: [],
  };

  // --------------------- Utils ---------------------

  function clampInt(n, min, max) {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, x));
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `t_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function noteToFreq(note) {
    return NOTE_OPTIONS.find((n) => n.name === note)?.freq ?? 440;
  }

  function createNoteChannel(note = 'C4', waveform = 'square') {
    return { id: uuid(), note, waveform };
  }

  function createEmptyGrid(steps, rowCount) {
    return Array.from({ length: rowCount }, () => Array.from({ length: steps }, () => false));
  }

  function getTileTracks(tile) {
    const noteTracks = tile.channels.map((channel) => ({
      id: channel.id,
      label: channel.note,
      kind: 'note',
      freq: noteToFreq(channel.note),
      waveform: channel.waveform,
    }));
    return [...DRUM_TRACKS, ...noteTracks];
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

  function createTile(name) {
    const channels = DEFAULT_NOTE_CHANNELS.map((note) => createNoteChannel(note, 'square'));
    const rowCount = DRUM_TRACKS.length + channels.length;

    /** @type {Tile} */
    const tile = {
      id: uuid(),
      name,
      steps: DEFAULT_STEPS,
      channels,
      drone: { enabled: false, note: 'C3', waveform: 'sine' },
      grid: createEmptyGrid(DEFAULT_STEPS, rowCount),
      transitions: {},
    };
    return tile;
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

  function playNote(freq, t, waveform) {
    if (!audioCtx || !masterGain) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = waveform;
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    // soften with filter
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.max(1200, freq * 4), t);

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  function playStep(tile, step, t) {
    const tracks = getTileTracks(tile);
    for (let r = 0; r < tracks.length; r++) {
      if (!tile.grid[r]?.[step]) continue;

      const tr = tracks[r];
      if (tr.kind === 'drum') {
        if (tr.drum === 'kick') playKick(t);
        else if (tr.drum === 'snare') playSnare(t);
        else if (tr.drum === 'hat') playHat(t);
      } else {
        playNote(tr.freq, t, tr.waveform);
      }
    }
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

    const tracks = getTileTracks(tile);

    const gridEl = document.createElement('div');
    gridEl.className = 'seq-grid';
    gridEl.style.gridTemplateColumns = `150px repeat(${tile.steps}, 1fr)`;

    // header row
    const header = document.createElement('div');
    header.className = 'seq-header';
    header.textContent = 'Track';
    gridEl.appendChild(header);

    for (let s = 0; s < tile.steps; s++) {
      const stepLabel = document.createElement('div');
      stepLabel.className = 'seq-step-label';
      stepLabel.textContent = String(s + 1);
      gridEl.appendChild(stepLabel);
    }

    // rows
    for (let r = 0; r < tracks.length; r++) {
      const label = document.createElement('div');
      label.className = 'seq-track-label';
      label.textContent = tracks[r].label;
      gridEl.appendChild(label);

      for (let s = 0; s < tile.steps; s++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'seq-cell';
        btn.dataset.row = String(r);
        btn.dataset.step = String(s);

        if (tile.grid[r]?.[s]) btn.classList.add('is-active');
        if (s === stepIndex && intervalId !== null) btn.classList.add('is-playhead');
        if (s % 4 === 0) btn.classList.add('is-downbeat');

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
        els.loopTileBtn.textContent = 'Play tile';
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
    if (stepIndex >= tile.steps) stepIndex = 0;

    // If the user changes the tile while playing, keep the step index but re-render.
    if (!opts.skipRender) {
      renderAll();
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

  function renderTileControls() {
    const tile = getActiveTile();
    if (!tile) {
      if (els.tileStepsInput) els.tileStepsInput.value = '';
      if (els.addChannelBtn) els.addChannelBtn.disabled = true;
      if (els.channelsList) els.channelsList.replaceChildren();
      if (els.droneEnabled) els.droneEnabled.checked = false;
      if (els.droneNote) els.droneNote.replaceChildren();
      if (els.droneWaveform) els.droneWaveform.replaceChildren();
      return;
    }

    if (els.tileStepsInput) {
      els.tileStepsInput.value = String(tile.steps);
    }

    if (els.droneEnabled) els.droneEnabled.checked = tile.drone.enabled;

    if (els.droneNote) {
      els.droneNote.replaceChildren();
      for (const note of NOTE_OPTIONS) {
        const opt = document.createElement('option');
        opt.value = note.name;
        opt.textContent = note.name;
        if (note.name === tile.drone.note) opt.selected = true;
        els.droneNote.appendChild(opt);
      }
    }

    if (els.droneWaveform) {
      els.droneWaveform.replaceChildren();
      for (const wf of WAVEFORMS) {
        const opt = document.createElement('option');
        opt.value = wf;
        opt.textContent = wf;
        if (wf === tile.drone.waveform) opt.selected = true;
        els.droneWaveform.appendChild(opt);
      }
    }

    renderChannelsList(tile);
  }

  function renderChannelsList(tile) {
    if (!els.channelsList) return;
    els.channelsList.replaceChildren();

    tile.channels.forEach((channel, index) => {
      const row = document.createElement('div');
      row.className = 'channel-row';

      const label = document.createElement('div');
      label.className = 'channel-row__label';

      const title = document.createElement('div');
      title.textContent = `Channel ${index + 1}`;
      title.style.fontWeight = '650';

      const meta = document.createElement('div');
      meta.className = 'small muted';
      meta.textContent = `Row ${DRUM_TRACKS.length + index + 1}`;

      label.appendChild(title);
      label.appendChild(meta);

      const noteSelect = document.createElement('select');
      noteSelect.className = 'select';
      for (const note of NOTE_OPTIONS) {
        const opt = document.createElement('option');
        opt.value = note.name;
        opt.textContent = note.name;
        if (note.name === channel.note) opt.selected = true;
        noteSelect.appendChild(opt);
      }

      noteSelect.addEventListener('change', () => {
        channel.note = noteSelect.value;
        renderGrid();
        renderChainGraph();
        scheduleUrlUpdate();
      });

      const waveSelect = document.createElement('select');
      waveSelect.className = 'select';
      for (const wf of WAVEFORMS) {
        const opt = document.createElement('option');
        opt.value = wf;
        opt.textContent = wf;
        if (wf === channel.waveform) opt.selected = true;
        waveSelect.appendChild(opt);
      }

      waveSelect.addEventListener('change', () => {
        channel.waveform = waveSelect.value;
        scheduleUrlUpdate();
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn danger';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        tile.channels.splice(index, 1);
        const rowIndex = DRUM_TRACKS.length + index;
        tile.grid.splice(rowIndex, 1);
        if (tile.grid.length === 0) {
          tile.grid = createEmptyGrid(tile.steps, DRUM_TRACKS.length);
        }
        renderAll();
        scheduleUrlUpdate();
      });

      row.appendChild(label);
      row.appendChild(noteSelect);
      row.appendChild(waveSelect);
      row.appendChild(removeBtn);

      els.channelsList.appendChild(row);
    });

    if (els.addChannelBtn) {
      els.addChannelBtn.disabled = false;
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
          const loopRadius = Math.min(radius * 1.1, maxArc - 6);
          const loopCenterX = fromPos.x + radius * 0.9;
          const loopCenterY = Math.max(paddingY + loopRadius + 6, centerY - loopRadius - radius * 0.6);
          const startAngle = Math.PI * 0.2;
          const endAngle = Math.PI * 1.85;

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
          ctx.fillText(String(weight), loopCenterX, loopCenterY - loopRadius - 10);
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

    const steps = tile.steps;
    if (stepIndex >= steps) stepIndex = 0;
    const current = stepIndex;

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

    // Always start from the start tile when you press Play
    const startId = state.loopTileId || state.startTileId || state.tiles[0]?.id || null;
    if (startId) {
      if (!state.startTileId) state.startTileId = startId;
      state.activeTileId = startId;
    }

    stepIndex = 0;

    const stepMs = () => (60_000 / state.bpm) / 4;
    intervalId = window.setInterval(tick, stepMs());

    renderAll();
    setPlayingUI(true);
  }

  function stopPlayback() {
    playbackRequestId += 1;
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    stopDrone();
    setPlayingUI(false);

    // Clear playhead highlight
    renderGrid();
  }

  function updatePlaybackSpeed() {
    if (intervalId === null) return;
    // restart interval with new BPM
    window.clearInterval(intervalId);
    intervalId = window.setInterval(tick, (60_000 / state.bpm) / 4);
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

  // expose for debugging / requirement
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

  function gridToBytes(grid) {
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    const bitCount = rows * cols;
    const bytes = new Uint8Array(Math.ceil(bitCount / 8));
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let s = 0; s < cols; s++) {
        if (grid[r][s]) bytes[k >> 3] |= 1 << (k & 7);
        k++;
      }
    }
    return bytes;
  }

  function bytesToGrid(bytes, rows, cols) {
    const grid = createEmptyGrid(cols, rows);
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let s = 0; s < cols; s++) {
        const on = (bytes[k >> 3] & (1 << (k & 7))) !== 0;
        grid[r][s] = on;
        k++;
      }
    }
    return grid;
  }

  function encodeState() {
    // v2 binary format:
    // [u8 version=2]
    // [u16 bpm]
    // [u16 startIndex or 0xFFFF]
    // [u16 tileCount]
    // for each tile:
    // [u8 nameLen][nameBytes]
    // [u8 steps][u8 channelCount]
    // for each channel: [u8 noteIndex][u8 waveformIndex]
    // [u8 droneEnabled][u8 droneNoteIndex][u8 droneWaveformIndex]
    // [gridBytes]
    // transitions matrix: tileCount * tileCount * u16 weight

    ensureTransitionsComplete();

    const w = new ByteWriter();
    const enc = new TextEncoder();

    w.u8(2);
    w.u16(clampInt(state.bpm, 30, 300));

    const tileCount = state.tiles.length;
    const startIndex = state.startTileId
      ? state.tiles.findIndex((t) => t.id === state.startTileId)
      : -1;
    w.u16(startIndex >= 0 ? startIndex : 0xffff);
    w.u16(tileCount);

    for (const t of state.tiles) {
      const nameBytes = enc.encode(t.name);
      const trimmed = nameBytes.length > 80 ? nameBytes.slice(0, 80) : nameBytes;
      w.u8(trimmed.length);
      w.bytes(trimmed);

      const steps = clampInt(t.steps, 4, 64);
      const channelCount = t.channels.length;
      w.u8(steps);
      w.u8(channelCount);

      for (const ch of t.channels) {
        const noteIndex = Math.max(0, NOTE_OPTIONS.findIndex((n) => n.name === ch.note));
        const waveIndex = Math.max(0, WAVEFORMS.indexOf(ch.waveform));
        w.u8(noteIndex);
        w.u8(waveIndex);
      }

      w.u8(t.drone.enabled ? 1 : 0);
      w.u8(Math.max(0, NOTE_OPTIONS.findIndex((n) => n.name === t.drone.note)));
      w.u8(Math.max(0, WAVEFORMS.indexOf(t.drone.waveform)));

      const gridBytes = gridToBytes(t.grid);
      w.bytes(gridBytes);
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

  function decodeState(encoded) {
    const bytes = fromBase64Url(encoded);
    const r = new ByteReader(bytes);
    const dec = new TextDecoder();

    const version = r.u8();

    if (version === 1) {
      const bpm = r.u16();
      const startIndex = r.u16();
      const tileCount = r.u16();

      if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

      const rowCount = DRUM_TRACKS.length + DEFAULT_NOTE_CHANNELS.length;
      const gridByteLen = Math.ceil((rowCount * DEFAULT_STEPS) / 8);

      /** @type {Tile[]} */
      const tiles = [];

      for (let i = 0; i < tileCount; i++) {
        const nameLen = r.u8();
        const nameBytes = r.take(nameLen);
        const name = dec.decode(nameBytes) || `Tile ${i + 1}`;
        const gridBytes = r.take(gridByteLen);

        const channels = DEFAULT_NOTE_CHANNELS.map((note) => createNoteChannel(note, 'square'));

        tiles.push({
          id: uuid(),
          name,
          steps: DEFAULT_STEPS,
          channels,
          drone: { enabled: false, note: 'C3', waveform: 'sine' },
          grid: bytesToGrid(gridBytes, rowCount, DEFAULT_STEPS),
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
        startTileId: startId,
        activeTileId: startId,
        loopTileId: null,
        tiles,
      };
    }

    if (version !== 2) throw new Error(`Unsupported version ${version}`);

    const bpm = r.u16();
    const startIndex = r.u16();
    const tileCount = r.u16();

    if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

    /** @type {Tile[]} */
    const tiles = [];

    for (let i = 0; i < tileCount; i++) {
      const nameLen = r.u8();
      const nameBytes = r.take(nameLen);
      const name = dec.decode(nameBytes) || `Tile ${i + 1}`;

      const steps = r.u8();
      const channelCount = r.u8();
      const channels = [];
      for (let c = 0; c < channelCount; c++) {
        const noteIndex = r.u8();
        const waveIndex = r.u8();
        const note = NOTE_OPTIONS[noteIndex]?.name ?? 'C4';
        const waveform = WAVEFORMS[waveIndex] ?? 'square';
        channels.push(createNoteChannel(note, waveform));
      }

      const droneEnabled = r.u8() === 1;
      const droneNoteIndex = r.u8();
      const droneWaveIndex = r.u8();
      const drone = {
        enabled: droneEnabled,
        note: NOTE_OPTIONS[droneNoteIndex]?.name ?? 'C3',
        waveform: WAVEFORMS[droneWaveIndex] ?? 'sine',
      };

      const rowCount = DRUM_TRACKS.length + channels.length;
      const gridByteLen = Math.ceil((rowCount * steps) / 8);
      const gridBytes = r.take(gridByteLen);

      tiles.push({
        id: uuid(),
        name,
        steps,
        channels,
        drone,
        grid: bytesToGrid(gridBytes, rowCount, steps),
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
      startTileId: startId,
      activeTileId: startId,
      loopTileId: null,
      tiles,
    };
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
      // fallback
      prompt('Copy this URL', url);
    }
  }

  // --------------------- Actions ---------------------

  function addTile() {
    const tile = createTile(`Tile ${state.tiles.length + 1}`);
    state.tiles.push(tile);

    // Selecting the newly created tile makes it immediately editable.
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

    const copy = createTile(name);
    copy.steps = tile.steps;
    copy.channels = tile.channels.map((ch) => ({ id: uuid(), note: ch.note, waveform: ch.waveform }));
    copy.drone = { ...tile.drone };
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
    const rows = DRUM_TRACKS.length + tile.channels.length;
    tile.grid = createEmptyGrid(tile.steps, rows);
    renderGrid();
    scheduleUrlUpdate();
  }

  function randomizeActivePattern() {
    const tile = getActiveTile();
    if (!tile) return;

    const tracks = getTileTracks(tile);
    const next = createEmptyGrid(tile.steps, tracks.length);
    for (let r = 0; r < tracks.length; r++) {
      const tr = tracks[r];
      const p = tr.kind === 'drum' ? 0.22 : 0.12;
      for (let s = 0; s < tile.steps; s++) {
        const downbeatBoost = s % 4 === 0 ? 1.35 : 1.0;
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

    renderTilesList();
    renderStartTileSelect();
    renderActiveTileHeader();
    renderTileControls();
    renderTransitions();
    renderChainNodes();
    renderChainGraph();
    renderGrid();
    renderPlaybackStatus();
    updateDroneState();

    // sync tempo inputs
    els.tempoRange.value = String(state.bpm);
    els.tempoNumber.value = String(state.bpm);
  }

  // --------------------- Init ---------------------

  function initDefaultState() {
    state = {
      bpm: 120,
      startTileId: null,
      activeTileId: null,
      loopTileId: null,
      tiles: [],
    };

    // Default: 2 tiles with sensible self-loops
    const a = createTile('Tile A');
    const b = createTile('Tile B');

    // simple beat in A
    a.grid[0][0] = true;
    a.grid[0][8] = true;
    a.grid[1][4] = true;
    a.grid[1][12] = true;
    for (let s = 0; s < a.steps; s += 2) a.grid[2][s] = true;

    // variation in B
    b.grid[0][0] = true;
    b.grid[0][7] = true;
    b.grid[0][10] = true;
    b.grid[1][4] = true;
    b.grid[1][12] = true;
    for (let s = 1; s < b.steps; s += 2) b.grid[2][s] = true;

    state.tiles.push(a, b);
    state.startTileId = a.id;
    state.activeTileId = a.id;

    ensureTransitionsComplete();

    // defaults: mostly stay, sometimes switch
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

    if (els.tileStepsInput) {
      els.tileStepsInput.addEventListener('change', () => {
        const tile = getActiveTile();
        if (!tile) return;
        const nextSteps = clampInt(els.tileStepsInput.value, 4, 64);
        if (nextSteps === tile.steps) return;

        const rows = DRUM_TRACKS.length + tile.channels.length;
        const nextGrid = createEmptyGrid(nextSteps, rows);
        for (let r = 0; r < rows; r++) {
          for (let s = 0; s < Math.min(tile.steps, nextSteps); s++) {
            nextGrid[r][s] = tile.grid[r]?.[s] ?? false;
          }
        }

        tile.steps = nextSteps;
        tile.grid = nextGrid;
        stepIndex = 0;

        renderAll();
        scheduleUrlUpdate();
      });
    }

    if (els.addChannelBtn) {
      els.addChannelBtn.addEventListener('click', () => {
        const tile = getActiveTile();
        if (!tile) return;
        tile.channels.push(createNoteChannel('C4', 'square'));
        tile.grid.push(Array.from({ length: tile.steps }, () => false));
        renderAll();
        scheduleUrlUpdate();
      });
    }

    if (els.droneEnabled) {
      els.droneEnabled.addEventListener('change', () => {
        const tile = getActiveTile();
        if (!tile) return;
        tile.drone.enabled = els.droneEnabled.checked;
        updateDroneState();
        scheduleUrlUpdate();
      });
    }

    if (els.droneNote) {
      els.droneNote.addEventListener('change', () => {
        const tile = getActiveTile();
        if (!tile) return;
        tile.drone.note = els.droneNote.value;
        updateDroneState();
        scheduleUrlUpdate();
      });
    }

    if (els.droneWaveform) {
      els.droneWaveform.addEventListener('change', () => {
        const tile = getActiveTile();
        if (!tile) return;
        tile.drone.waveform = els.droneWaveform.value;
        updateDroneState();
        scheduleUrlUpdate();
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
      // If user pastes a new URL hash, attempt load.
      const encoded = getEncodedFromUrl();
      if (!encoded) return;
      try {
        const next = decodeState(encoded);
        stopPlayback();
        state = next;
        renderAll();
        toast('Loaded from URL');
      } catch {
        // ignore
      }
    });
  }

  function runSelfTests() {
    try {
      const before = {
        bpm: 111,
        startTileId: null,
        activeTileId: null,
        loopTileId: null,
        tiles: [createTile('X'), createTile('Y')],
      };
      before.startTileId = before.tiles[0].id;
      before.activeTileId = before.tiles[0].id;
      before.tiles[0].steps = 12;
      before.tiles[0].channels = [createNoteChannel('C4', 'sine')];
      before.tiles[0].grid = createEmptyGrid(12, DRUM_TRACKS.length + 1);

      // seed random pattern
      before.tiles[0].grid[0][0] = true;
      before.tiles[1].grid[2][3] = true;
      before.tiles[0].transitions[before.tiles[0].id] = 7;
      before.tiles[0].transitions[before.tiles[1].id] = 3;
      before.tiles[1].transitions[before.tiles[0].id] = 2;
      before.tiles[1].transitions[before.tiles[1].id] = 8;

      const prevState = state;
      state = before;
      ensureTransitionsComplete();
      const encoded = encodeState();
      const after = decodeState(encoded);

      console.assert(after.tiles.length === 2, 'decode tile count');
      console.assert(after.bpm === 111, 'decode bpm');
      console.assert(after.tiles[0].steps === 12, 'steps preserved');
      console.assert(after.tiles[0].grid[0][0] === true, 'grid bit preserved');

      state = prevState;

      console.log('[SelfTest] encode/decode OK');
    } catch (e) {
      console.warn('[SelfTest] failed', e);
    }
  }

  let droneOsc = null;
  let droneGain = null;
  let droneState = null;

  function stopDrone() {
    if (droneOsc) {
      droneOsc.stop();
      droneOsc.disconnect();
      droneOsc = null;
    }
    if (droneGain) {
      droneGain.disconnect();
      droneGain = null;
    }
    droneState = null;
  }

  function updateDroneState() {
    const tile = getActiveTile();
    if (intervalId === null || !tile || !tile.drone.enabled) {
      stopDrone();
      return;
    }

    const nextState = {
      tileId: tile.id,
      note: tile.drone.note,
      waveform: tile.drone.waveform,
    };

    if (
      droneState &&
      droneState.tileId === nextState.tileId &&
      droneState.note === nextState.note &&
      droneState.waveform === nextState.waveform
    ) {
      return;
    }

    stopDrone();
    ensureAudio();
    if (!audioCtx || !masterGain) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = nextState.waveform;
    osc.frequency.setValueAtTime(noteToFreq(nextState.note), audioCtx.currentTime);
    gain.gain.value = 0.18;

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();

    droneOsc = osc;
    droneGain = gain;
    droneState = nextState;
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