'use strict';

function renderTileSettings() {
  const tile = getActiveTile();
  if (!tile || !els) return;

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
      setStepIndex(stepIndex % stepsForTile(t));
      updatePlaybackSpeed();
    }

    renderGrid();
    scheduleUrlUpdate();
  });
}
