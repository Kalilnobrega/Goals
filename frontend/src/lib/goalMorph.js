import { useEffect, useLayoutEffect } from 'react';

const MORPH_CLASS = 'goal-morph';
const UNUSED_CLEAR_MS = 3000;
const NO_TRANSITION_CLEAR_MS = 1000;

let pending = null;

const findHost = (el) => el?.closest('[data-morph]') ?? el?.querySelector('[data-morph]') ?? null;

function applyName(host, morph) {
  host.style.viewTransitionName = morph;
  host.style.viewTransitionClass = MORPH_CLASS;
}

function clearName(host) {
  host.style.viewTransitionName = '';
  host.style.viewTransitionClass = '';
}

export function prepareMorph(from) {
  const host = findHost(from);
  if (!host) return;
  if (pending) clearName(pending.host);
  const entry = { host, morph: host.dataset.morph };
  applyName(host, entry.morph);
  pending = entry;
  setTimeout(() => {
    if (pending !== entry) return;
    clearName(host);
    pending = null;
  }, UNUSED_CLEAR_MS);
}

export function landMorph(target) {
  const entry = pending;
  if (!entry) return;
  pending = null;
  const host = findHost(target);
  const finish = () => {
    clearName(entry.host);
    if (host) clearName(host);
  };
  if (!host || host.dataset.morph !== entry.morph) {
    finish();
    return;
  }
  applyName(host, entry.morph);
  const transition = document.activeViewTransition;
  if (transition) transition.finished.finally(finish);
  else setTimeout(finish, NO_TRANSITION_CLEAR_MS);
}

const morphHost = (morph) => document.querySelector(`[data-morph="${morph}"]`);

export function useMorphHeader(morph) {
  useLayoutEffect(() => {
    landMorph(morphHost(morph));
  }, [morph]);

  useEffect(() => {
    const onClick = (event) => {
      if (event.target.closest('a[href="/goals"], [data-goals-link]')) prepareMorph(morphHost(morph));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [morph]);
}
