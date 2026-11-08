import { useLayoutEffect } from 'react';

const NAVBAR_CLEARANCE = 88;
const BOTTOM_CLEARANCE = 16;

let savedScroll = null;
let openedHref = null;

export function rememberGoalsScroll() {
  savedScroll = window.scrollY;
}

export function restoreGoalsScroll() {
  const y = savedScroll;
  const href = openedHref;
  savedScroll = null;
  openedHref = null;
  if (y) window.scrollTo({ top: y, behavior: 'instant' });

  const card = href && document.querySelector(`[data-card-href="${href}"]`);
  if (!card) return;
  card.dataset.revealed = '';
  card.getAnimations().forEach(animation => animation.finish());

  const rect = card.getBoundingClientRect();
  if (rect.height === 0) return;
  if (rect.top >= NAVBAR_CLEARANCE && rect.bottom <= window.innerHeight - BOTTOM_CLEARANCE) return;
  const centered = window.scrollY + rect.top - Math.max(NAVBAR_CLEARANCE, (window.innerHeight - rect.height) / 2);
  window.scrollTo({ top: centered, behavior: 'instant' });
}

export function useOpenAtTop(href) {
  useLayoutEffect(() => {
    openedHref = href;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [href]);
}
