const KEY = 'gymRestTimer';
const EVENT = 'gym-rest-timer-changed';

let cachedRaw;
let cachedValue = null;

export function getRestTimer() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedValue = raw ? JSON.parse(raw) : null;
    } catch {
      cachedValue = null;
    }
  }
  return cachedValue;
}

function save(value) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function startRestTimer(seconds, label, sessionId) {
  if (!seconds) return save({ startedAt: Date.now(), label, sessionId });
  save({ endsAt: Date.now() + seconds * 1000, total: seconds, label, sessionId });
}

export function adjustRestTimer(delta) {
  const timer = getRestTimer();
  if (!timer?.endsAt) return;
  const endsAt = Math.max(Date.now(), timer.endsAt + delta * 1000);
  save({ ...timer, endsAt, total: Math.max(timer.total + delta, 1) });
}

export function stopRestTimer() {
  save(null);
}

export function subscribeRestTimer(onChange) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
