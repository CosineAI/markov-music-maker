'use strict';

/**
 * @typedef {'kick' | 'snare' | 'hat'} DrumName
 */

/**
 * @typedef TrackBase
 * @property {string} id
 * @property {string} label
 */

/**
 * @typedef {TrackBase & { kind: 'drum', drum: DrumName }} DrumTrack
 */

/**
 * @typedef {TrackBase & { kind: 'note', midi: number, waveform: (typeof WAVEFORMS)[number] }} NoteTrack
 */

/**
 * @typedef {DrumTrack | NoteTrack} Track
 */

/**
 * @typedef DroneSettings
 * @property {boolean} enabled
 * @property {(typeof WAVEFORMS)[number]} waveform
 * @property {number} midi
 * @property {number} volume
 */

/**
 * @typedef Tile
 * @property {string} id
 * @property {string} name
 * @property {number} beats
 * @property {DroneSettings[]} drones
 * @property {boolean[][]} grid
 * @property {Record<string, number>} transitions
 */

/**
 * @typedef AppState
 * @property {number} bpm
 * @property {number} stepsPerBeat
 * @property {string | null} startTileId
 * @property {string | null} activeTileId
 * @property {string | null} loopTileId
 * @property {Track[]} tracks
 * @property {Tile[]} tiles
 */

/** @type {AppState} */
let state = {
  bpm: 120,
  stepsPerBeat: DEFAULT_STEPS_PER_BEAT,
  startTileId: null,
  activeTileId: null,
  loopTileId: null,
  tracks: [],
  tiles: [],
};

/** @param {AppState} next */
function setState(next) {
  state = next;
}
