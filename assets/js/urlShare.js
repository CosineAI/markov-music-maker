'use strict';

class ByteWriter {
  constructor() {
    /** @type {number[]} */
    this.buf = [];
  }
  u8(n) {
    this.buf.push(n & 0xff);
  }
  u16(n) {
    this.buf.push(n & 0xff, (n >> 8) & 0xff);
  }
  bytes(arr) {
    for (const b of arr) this.buf.push(b);
  }
  toUint8Array() {
    return new Uint8Array(this.buf);
  }
}

class ByteReader {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.bytes = bytes;
    this.i = 0;
  }
  u8() {
    if (this.i + 1 > this.bytes.length) throw new Error('EOF');
    return this.bytes[this.i++];
  }
  u16() {
    const lo = this.u8();
    const hi = this.u8();
    return lo | (hi << 8);
  }
  take(n) {
    if (this.i + n > this.bytes.length) throw new Error('EOF');
    const out = this.bytes.slice(this.i, this.i + n);
    this.i += n;
    return out;
  }
}

function toBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...part);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function gridToBytes(grid, trackCount, steps) {
  const bitCount = trackCount * steps;
  const bytes = new Uint8Array(Math.ceil(bitCount / 8));
  let k = 0;
  for (let r = 0; r < trackCount; r++) {
    for (let s = 0; s < steps; s++) {
      if (grid[r][s]) bytes[k >> 3] |= 1 << (k & 7);
      k++;
    }
  }
  return bytes;
}

function bytesToGrid(bytes, trackCount, steps) {
  const grid = createEmptyGrid(trackCount, steps);
  let k = 0;
  for (let r = 0; r < trackCount; r++) {
    for (let s = 0; s < steps; s++) {
      const on = (bytes[k >> 3] & (1 << (k & 7))) !== 0;
      grid[r][s] = on;
      k++;
    }
  }
  return grid;
}

function encodeState() {
  // v5 binary format:
  // [u8 version=5]
  // [u16 bpm]
  // [u8 stepsPerBeat]
  // [u8 trackCount]
  // for each track:
  //   [u8 kind 0=drum 1=note]
  //   [u8 labelLen][labelBytes]
  //   if drum: [u8 drumType]
  //   if note: [u8 waveform][u8 midi]
  // [u16 startIndex or 0xFFFF]
  // [u16 tileCount]
  // for each tile:
  //   [u8 nameLen][nameBytes]
  //   [u8 beats]
  //   [u8 droneCount]
  //   for each drone:
  //     [u8 enabled][u8 waveform][u8 midi][u8 volumePercent]
  //   [gridBytes]
  // transitions matrix: tileCount * tileCount * u16 weight

  ensureTransitionsComplete();
  ensureTileGrids();

  const w = new ByteWriter();
  const enc = new TextEncoder();

  const trackCount = clampInt(state.tracks.length, 1, 255);

  w.u8(5);
  w.u16(clampInt(state.bpm, 30, 300));
  w.u8(clampInt(getStepsPerBeat(), 1, MAX_STEPS_PER_BEAT));
  w.u8(trackCount);

  for (let i = 0; i < trackCount; i++) {
    const tr = state.tracks[i];
    if (tr.kind === 'drum') {
      w.u8(0);
      const labelBytes = enc.encode(tr.label);
      const trimmed = labelBytes.length > 60 ? labelBytes.slice(0, 60) : labelBytes;
      w.u8(trimmed.length);
      w.bytes(trimmed);
      w.u8(drumToU8(tr.drum));
    } else {
      w.u8(1);
      const labelBytes = enc.encode(tr.label);
      const trimmed = labelBytes.length > 60 ? labelBytes.slice(0, 60) : labelBytes;
      w.u8(trimmed.length);
      w.bytes(trimmed);
      w.u8(waveformToU8(tr.waveform));
      w.u8(clampInt(tr.midi, 0, 127));
    }
  }

  const tileCount = state.tiles.length;
  const startIndex = state.startTileId ? state.tiles.findIndex((t) => t.id === state.startTileId) : -1;
  w.u16(startIndex >= 0 ? startIndex : 0xffff);
  w.u16(tileCount);

  for (const t of state.tiles) {
    const nameBytes = enc.encode(t.name);
    const trimmed = nameBytes.length > 80 ? nameBytes.slice(0, 80) : nameBytes;
    w.u8(trimmed.length);
    w.bytes(trimmed);

    const beats = clampInt(t.beats, 1, MAX_BEATS_PER_TILE);
    w.u8(beats);

    const drones = normalizeDroneList(t.drones, null);
    const droneCount = clampInt(drones.length, 0, 255);
    w.u8(droneCount);

    for (let i = 0; i < droneCount; i++) {
      const drone = normalizeDroneSettings(drones[i]);
      w.u8(drone.enabled ? 1 : 0);
      w.u8(waveformToU8(drone.waveform));
      w.u8(clampInt(drone.midi, 0, 127));
      w.u8(clampInt(Math.round(clampFloat(drone.volume, 0, 1) * 100), 0, 100));
    }

    const steps = stepsForBeats(beats);
    const gb = gridToBytes(t.grid, trackCount, steps);
    w.bytes(gb);
  }

  for (let i = 0; i < tileCount; i++) {
    const from = state.tiles[i];
    for (let j = 0; j < tileCount; j++) {
      const to = state.tiles[j];
      const weight = clampInt(from.transitions[to.id] ?? 0, 0, 65535);
      w.u16(weight);
    }
  }

  return toBase64Url(w.toUint8Array());
}

