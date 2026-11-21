const PREFIX = 'gymWorkoutDraft:';
const EVENT = 'gym-workout-draft';

export const draftKey = (workoutId) => `${PREFIX}${workoutId ?? 'new'}`;

export function readDraftRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readDraft(key) {
  try {
    const raw = readDraftRaw(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeDraft(key, draft) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    return;
  }
}

export const clearDraft = (key) => writeDraft(key, null);

export function subscribeDrafts(onChange) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}
