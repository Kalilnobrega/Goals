import { useCallback, useEffect, useRef } from 'react';

export function useHideOnScroll(ref, query, resetKey) {
  const revealRef = useRef(() => {});

  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    const mobile = window.matchMedia(query);
    let last = window.scrollY;
    let offset = 0;
    let frame = 0;
    let settle = 0;

    const apply = (value, animate) => {
      offset = value;
      const height = header.offsetHeight || 1;
      header.style.transition = animate ? '' : 'none';
      header.style.transform = `translateY(${-value}px)`;
      header.style.opacity = String(1 - (value / height) * 0.6);
      header.dataset.hidden = value >= height ? 'true' : 'false';
    };

    const snap = () => {
      const height = header.offsetHeight;
      const hide = window.scrollY > height && offset > height / 2;
      apply(hide ? height : 0, true);
    };

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - last;
      last = y;
      if (!mobile.matches || y <= 0) {
        apply(0, offset !== 0);
        return;
      }
      const height = header.offsetHeight;
      apply(Math.min(height, Math.max(0, offset + delta)), false);
      clearTimeout(settle);
      settle = setTimeout(snap, 140);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    revealRef.current = () => {
      clearTimeout(settle);
      if (offset !== 0) apply(0, true);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      revealRef.current = () => {};
    };
  }, [ref, query, resetKey]);

  return useCallback(() => revealRef.current(), []);
}
