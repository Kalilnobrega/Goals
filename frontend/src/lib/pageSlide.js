const TAB_TYPES = ['tab-forward', 'tab-back'];
const LANDED_EVENT = 'page-landed';
const SIDE_ENTRY_MS = 1400;

let entryTimer = null;

export function holdUntilLanded() {
  const transition = document.activeViewTransition;
  if (!transition || !TAB_TYPES.some(type => transition.types?.has(type))) return;
  const root = document.documentElement;
  root.dataset.sliding = '';
  transition.finished.finally(() => {
    delete root.dataset.sliding;
    root.dataset.entry = transition.types.has('tab-forward') ? 'right' : 'left';
    clearTimeout(entryTimer);
    entryTimer = setTimeout(() => delete root.dataset.entry, SIDE_ENTRY_MS);
    window.dispatchEvent(new Event(LANDED_EVENT));
  });
}

export function whenLanded(callback) {
  if (!('sliding' in document.documentElement.dataset)) {
    callback();
    return () => {};
  }
  window.addEventListener(LANDED_EVENT, callback, { once: true });
  return () => window.removeEventListener(LANDED_EVENT, callback);
}