function decodeStateV1(r, dec) {
  const bpm = r.u16();
  const stepsPerBeat = LEGACY_STEPS_PER_BEAT;
  const startIndex = r.u16();
  const tileCount = r.u16();

  if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

  const tracks = createDefaultTracks();
  const trackCount = tracks.length;
  const steps = 16;
  const gridByteLen = Math.ceil((trackCount * steps) / 8);

  /** @type {import('./state.js').Tile[]} */
  const tiles = [];

  for (let i = 0; i < tileCount; i++) {
    const nameLen = r.u8();
    const nameBytes = r.take(nameLen);
    const name = dec.decode(nameBytes) || `Tile ${i + 1}`;
    const gridBytes = r.take(gridByteLen);

    tiles.push({
      id: uuid(),
      name,
      beats: 4,
      drones: [createDefaultDroneSettings()],
      grid: bytesToGrid(gridBytes, trackCount, steps),
      transitions: {},
    });
  }

  for (let i = 0; i < tileCount; i++) {
    for (let j = 0; j < tileCount; j++) {
      const wgt = r.u16();
      tiles[i].transitions[tiles[j].id] = wgt;
    }
  }

  const startId = startIndex !== 0xffff && startIndex < tiles.length ? tiles[startIndex].id : tiles[0].id;

  return {
    bpm: clampInt(bpm, 30, 300),
    stepsPerBeat,
    startTileId: startId,
    activeTileId: startId,
    loopTileId: null,
    tracks,
    tiles,
  };
}

