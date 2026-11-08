const TAB_TYPES = ['tab-forward', 'tab-back'];
const LANDED_EVENT = 'page-landed';
const SIDE_ENTRY_MS = 1400;
const ANNOUNCE_TTL_MS = 1500;
const SLIDE_FALLBACK_MS = 1200;
const COARSE_QUERY = '(pointer: coarse)';

let entryTimer = null;
let announced = null;

export function subscribeCoarsePointer(onChange) {
  const query = window.matchMedia(COARSE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export const isCoarsePointer = () => window.matchMedia(COARSE_QUERY).matches;

export function announceTabSlide(types) {
  const side = types?.[0] === 'tab-forward' ? 'right' : types?.[0] === 'tab-back' ? 'left' : null;
  announced = side ? { side, at: performance.now() } : null;
}

function land(side) {
  const root = document.documentElement;
  delete root.dataset.sliding;
  root.dataset.entry = side;
  clearTimeout(entryTimer);
  entryTimer = setTimeout(() => delete root.dataset.entry, SIDE_ENTRY_MS);
  window.dispatchEvent(new Event(LANDED_EVENT));
}

function slideFrame(frame, side) {
  const root = document.documentElement;
  const className = side === 'right' ? 'page-slide-from-right' : 'page-slide-from-left';
  let done = false;
  const finish = (event) => {
    if (done || (event && event.target !== frame)) return;
    done = true;
    frame.removeEventListener('animationend', finish);
    frame.classList.remove(className);
    land(side);
  };
  root.dataset.sliding = '';
  frame.classList.add(className);
  frame.addEventListener('animationend', finish);
  setTimeout(finish, SLIDE_FALLBACK_MS);
}

export function holdUntilLanded(frame) {
  const pending = announced;
  announced = null;

  const transition = document.activeViewTransition;
  if (transition && TAB_TYPES.some(type => transition.types?.has(type))) {
    document.documentElement.dataset.sliding = '';
    transition.finished.finally(() => land(transition.types.has('tab-forward') ? 'right' : 'left'));
    return;
  }

  if (pending && frame && performance.now() - pending.at < ANNOUNCE_TTL_MS) slideFrame(frame, pending.side);
}

export function whenLanded(callback) {
  if (!('sliding' in document.documentElement.dataset)) {
    callback();
    return () => {};
  }
  window.addEventListener(LANDED_EVENT, callback, { once: true });
  return () => window.removeEventListener(LANDED_EVENT, callback);
}
