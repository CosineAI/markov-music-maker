'use strict';

let toastEl = null;
/** @type {number | null} */
let toastTimer = null;

function ensureToast() {
  if (toastEl) return;
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastEl);
}

/** @param {string} msg */
function toast(msg) {
  ensureToast();
  if (!toastEl) return;

  toastEl.textContent = msg;
  toastEl.classList.add('is-visible');

  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl?.classList.remove('is-visible');
    toastTimer = null;
  }, 1400);
}