function decodeStateV2(r, dec) {
  const bpm = r.u16();
  const stepsPerBeat = LEGACY_STEPS_PER_BEAT;
  const trackCount = r.u8();

  if (trackCount <= 0 || trackCount > 255) throw new Error('Invalid track count');

  /** @type {import('./state.js').Track[]} */
  const tracks = [];

  for (let i = 0; i < trackCount; i++) {
    const kind = r.u8();
    const labelLen = r.u8();
    const labelBytes = r.take(labelLen);
    const label = dec.decode(labelBytes) || `Track ${i + 1}`;

    if (kind === 0) {
      const drum = u8ToDrum(r.u8());
      tracks.push({ id: uuid(), label, kind: 'drum', drum });
    } else {
      const waveform = u8ToWaveform(r.u8());
      const midi = r.u8();
      tracks.push({ id: uuid(), label, kind: 'note', midi, waveform });
    }
  }

  const globalDrone = normalizeDroneSettings({
    enabled: r.u8() === 1,
    waveform: u8ToWaveform(r.u8()),
    midi: r.u8(),
    volume: clampFloat(r.u8() / 100, 0, 1),
  });

  const startIndex = r.u16();
  const tileCount = r.u16();

  if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

  /** @type {import('./state.js').Tile[]} */
  const tiles = [];

  for (let i = 0; i < tileCount; i++) {
    const nameLen = r.u8();
    const nameBytes = r.take(nameLen);
    const name = dec.decode(nameBytes) || `Tile ${i + 1}`;
    const beats = clampInt(r.u8(), 1, MAX_BEATS_PER_TILE);
    const steps = stepsForBeats(beats, stepsPerBeat);
    const gridByteLen = Math.ceil((trackCount * steps) / 8);
    const gridBytes = r.take(gridByteLen);

    tiles.push({
      id: uuid(),
      name,
      beats,
      drones: [{ ...globalDrone }],
      grid: bytesToGrid(gridBytes, trackCount, steps),
      transitions: {},
    });
  }

  for (let i = 0; i < tileCount; i++) {
    for (let j = 0; j < tileCount; j++) {
      const wgt = r.u16();
      tiles[i].transitions[tiles[j].id] = wgt;
    }
  }

  const startId = startIndex !== 0xffff && startIndex < tiles.length ? tiles[startIndex].id : tiles[0].id;

  return {
    bpm: clampInt(bpm, 30, 300),
    stepsPerBeat,
    startTileId: startId,
    activeTileId: startId,
    loopTileId: null,
    tracks,
    tiles,
  };
}

function decodeStateV3(r, dec) {
  const bpm = r.u16();
  const stepsPerBeat = LEGACY_STEPS_PER_BEAT;
  const trackCount = r.u8();

  if (trackCount <= 0 || trackCount > 255) throw new Error('Invalid track count');

  /** @type {import('./state.js').Track[]} */
  const tracks = [];

  for (let i = 0; i < trackCount; i++) {
    const kind = r.u8();
    const labelLen = r.u8();
    const labelBytes = r.take(labelLen);
    const label = dec.decode(labelBytes) || `Track ${i + 1}`;

    if (kind === 0) {
      const drum = u8ToDrum(r.u8());
      tracks.push({ id: uuid(), label, kind: 'drum', drum });
    } else {
      const waveform = u8ToWaveform(r.u8());
      const midi = r.u8();
      tracks.push({ id: uuid(), label, kind: 'note', midi, waveform });
    }
  }

  const startIndex = r.u16();
  const tileCount = r.u16();

  if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

  /** @type {import('./state.js').Tile[]} */
  const tiles = [];

  for (let i = 0; i < tileCount; i++) {
    const nameLen = r.u8();
    const nameBytes = r.take(nameLen);
    const name = dec.decode(nameBytes) || `Tile ${i + 1}`;

    const beats = clampInt(r.u8(), 1, MAX_BEATS_PER_TILE);
    const drone = normalizeDroneSettings({
      enabled: r.u8() === 1,
      waveform: u8ToWaveform(r.u8()),
      midi: r.u8(),
      volume: clampFloat(r.u8() / 100, 0, 1),
    });

    const steps = stepsForBeats(beats, stepsPerBeat);
    const gridByteLen = Math.ceil((trackCount * steps) / 8);
    const gridBytes = r.take(gridByteLen);

    tiles.push({
      id: uuid(),
      name,
      beats,
      drones: [drone],
      grid: bytesToGrid(gridByteLen ? gridBytes : new Uint8Array(0), trackCount, steps),
      transitions: {},
    });
  }

  for (let i = 0; i < tileCount; i++) {
    for (let j = 0; j < tileCount; j++) {
      const wgt = r.u16();
      tiles[i].transitions[tiles[j].id] = wgt;
    }
  }

  const startId = startIndex !== 0xffff && startIndex < tiles.length ? tiles[startIndex].id : tiles[0].id;

  return {
    bpm: clampInt(bpm, 30, 300),
    stepsPerBeat,
    startTileId: startId,
    activeTileId: startId,
    loopTileId: null,
    tracks,
    tiles,
  };
}

