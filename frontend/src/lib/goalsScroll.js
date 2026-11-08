import { useLayoutEffect } from 'react';

let savedScroll = null;

export function rememberGoalsScroll() {
  savedScroll = window.scrollY;
}

export function takeGoalsScroll() {
  const y = savedScroll;
  savedScroll = null;
  return y;
}

export function useOpenAtTop(key) {
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [key]);
}
