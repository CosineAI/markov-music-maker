'use strict';

function clampInt(n, min, max) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function clampFloat(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `t_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToNoteName(midi) {
  const name = NOTE_NAMES[midi % 12] || 'C';
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

const NOTE_CHOICES = (() => {
  const out = [];
  for (let midi = 36; midi <= 96; midi++) {
    out.push({ midi, name: midiToNoteName(midi) });
  }
  return out;
})();

function waveformToU8(waveform) {
  const idx = WAVEFORMS.indexOf(waveform);
  return idx >= 0 ? idx : 0;
}

function u8ToWaveform(n) {
  return WAVEFORMS[n] || 'sine';
}

function drumToU8(drum) {
  if (drum === 'kick') return 0;
  if (drum === 'snare') return 1;
  return 2;
}

function u8ToDrum(n) {
  if (n === 0) return 'kick';
  if (n === 1) return 'snare';
  return 'hat';
}
