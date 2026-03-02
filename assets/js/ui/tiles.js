'use strict';

function renderTilesList() {
  if (!els) return;
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
  if (!els) return;
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
  if (!els) return;
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
    setStepIndex(stepIndex % stepsForTile(tile));
  }

  if (!opts.skipRender) {
    renderAll();
  } else {
    syncDronePlayback();
  }

  scheduleUrlUpdate();
}
