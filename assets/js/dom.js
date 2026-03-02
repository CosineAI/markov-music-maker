'use strict';

const ui = {
  dronesOpen: false,
  notesOpen: false,
};

/** @type {null | {
 *   tilesList: HTMLElement,
 *   createTileBtn: HTMLButtonElement,
 *   copyTileBtn: HTMLButtonElement,
 *   renameTileBtn: HTMLButtonElement,
 *   deleteTileBtn: HTMLButtonElement,
 *   startTileSelect: HTMLSelectElement,
 *   playBtn: HTMLButtonElement,
 *   stopBtn: HTMLButtonElement,
 *   playbackStatus: HTMLElement,
 *   copyShareUrlBtn: HTMLButtonElement,
 *   resetAllBtn: HTMLButtonElement,
 *   activeTileBadge: HTMLElement,
 *   activeTileId: HTMLElement,
 *   tempoRange: HTMLInputElement,
 *   tempoNumber: HTMLInputElement,
 *   clearPatternBtn: HTMLButtonElement,
 *   randomizePatternBtn: HTMLButtonElement,
 *   tileSettings: HTMLElement,
 *   instrumentSettings: HTMLElement,
 *   gridMount: HTMLElement,
 *   transitionsTitle: HTMLElement,
 *   transitionsList: HTMLElement,
 *   loopTileBtn: HTMLButtonElement,
 *   chainGraph: HTMLElement,
 *   chainCanvas: HTMLCanvasElement,
 *   chainNodes: HTMLElement,
 * }} */
let els = null;

function initEls() {
  els = {
    tilesList: /** @type {HTMLElement} */ (document.getElementById('tiles-list')),
    createTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('create-tile')),
    copyTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('copy-tile')),
    renameTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('rename-tile')),
    deleteTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('delete-tile')),
    startTileSelect: /** @type {HTMLSelectElement} */ (document.getElementById('start-tile-select')),

    playBtn: /** @type {HTMLButtonElement} */ (document.getElementById('play')),
    stopBtn: /** @type {HTMLButtonElement} */ (document.getElementById('stop')),
    playbackStatus: /** @type {HTMLElement} */ (document.getElementById('playback-status')),

    copyShareUrlBtn: /** @type {HTMLButtonElement} */ (document.getElementById('copy-share-url')),
    resetAllBtn: /** @type {HTMLButtonElement} */ (document.getElementById('reset-all')),

    activeTileBadge: /** @type {HTMLElement} */ (document.getElementById('active-tile-badge')),
    activeTileId: /** @type {HTMLElement} */ (document.getElementById('active-tile-id')),

    tempoRange: /** @type {HTMLInputElement} */ (document.getElementById('tempoRange')),
    tempoNumber: /** @type {HTMLInputElement} */ (document.getElementById('tempoNumber')),
    clearPatternBtn: /** @type {HTMLButtonElement} */ (document.getElementById('clear-pattern')),
    randomizePatternBtn: /** @type {HTMLButtonElement} */ (document.getElementById('randomize-pattern')),

    tileSettings: /** @type {HTMLElement} */ (document.getElementById('tile-settings')),
    instrumentSettings: /** @type {HTMLElement} */ (document.getElementById('instrument-settings')),

    gridMount: /** @type {HTMLElement} */ (document.getElementById('grid-mount')),
    transitionsTitle: /** @type {HTMLElement} */ (document.getElementById('transitions-title')),
    transitionsList: /** @type {HTMLElement} */ (document.getElementById('transitions-list')),

    loopTileBtn: /** @type {HTMLButtonElement} */ (document.getElementById('loop-tile')),
    chainGraph: /** @type {HTMLElement} */ (document.getElementById('chain-graph')),
    chainCanvas: /** @type {HTMLCanvasElement} */ (document.getElementById('chain-canvas')),
    chainNodes: /** @type {HTMLElement} */ (document.getElementById('chain-nodes')),
  };

  return els;
}
