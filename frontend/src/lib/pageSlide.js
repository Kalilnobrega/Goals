const TAB_TYPES = ['tab-forward', 'tab-back'];
const LANDED_EVENT = 'page-landed';

export function holdUntilLanded() {
  const transition = document.activeViewTransition;
  if (!transition || !TAB_TYPES.some(type => transition.types?.has(type))) return;
  const root = document.documentElement;
  root.dataset.sliding = '';
  transition.finished.finally(() => {
    delete root.dataset.sliding;
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
