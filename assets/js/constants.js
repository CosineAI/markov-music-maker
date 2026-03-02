'use strict';

const LEGACY_STEPS_PER_BEAT = 4;
const DEFAULT_STEPS_PER_BEAT = 1;
const MAX_STEPS_PER_BEAT = 12;
const MAX_BEATS_PER_TILE = 32;

const DRUM_TRACK_COUNT = 3;

const WAVEFORMS = /** @type {const} */ (['sine', 'square', 'triangle', 'sawtooth']);
const NOTE_NAMES = /** @type {const} */ (['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);

const DEFAULT_DRONE = { enabled: false, waveform: 'sine', midi: 48, volume: 0.18 };
