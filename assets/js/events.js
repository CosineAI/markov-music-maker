'use strict';

function wireEvents() {
  if (!els) return;

  els.createTileBtn.addEventListener('click', addTile);
  els.copyTileBtn.addEventListener('click', copyActiveTile);
  els.renameTileBtn.addEventListener('click', renameActiveTile);
  els.deleteTileBtn.addEventListener('click', deleteActiveTile);

  if (els.loopTileBtn) {
    els.loopTileBtn.addEventListener('click', () => {
      const tile = getTile(state.activeTileId || '');
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
      setState(next);
      ensureTransitionsComplete();
      ensureTileGrids();
      renderAll();
      toast('Loaded from URL');
    } catch {
      // ignore
    }
  });

}
