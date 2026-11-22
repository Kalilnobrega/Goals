'use client';
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import styles from './Floating.module.css';

const subscribe = () => () => {};
const findShell = () => document.querySelector('[data-gym-shell]') ?? document.body;
const REDUCED = '(prefers-reduced-motion: reduce)';

export function popOut(element) {
  if (!element || window.matchMedia(REDUCED).matches) return null;
  return element.animate(
    [{ scale: 1, opacity: 1 }, { scale: 0.3, opacity: 0 }],
    { duration: 160, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
  );
}

export default function Floating({ children }) {
  const host = useSyncExternalStore(subscribe, findShell, () => null);
  const ref = useRef(null);

  useLayoutEffect(() => {
    const node = ref.current;
    return () => {
      if (!node || 'popped' in node.dataset) return;
      queueMicrotask(() => {
        if (node.isConnected || !host?.isConnected) return;
        leave(node, host);
      });
    };
  }, [host]);

  if (!host) return null;
  return createPortal(<div ref={ref} className={styles.floating} data-floating="">{children}</div>, host);
}

function leave(node, host) {
  const ghost = node.cloneNode(true);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.style.animation = 'none';
  ghost.querySelectorAll('*').forEach(el => { el.style.animation = 'none'; });
  host.appendChild(ghost);
  const animation = popOut(ghost.firstElementChild);
  if (!animation) {
    ghost.remove();
    return;
  }
  animation.finished.catch(() => {}).then(() => ghost.remove());
}
