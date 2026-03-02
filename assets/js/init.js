'use strict';

function initDefaultState() {
  setState({
    bpm: 120,
    stepsPerBeat: DEFAULT_STEPS_PER_BEAT,
    startTileId: null,
    activeTileId: null,
    loopTileId: null,
    tracks: createDefaultTracks(),
    tiles: [],
  });

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
    const next = decodeState(encoded);
    setState(next);
    ensureTransitionsComplete();
    ensureTileGrids();
    return true;
  } catch (e) {
    console.warn('Failed to load URL state; falling back to defaults', e);
    return false;
  }
}
