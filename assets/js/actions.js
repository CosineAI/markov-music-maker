'use strict';

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

/** @param {string} trackId */
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

/** @param {number} index */
function removeDroneFromActiveTile(index) {
  const tile = getActiveTile();
  if (!tile) return;

  tile.drones = normalizeDroneList(tile.drones, null);
  tile.drones.splice(index, 1);

  renderAll();
  scheduleUrlUpdate();
}

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