function decodeStateV4(r, dec) {
  const bpm = r.u16();
  const stepsPerBeat = LEGACY_STEPS_PER_BEAT;
  const trackCount = r.u8();

  if (trackCount <= 0 || trackCount > 255) throw new Error('Invalid track count');

  /** @type {import('./state.js').Track[]} */
  const tracks = [];

  for (let i = 0; i < trackCount; i++) {
    const kind = r.u8();
    const labelLen = r.u8();
    const labelBytes = r.take(labelLen);
    const label = dec.decode(labelBytes) || `Track ${i + 1}`;

    if (kind === 0) {
      const drum = u8ToDrum(r.u8());
      tracks.push({ id: uuid(), label, kind: 'drum', drum });
    } else {
      const waveform = u8ToWaveform(r.u8());
      const midi = r.u8();
      tracks.push({ id: uuid(), label, kind: 'note', midi, waveform });
    }
  }

  const startIndex = r.u16();
  const tileCount = r.u16();

  if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

  /** @type {import('./state.js').Tile[]} */
  const tiles = [];

  for (let i = 0; i < tileCount; i++) {
    const nameLen = r.u8();
    const nameBytes = r.take(nameLen);
    const name = dec.decode(nameBytes) || `Tile ${i + 1}`;

    const beats = clampInt(r.u8(), 1, MAX_BEATS_PER_TILE);
    const droneCount = clampInt(r.u8(), 0, 255);

    /** @type {import('./state.js').DroneSettings[]} */
    const drones = [];
    for (let d = 0; d < droneCount; d++) {
      drones.push(
        normalizeDroneSettings({
          enabled: r.u8() === 1,
          waveform: u8ToWaveform(r.u8()),
          midi: r.u8(),
          volume: clampFloat(r.u8() / 100, 0, 1),
        })
      );
    }

    const steps = stepsForBeats(beats, stepsPerBeat);
    const gridByteLen = Math.ceil((trackCount * steps) / 8);
    const gridBytes = r.take(gridByteLen);

    tiles.push({
      id: uuid(),
      name,
      beats,
      drones,
      grid: bytesToGrid(gridByteLen ? gridBytes : new Uint8Array(0), trackCount, steps),
      transitions: {},
    });
  }

  for (let i = 0; i < tileCount; i++) {
    for (let j = 0; j < tileCount; j++) {
      const wgt = r.u16();
      tiles[i].transitions[tiles[j].id] = wgt;
    }
  }

  const startId = startIndex !== 0xffff && startIndex < tiles.length ? tiles[startIndex].id : tiles[0].id;

  return {
    bpm: clampInt(bpm, 30, 300),
    stepsPerBeat,
    startTileId: startId,
    activeTileId: startId,
    loopTileId: null,
    tracks,
    tiles,
  };
}

