'use strict';

function renderChainNodes() {
  if (!els || !els.chainNodes) return;
  els.chainNodes.replaceChildren();

  for (const tile of state.tiles) {
    const node = document.createElement('div');
    node.className = 'chain-node';

    if (tile.id === state.activeTileId) node.classList.add('is-active');
    if (tile.id === state.startTileId) node.classList.add('is-start');

    const title = document.createElement('div');
    title.className = 'chain-node__title';
    title.textContent = tile.name;

    const chips = document.createElement('div');
    chips.className = 'chain-node__chips';

    if (tile.id === state.startTileId) {
      const chip = document.createElement('span');
      chip.className = 'chain-chip is-start';
      chip.textContent = 'Start';
      chips.appendChild(chip);
    }

    if (tile.id === state.activeTileId) {
      const chip = document.createElement('span');
      chip.className = 'chain-chip is-active';
      chip.textContent = 'Active';
      chips.appendChild(chip);
    }

    const totalWeight = Object.values(tile.transitions).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const meta = document.createElement('div');
    meta.className = 'small muted';
    meta.textContent = `Outgoing weight: ${totalWeight}`;

    node.appendChild(title);
    node.appendChild(chips);
    node.appendChild(meta);

    node.addEventListener('click', () => {
      setActiveTile(tile.id);
    });

    els.chainNodes.appendChild(node);
  }
}

function renderChainGraph() {
  if (!els || !els.chainCanvas || !els.chainGraph) return;

  const rect = els.chainGraph.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width <= 0 || height <= 0) return;

  const ctx = els.chainCanvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const pxWidth = Math.floor(width * dpr);
  const pxHeight = Math.floor(height * dpr);

  if (els.chainCanvas.width !== pxWidth || els.chainCanvas.height !== pxHeight) {
    els.chainCanvas.width = pxWidth;
    els.chainCanvas.height = pxHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const count = state.tiles.length;
  if (count === 0) return;

  const paddingX = 46;
  const paddingY = 34;
  const availableWidth = Math.max(0, width - paddingX * 2);
  const spacing = count > 1 ? availableWidth / (count - 1) : 0;
  const maxRadius = 22;
  const minRadius = 14;
  const radius = Math.max(minRadius, Math.min(maxRadius, spacing > 0 ? spacing * 0.35 : maxRadius));
  const centerY = height / 2;
  const maxArc = Math.max(24, centerY - radius - paddingY);

  const positions = state.tiles.map((_, i) => ({
    x: count === 1 ? width / 2 : paddingX + spacing * i,
    y: centerY,
  }));

  const weights = [];
  for (const tile of state.tiles) {
    for (const target of state.tiles) {
      const weight = Math.max(0, Number(tile.transitions[target.id] || 0));
      if (weight > 0) weights.push(weight);
    }
  }
  const maxWeight = Math.max(1, ...weights);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '11px system-ui';

  for (let i = 0; i < count; i++) {
    const from = state.tiles[i];
    const fromPos = positions[i];

    for (let j = 0; j < count; j++) {
      const to = state.tiles[j];
      const weight = Math.max(0, Number(from.transitions[to.id] || 0));
      if (weight <= 0) continue;

      const strength = weight / maxWeight;
      const alpha = 0.2 + 0.6 * strength;
      const lineWidth = 1 + 2.2 * strength;
      const color = from.id === state.activeTileId ? `rgba(245, 158, 11, ${alpha})` : `rgba(37, 99, 235, ${alpha})`;

      if (i === j) {
        const loopRadius = Math.min(radius * 0.8, maxArc);
        const loopCenterX = fromPos.x;

        const desiredCenterY = fromPos.y + radius * 2.25;
        const minCenterY = fromPos.y + radius * 1.3;
        const maxCenterY = height - paddingY - loopRadius - 10;
        const loopCenterY = maxCenterY >= minCenterY ? clampFloat(desiredCenterY, minCenterY, maxCenterY) : desiredCenterY;

        const startAngle = Math.PI / 3;
        const endAngle = (2 * Math.PI) / 3;

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(loopCenterX, loopCenterY, loopRadius, startAngle, endAngle);
        ctx.stroke();

        const arrowAngle = endAngle + Math.PI / 2;
        const endX = loopCenterX + Math.cos(endAngle) * loopRadius;
        const endY = loopCenterY + Math.sin(endAngle) * loopRadius;
        const head = 5 + 4 * strength;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - head * Math.cos(arrowAngle - 0.5), endY - head * Math.sin(arrowAngle - 0.5));
        ctx.lineTo(endX - head * Math.cos(arrowAngle + 0.5), endY - head * Math.sin(arrowAngle + 0.5));
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.fillText(String(weight), loopCenterX, Math.min(height - paddingY - 6, loopCenterY + loopRadius + 12));
        continue;
      }

      const direction = j > i ? 1 : -1;
      const span = Math.abs(j - i);
      const arcHeight = Math.min(maxArc, 18 + span * 12);
      const startX = fromPos.x + direction * radius;
      const endX = positions[j].x - direction * radius;
      const controlX = (startX + endX) / 2;
      const controlY = centerY - direction * arcHeight;

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(startX, centerY);
      ctx.quadraticCurveTo(controlX, controlY, endX, centerY);
      ctx.stroke();

      const angle = Math.atan2(centerY - controlY, endX - controlX);
      const head = 5 + 4 * strength;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(endX, centerY);
      ctx.lineTo(endX - head * Math.cos(angle - 0.4), centerY - head * Math.sin(angle - 0.4));
      ctx.lineTo(endX - head * Math.cos(angle + 0.4), centerY - head * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillText(String(weight), controlX, controlY - direction * 10);
    }
  }

  for (let i = 0; i < count; i++) {
    const tile = state.tiles[i];
    const pos = positions[i];
    const isActive = tile.id === state.activeTileId;
    const isStart = tile.id === state.startTileId;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? 'rgba(37, 99, 235, 0.95)' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = isStart ? 2.5 : 1.5;
    ctx.strokeStyle = isStart ? 'rgba(245, 158, 11, 0.9)' : 'rgba(37, 99, 235, 0.35)';
    ctx.stroke();

    const initials = tile.name.trim().slice(0, 2).toUpperCase();
    ctx.fillStyle = isActive ? '#ffffff' : '#0f172a';
    ctx.font = '12px system-ui';
    ctx.fillText(initials, pos.x, pos.y);

    const label = tile.name.length > 12 ? `${tile.name.slice(0, 10)}…` : tile.name;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.font = '11px system-ui';
    ctx.fillText(label, pos.x, pos.y + radius + 14);
  }
}
