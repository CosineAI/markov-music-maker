'use strict';

let gridContainer = null;

function mountGridUI() {
  if (!els) return;

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

  const steps = stepsForTile(tile);
  const stepsPerBeat = getStepsPerBeat();

  const gridEl = document.createElement('div');
  gridEl.className = 'seq-grid';
  gridEl.style.setProperty('--seq-steps', String(steps));

  const header = document.createElement('div');
  header.className = 'seq-header';
  header.textContent = 'Track';
  gridEl.appendChild(header);

  for (let s = 0; s < steps; s++) {
    const stepLabel = document.createElement('div');
    stepLabel.className = 'seq-step-label';
    stepLabel.textContent = String(s + 1);
    gridEl.appendChild(stepLabel);
  }

  const playheadStep = intervalId !== null ? stepIndex % steps : null;

  for (let r = 0; r < state.tracks.length; r++) {
    const label = document.createElement('div');
    label.className = 'seq-track-label';
    label.textContent = state.tracks[r].label;
    gridEl.appendChild(label);

    for (let s = 0; s < steps; s++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seq-cell';
      btn.dataset.row = String(r);
      btn.dataset.step = String(s);

      if (tile.grid[r][s]) btn.classList.add('is-active');
      if (playheadStep !== null && s === playheadStep) btn.classList.add('is-playhead');
      if (stepsPerBeat > 1 && s % stepsPerBeat === 0) btn.classList.add('is-downbeat');

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
