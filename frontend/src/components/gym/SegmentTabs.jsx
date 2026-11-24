'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';
import { CalendarDays, ClipboardList, Dumbbell, History } from 'lucide-react';
import { useGymTabNav } from '../../lib/gymTabs';
import styles from './SegmentTabs.module.css';

export const WORKOUT_TABS = [
  { href: '/gym/plans', label: 'Planos', icon: CalendarDays },
  { href: '/gym/workouts', label: 'Fichas', icon: ClipboardList },
  { href: '/gym/exercises', label: 'Exercícios', icon: Dumbbell },
  { href: '/gym/history', label: 'Histórico', icon: History },
];

const lastIndex = new Map();
const inFlight = new Map();
const SLIDE_MS = 380;
const SLIDE_EASING = 'cubic-bezier(0.55, 0, 0.25, 1.06)';

const box = (link) => ({ x: link.offsetLeft, w: link.offsetWidth });
const frame = ({ x, w }) => ({ transform: `translateX(${x}px)`, width: `${w}px` });

export default function SegmentTabs({ tabs, label }) {
  const pathname = usePathname();
  const { linkProps } = useGymTabNav();
  const navRef = useRef(null);
  const indicatorRef = useRef(null);
  const activeIndex = tabs.findIndex(tab => tab.href === pathname);

  const fromIndex = useRef(lastIndex.get(label));

  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const from = fromIndex.current;
    let raf = 0;
    const place = (index, animate) => {
      const link = nav.querySelectorAll('a')[index];
      if (!link) {
        indicator.dataset.hidden = '';
        return;
      }
      delete indicator.dataset.hidden;
      indicator.style.transition = animate ? '' : 'none';
      indicator.style.width = `${link.offsetWidth}px`;
      indicator.style.transform = `translateX(${link.offsetLeft}px)`;
    };
    const flight = inFlight.get(label);
    const elapsed = flight ? performance.now() - flight.start : Infinity;
    const target = nav.querySelectorAll('a')[activeIndex];
    if (flight && flight.index === activeIndex && target && elapsed < SLIDE_MS) {
      const to = box(target);
      place(activeIndex, false);
      indicator.animate([frame(flight.from), frame(to)], { duration: SLIDE_MS, easing: SLIDE_EASING, delay: -elapsed, fill: 'backwards' });
      fromIndex.current = activeIndex;
    } else if (from !== undefined && from !== activeIndex && activeIndex !== -1) {
      place(from, false);
      indicator.getBoundingClientRect();
      raf = requestAnimationFrame(() => {
        place(activeIndex, true);
        fromIndex.current = activeIndex;
      });
    } else {
      place(activeIndex, false);
    }
    inFlight.delete(label);
    if (activeIndex !== -1) lastIndex.set(label, activeIndex);
    const onResize = () => place(activeIndex, false);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [activeIndex, label]);

  const startSlide = (event, index) => {
    if (index === activeIndex || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    const link = nav?.querySelectorAll('a')[index];
    if (!indicator || !link || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = indicator.getBoundingClientRect();
    const from = { x: rect.left - nav.getBoundingClientRect().left, w: rect.width };
    const to = box(link);
    indicator.getAnimations().forEach(animation => animation.cancel());
    indicator.style.transition = 'none';
    indicator.style.width = `${to.w}px`;
    indicator.style.transform = `translateX(${to.x}px)`;
    indicator.animate([frame(from), frame(to)], { duration: SLIDE_MS, easing: SLIDE_EASING });
    inFlight.set(label, { index, from, start: event.timeStamp });
    lastIndex.set(label, index);
  };

  return (
    <nav className={styles.tabs} aria-label={label} ref={navRef} data-segment-tabs="">
      <span className={styles.indicator} ref={indicatorRef} aria-hidden="true" />
      {tabs.map(({ href, label: text, icon: Icon }, index) => {
        const current = pathname === href;
        const props = linkProps(href);
        return (
          <Link
            key={href}
            href={href}
            {...props}
            onClick={(event) => {
              startSlide(event, index);
              props.onClick(event);
            }}
            className={`${styles.tab} ${current ? styles.active : ''}`}
            aria-current={current ? 'page' : undefined}
          >
            {Icon && <Icon size={16} className={styles.icon} aria-hidden="true" />}
            <span className={styles.text}>{text}</span>
          </Link>
        );
      })}
    </nav>
  );
}
