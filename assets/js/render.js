'use strict';

function renderAll() {
  if (!els) return;

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
