'use strict';

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

function tick() {
  const tile = getActiveTile();
  if (!tile) return;

  const steps = stepsForTile(tile);
  const current = stepIndex % steps;

  const audioCtx = getAudioCtx();
  if (audioCtx) {
    const t = audioCtx.currentTime + 0.01;
    playStep(tile, current, t);
  }

  const next = (current + 1) % steps;
  updatePlayheadClasses(current, next);
  setStepIndex(next);

  if (next === 0) {
    TileMarkov.onLoopComplete();
  }
}

async function startPlayback() {
  if (intervalId !== null) return;

  const requestId = bumpPlaybackRequestId();

  ensureAudio();
  const audioCtx = getAudioCtx();
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

  resetStepIndex();

  const stepMs = () => (60_000 / state.bpm) / getStepsPerBeat();
  setIntervalId(window.setInterval(tick, stepMs()));

  renderAll();
  setPlayingUI(true);
  syncDronePlayback();
}

function stopPlayback() {
  bumpPlaybackRequestId();
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    setIntervalId(null);
  }

  syncDronePlayback();
  setPlayingUI(false);

  renderGrid();
}

function updatePlaybackSpeed() {
  if (intervalId === null) return;
  window.clearInterval(intervalId);
  setIntervalId(window.setInterval(tick, (60_000 / state.bpm) / getStepsPerBeat()));
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
