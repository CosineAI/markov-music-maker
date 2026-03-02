'use strict';

function renderPlaybackStatus() {
  if (!els) return;
  const tile = getActiveTile();
  if (intervalId !== null) {
    if (state.loopTileId && tile) {
      els.playbackStatus.textContent = `Looping: ${tile.name}`;
    } else {
      els.playbackStatus.textContent = tile ? `Playing: ${tile.name}` : 'Playing';
    }
  } else {
    els.playbackStatus.textContent = 'Stopped';
  }
}

/** @param {boolean} isPlaying */
function setPlayingUI(isPlaying) {
  if (!els) return;
  els.playBtn.disabled = isPlaying;
  els.stopBtn.disabled = !isPlaying;
  renderPlaybackStatus();
}
