'use strict';

function runSelfTests() {
  try {
    /** @type {import('./state.js').AppState} */
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
    setState(before);

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

    setState(prevState);

    console.log('[SelfTest] encode/decode OK');
  } catch (e) {
    console.warn('[SelfTest] failed', e);
  }
}

function main() {
  initEls();
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
