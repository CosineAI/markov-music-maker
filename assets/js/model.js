'use strict';

/** @returns {Track[]} */
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

/** @param {Tile} tile */
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

/** @param {string} tileId */
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

/**
 * @param {Tile} tile
 * @param {number} beats
 */
function setTileBeats(tile, beats) {
  tile.beats = clampInt(beats, 1, MAX_BEATS_PER_TILE);
  tile.grid = resizeGrid(tile.grid, state.tracks.length, stepsForTile(tile));
  if (intervalId !== null) {
    setStepIndex(stepIndex % stepsForTile(tile));
  }
}


