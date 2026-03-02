'use strict';

function renderTransitions() {
  if (!els) return;
  const from = getActiveTile();
  if (!from) return;

  els.transitionsList.replaceChildren();

  for (const to of state.tiles) {
    const row = document.createElement('div');
    row.className = 'transition-row';

    const label = document.createElement('div');
    label.className = 'transition-row__label';

    const top = document.createElement('div');
    top.textContent = `→ ${to.name}`;
    top.style.fontWeight = '650';

    const bottom = document.createElement('div');
    bottom.className = 'small';
    bottom.textContent = to.id === from.id ? 'Self-loop' : to.id;

    label.appendChild(top);
    label.appendChild(bottom);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.className = 'weight-input';
    input.value = String(from.transitions[to.id] ?? 0);

    input.addEventListener('input', () => {
      const val = clampInt(input.value, 0, 65535);
      input.value = String(val);
      from.transitions[to.id] = val;
      scheduleUrlUpdate();
    });

    row.appendChild(label);
    row.appendChild(input);
    els.transitionsList.appendChild(row);
  }
}