function decodeStateV5(r, dec) {
  const bpm = r.u16();
  const stepsPerBeat = clampInt(r.u8(), 1, MAX_STEPS_PER_BEAT);
  const trackCount = r.u8();

  if (trackCount <= 0 || trackCount > 255) throw new Error('Invalid track count');

  /** @type {import('./state.js').Track[]} */
  const tracks = [];

  for (let i = 0; i < trackCount; i++) {
    const kind = r.u8();
    const labelLen = r.u8();
    const labelBytes = r.take(labelLen);
    const label = dec.decode(labelBytes) || `Track ${i + 1}`;

    if (kind === 0) {
      const drum = u8ToDrum(r.u8());
      tracks.push({ id: uuid(), label, kind: 'drum', drum });
    } else {
      const waveform = u8ToWaveform(r.u8());
      const midi = r.u8();
      tracks.push({ id: uuid(), label, kind: 'note', midi, waveform });
    }
  }

  const startIndex = r.u16();
  const tileCount = r.u16();

  if (tileCount <= 0 || tileCount > 200) throw new Error('Invalid tile count');

  /** @type {import('./state.js').Tile[]} */
  const tiles = [];

  for (let i = 0; i < tileCount; i++) {
    const nameLen = r.u8();
    const nameBytes = r.take(nameLen);
    const name = dec.decode(nameBytes) || `Tile ${i + 1}`;

    const beats = clampInt(r.u8(), 1, MAX_BEATS_PER_TILE);
    const droneCount = clampInt(r.u8(), 0, 255);

    /** @type {import('./state.js').DroneSettings[]} */
    const drones = [];
    for (let d = 0; d < droneCount; d++) {
      drones.push(
        normalizeDroneSettings({
          enabled: r.u8() === 1,
          waveform: u8ToWaveform(r.u8()),
          midi: r.u8(),
          volume: clampFloat(r.u8() / 100, 0, 1),
        })
      );
    }

    const steps = stepsForBeats(beats, stepsPerBeat);
    const gridByteLen = Math.ceil((trackCount * steps) / 8);
    const gridBytes = r.take(gridByteLen);

    tiles.push({
      id: uuid(),
      name,
      beats,
      drones,
      grid: bytesToGrid(gridBytes, trackCount, steps),
      transitions: {},
    });
  }

  for (let i = 0; i < tileCount; i++) {
    for (let j = 0; j < tileCount; j++) {
      const wgt = r.u16();
      tiles[i].transitions[tiles[j].id] = wgt;
    }
  }

  const startId = startIndex !== 0xffff && startIndex < tiles.length ? tiles[startIndex].id : tiles[0].id;

  return {
    bpm: clampInt(bpm, 30, 300),
    stepsPerBeat,
    startTileId: startId,
    activeTileId: startId,
    loopTileId: null,
    tracks,
    tiles,
  };
}

function decodeState(encoded) {
  const bytes = fromBase64Url(encoded);
  const r = new ByteReader(bytes);
  const dec = new TextDecoder();

  const version = r.u8();
  if (version === 1) return decodeStateV1(r, dec);
  if (version === 2) return decodeStateV2(r, dec);
  if (version === 3) return decodeStateV3(r, dec);
  if (version === 4) return decodeStateV4(r, dec);
  if (version === 5) return decodeStateV5(r, dec);

  throw new Error(`Unsupported version ${version}`);
}

function getEncodedFromUrl() {
  const h = window.location.hash || '';
  const m = h.match(/(?:^#|&)s=([^&]+)/);
  return m ? m[1] : null;
}

/** @type {number | null} */
let urlUpdateTimer = null;

function scheduleUrlUpdate() {
  if (urlUpdateTimer !== null) window.clearTimeout(urlUpdateTimer);
  urlUpdateTimer = window.setTimeout(() => {
    urlUpdateTimer = null;
    try {
      const encoded = encodeState();
      history.replaceState(null, '', `#s=${encoded}`);
    } catch (e) {
      console.warn('Could not encode URL state', e);
    }
  }, 250);
}

async function copyShareUrl() {
  let url;
  try {
    const encoded = encodeState();
    const base = location.origin === 'null' ? location.href.replace(/#.*$/, '') : `${location.origin}${location.pathname}`;
    url = `${base}#s=${encoded}`;
  } catch (e) {
    console.error(e);
    toast('Could not create share URL');
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    toast('Share URL copied');
  } catch {
    prompt('Copy this URL', url);
  }
}
