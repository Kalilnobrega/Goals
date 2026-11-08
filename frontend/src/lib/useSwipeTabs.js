'use client';
import { useEffect, useRef } from 'react';

const MIN_DISTANCE = 60;
const MAX_DURATION_MS = 700;
const HORIZONTAL_RATIO = 1.5;
const EDGE_GUARD = 24;
const IGNORE = 'input, textarea, select, [contenteditable="true"], [data-drag-handle], [role="dialog"], [data-no-swipe]';

function scrollsSideways(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth <= node.clientWidth) continue;
    const overflow = getComputedStyle(node).overflowX;
    if (overflow === 'auto' || overflow === 'scroll') return true;
  }
  return false;
}

export function useSwipeTabs(enabled, onSwipe) {
  const handler = useRef(onSwipe);

  useEffect(() => {
    handler.current = onSwipe;
  });

  useEffect(() => {
    if (!enabled) return;
    let start = null;

    const onStart = (event) => {
      start = null;
      if (event.touches.length !== 1 || document.querySelector('[role="dialog"]')) return;
      const touch = event.touches[0];
      if (touch.clientX < EDGE_GUARD || touch.clientX > window.innerWidth - EDGE_GUARD) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(IGNORE) || scrollsSideways(target)) return;
      start = { x: touch.clientX, y: touch.clientY, at: performance.now() };
    };

    const onEnd = (event) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const quick = performance.now() - start.at <= MAX_DURATION_MS;
      start = null;
      if (!quick || Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return;
      handler.current(dx < 0 ? 1 : -1);
    };

    const onCancel = () => { start = null; };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled]);
}
