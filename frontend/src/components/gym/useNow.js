import { useSyncExternalStore } from 'react';

let now = 0;
let timer = null;
const listeners = new Set();

function tick() {
  now = Date.now();
  listeners.forEach(listener => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  if (!now) now = Date.now();
  return now;
}

export default function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
