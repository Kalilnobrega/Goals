'use client';
import { usePathname, useRouter } from 'next/navigation';
import { announceTabSlide, leaveTab } from './pageSlide';
import { prefetchGymTab } from './gymPrefetch';

export const GYM_TAB_ORDER = ['/gym', '/gym/plans', '/gym/workouts', '/gym/exercises', '/gym/history', '/gym/progress'];

export function useGymTabNav() {
  const pathname = usePathname();
  const router = useRouter();
  const current = GYM_TAB_ORDER.indexOf(pathname);

  const tabSlide = (href) => {
    const target = GYM_TAB_ORDER.indexOf(href);
    if (current === -1 || target === -1 || target === current) return undefined;
    return [target > current ? 'tab-forward' : 'tab-back'];
  };

  const goTo = (href) => {
    prefetchGymTab(href);
    const types = tabSlide(href);
    leaveTab(types, () => {
      announceTabSlide(types);
      router.push(href);
    });
  };

  const linkProps = (href) => ({
    onPointerEnter: () => prefetchGymTab(href),
    onPointerDown: () => prefetchGymTab(href),
    onFocus: () => prefetchGymTab(href),
    onClick: (event) => {
      if (href === pathname || !tabSlide(href)) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      goTo(href);
    },
  });

  const step = (direction) => {
    const next = GYM_TAB_ORDER[current + direction];
    if (next) goTo(next);
  };

  return { linkProps, step, swipeable: current !== -1 };
}
