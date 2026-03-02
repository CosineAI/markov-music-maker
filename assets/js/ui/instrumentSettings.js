'use strict';

function renderInstrumentSettings() {
  if (!els) return;

  const tile = getActiveTile();
  const droneDisabledAttr = tile ? '' : 'disabled';

  const drones = tile ? normalizeDroneList(tile.drones, null) : [];

  const droneRows = drones
    .map((d, idx) => {
      const noteOptions = NOTE_CHOICES.map((n) => {
        const selected = n.midi === d.midi ? 'selected' : '';
        return `<option value="${n.midi}" ${selected}>${n.name}</option>`;
      }).join('');

      const waveOptions = WAVEFORMS.map((w) => {
        const selected = w === d.waveform ? 'selected' : '';
        return `<option value="${w}" ${selected}>${w}</option>`;
      }).join('');

      return `
        <div class="drone-row" data-drone-index="${idx}">
          <label class="drone-row__label">
            <span>Enabled</span>
            <select class="select js-drone-enabled" ${droneDisabledAttr}>
              <option value="0" ${d.enabled ? '' : 'selected'}>Off</option>
              <option value="1" ${d.enabled ? 'selected' : ''}>On</option>
            </select>
          </label>
          <label class="drone-row__label">
            <span>Note</span>
            <select class="select js-drone-note" ${droneDisabledAttr}>${noteOptions}</select>
          </label>
          <label class="drone-row__label">
            <span>Wave</span>
            <select class="select js-drone-wave" ${droneDisabledAttr}>${waveOptions}</select>
          </label>
          <label class="drone-row__label">
            <span>Volume</span>
            <input class="input js-drone-vol" type="number" min="0" max="100" step="1" value="${Math.round(d.volume * 100)}" ${droneDisabledAttr} />
          </label>
          <button class="btn danger js-drone-remove" type="button" ${droneDisabledAttr}>Remove</button>
        </div>
      `;
    })
    .join('');

  const dronesBody = droneRows ? `<div class="rows">${droneRows}</div>` : '<div class="small muted">No drones.</div>';

  const noteRows = state.tracks
    .filter((t) => t.kind === 'note')
    .map((t) => {
      const noteOptions = NOTE_CHOICES.map((n) => {
        const selected = n.midi === t.midi ? 'selected' : '';
        return `<option value="${n.midi}" ${selected}>${n.name}</option>`;
      }).join('');

      const waveOptions = WAVEFORMS.map((w) => {
        const selected = w === t.waveform ? 'selected' : '';
        return `<option value="${w}" ${selected}>${w}</option>`;
      }).join('');

      return `
        <div class="channel-row" data-track-id="${t.id}">
          <label class="channel-row__label">
            <span>Name</span>
            <input class="input js-track-name" type="text" value="${escapeHtml(t.label)}" />
          </label>
          <label class="channel-row__label">
            <span>Note</span>
            <select class="select js-track-note">${noteOptions}</select>
          </label>
          <label class="channel-row__label">
            <span>Wave</span>
            <select class="select js-track-wave">${waveOptions}</select>
          </label>
          <button class="btn danger js-track-remove" type="button">Remove</button>
        </div>
      `;
    })
    .join('');

  const notesBody = noteRows ? `<div class="rows">${noteRows}</div>` : '<div class="small muted">No note channels.</div>';

  const dronesOpenAttr = ui.dronesOpen ? 'open' : '';
  const notesOpenAttr = ui.notesOpen ? 'open' : '';

  els.instrumentSettings.innerHTML = `
    <details id="dronesDetails" class="subsection subsection--collapsible" ${dronesOpenAttr}>
      <summary class="subsection__title">Drones (per tile)</summary>
      <div class="subsection__content">
        ${tile ? '' : '<div class="small muted">Select a tile to edit drone settings.</div>'}
        ${dronesBody}
        <div>
          <button id="addDrone" class="btn primary" type="button" ${droneDisabledAttr}>+ Add drone</button>
        </div>
      </div>
    </details>

    <details id="notesDetails" class="subsection subsection--collapsible" ${notesOpenAttr}>
      <summary class="subsection__title">Note channels</summary>
      <div class="subsection__content">
        ${notesBody}
        <div>
          <button id="addNoteChannel" class="btn primary" type="button">+ Add note channel</button>
        </div>
      </div>
    </details>
  `;

  const dronesDetails = /** @type {HTMLDetailsElement | null} */ (els.instrumentSettings.querySelector('#dronesDetails'));
  dronesDetails?.addEventListener('toggle', () => {
    ui.dronesOpen = Boolean(dronesDetails.open);
  });

  const notesDetails = /** @type {HTMLDetailsElement | null} */ (els.instrumentSettings.querySelector('#notesDetails'));
  notesDetails?.addEventListener('toggle', () => {
    ui.notesOpen = Boolean(notesDetails.open);
  });

  const addDroneBtn = /** @type {HTMLButtonElement | null} */ (els.instrumentSettings.querySelector('#addDrone'));
  addDroneBtn?.addEventListener('click', addDroneToActiveTile);

  const addBtn = /** @type {HTMLButtonElement | null} */ (els.instrumentSettings.querySelector('#addNoteChannel'));
  addBtn?.addEventListener('click', addNoteChannel);

  const droneEls = els.instrumentSettings.querySelectorAll('.drone-row');
  droneEls.forEach((row) => {
    const idx = clampInt(row.getAttribute('data-drone-index'), 0, 255);

    const enabledSel = /** @type {HTMLSelectElement | null} */ (row.querySelector('.js-drone-enabled'));
    const noteSel = /** @type {HTMLSelectElement | null} */ (row.querySelector('.js-drone-note'));
    const waveSel = /** @type {HTMLSelectElement | null} */ (row.querySelector('.js-drone-wave'));
    const volInput = /** @type {HTMLInputElement | null} */ (row.querySelector('.js-drone-vol'));
    const removeBtn = /** @type {HTMLButtonElement | null} */ (row.querySelector('.js-drone-remove'));

    enabledSel?.addEventListener('change', () => {
      const t = getActiveTile();
      if (!t) return;
      t.drones = normalizeDroneList(t.drones, null);
      const d = t.drones[idx];
      if (!d) return;
      t.drones[idx] = normalizeDroneSettings({ ...d, enabled: enabledSel.value === '1' });
      syncDronePlayback();
      scheduleUrlUpdate();
    });

    noteSel?.addEventListener('change', () => {
      const t = getActiveTile();
      if (!t) return;
      t.drones = normalizeDroneList(t.drones, null);
      const d = t.drones[idx];
      if (!d) return;
      t.drones[idx] = normalizeDroneSettings({ ...d, midi: clampInt(noteSel.value, 0, 127) });
      syncDronePlayback();
      scheduleUrlUpdate();
    });

    waveSel?.addEventListener('change', () => {
      const t = getActiveTile();
      if (!t) return;
      t.drones = normalizeDroneList(t.drones, null);
      const d = t.drones[idx];
      if (!d) return;
      t.drones[idx] = normalizeDroneSettings({ ...d, waveform: u8ToWaveform(waveformToU8(waveSel.value)) });
      syncDronePlayback();
      scheduleUrlUpdate();
    });

    volInput?.addEventListener('input', () => {
      const t = getActiveTile();
      if (!t) return;
      t.drones = normalizeDroneList(t.drones, null);
      const d = t.drones[idx];
      if (!d) return;
      const v = clampInt(volInput.value, 0, 100);
      volInput.value = String(v);
      t.drones[idx] = normalizeDroneSettings({ ...d, volume: clampFloat(v / 100, 0, 1) });
      syncDronePlayback();
      scheduleUrlUpdate();
    });

    removeBtn?.addEventListener('click', () => {
      removeDroneFromActiveTile(idx);
    });
  });

  const rows = els.instrumentSettings.querySelectorAll('.channel-row');
  rows.forEach((row) => {
    const id = row.getAttribute('data-track-id');
    if (!id) return;

    const nameInput = /** @type {HTMLInputElement | null} */ (row.querySelector('.js-track-name'));
    const noteInput = /** @type {HTMLSelectElement | null} */ (row.querySelector('.js-track-note'));
    const waveInput = /** @type {HTMLSelectElement | null} */ (row.querySelector('.js-track-wave'));
    const removeBtn = /** @type {HTMLButtonElement | null} */ (row.querySelector('.js-track-remove'));

    nameInput?.addEventListener('change', () => {
      const tr = state.tracks.find((t) => t.id === id);
      if (!tr || tr.kind !== 'note') return;
      tr.label = nameInput.value.trim().slice(0, 60) || tr.label;
      renderGrid();
      scheduleUrlUpdate();
    });

    noteInput?.addEventListener('change', () => {
      const tr = state.tracks.find((t) => t.id === id);
      if (!tr || tr.kind !== 'note') return;
      tr.midi = clampInt(noteInput.value, 0, 127);
      scheduleUrlUpdate();
    });

    waveInput?.addEventListener('change', () => {
      const tr = state.tracks.find((t) => t.id === id);
      if (!tr || tr.kind !== 'note') return;
      tr.waveform = u8ToWaveform(waveformToU8(waveInput.value));
      scheduleUrlUpdate();
    });

    removeBtn?.addEventListener('click', () => {
      removeNoteChannel(id);
    });
  });
}
