'use strict';

/** @type {number | null} */
let intervalId = null;

let stepIndex = 0;

let playbackRequestId = 0;

/** @param {number | null} next */
function setIntervalId(next) {
  intervalId = next;
}

/** @param {number} next */
function setStepIndex(next) {
  stepIndex = next;
}

function resetStepIndex() {
  stepIndex = 0;
}

function bumpPlaybackRequestId() {
  playbackRequestId += 1;
  return playbackRequestId;
}
