const QUEUE_KEY = 'gymPendingSets';
const SNAPSHOT_KEY = 'gymSessionSnapshot';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const newClientId = () => (
  globalThis.crypto?.randomUUID?.()
  ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`
);

export const isOfflineError = (err) => !err?.response || err.response.status >= 500;

export const pendingFor = (sessionId) => read(QUEUE_KEY, []).filter(item => item.sessionId === sessionId);

export function enqueueSet(item) {
  write(QUEUE_KEY, [...read(QUEUE_KEY, []).filter(q => q.clientId !== item.clientId), item]);
}

export function dequeueSet(clientId) {
  write(QUEUE_KEY, read(QUEUE_KEY, []).filter(q => q.clientId !== clientId));
}

export function forgetSession(sessionId) {
  write(QUEUE_KEY, read(QUEUE_KEY, []).filter(q => q.sessionId !== sessionId));
  if (read(SNAPSHOT_KEY, null)?.id === sessionId) write(SNAPSHOT_KEY, null);
}

export const pendingEntry = (queued) => ({
  id: `pending-${queued.clientId}`,
  client_id: queued.clientId,
  position: queued.position,
  weight_kg: queued.data.weight_kg ?? 0,
  reps: queued.data.reps ?? 0,
  duration_seconds: queued.data.duration_seconds ?? null,
  distance_km: queued.data.distance_km ?? null,
  speed_kmh: queued.data.speed_kmh ?? null,
  level: queued.data.level ?? null,
  side: queued.data.side ?? null,
  rir: queued.data.rir ?? null,
  kind: queued.data.kind ?? 'normal',
  stages: [],
  created_at: queued.createdAt,
  pending: true,
});

export function withPending(session) {
  const queue = pendingFor(session.id);
  if (!queue.length) return session;
  return {
    ...session,
    exercises: session.exercises.map(item => {
      const saved = new Set(item.sets.map(entry => entry.client_id).filter(Boolean));
      const extra = queue.filter(q => q.itemId === item.id && !saved.has(q.clientId));
      if (!extra.length) return item;
      const sets = [...item.sets, ...extra.map(pendingEntry)].map((entry, index) => ({ ...entry, position: index + 1 }));
      return { ...item, sets };
    }),
  };
}

export function saveSnapshot(session) {
  if (session?.status === 'in_progress') write(SNAPSHOT_KEY, { id: session.id, session });
  else if (session && read(SNAPSHOT_KEY, null)?.id === session.id) write(SNAPSHOT_KEY, null);
}

export function readSnapshot(sessionId) {
  const snapshot = read(SNAPSHOT_KEY, null);
  return snapshot?.id === sessionId ? snapshot.session : null;
}
