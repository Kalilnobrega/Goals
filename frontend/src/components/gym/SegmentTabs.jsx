'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';
import { useGymTabNav } from '../../lib/gymTabs';
import styles from './SegmentTabs.module.css';

export const WORKOUT_TABS = [
  { href: '/gym/plans', label: 'Planos' },
  { href: '/gym/workouts', label: 'Fichas' },
  { href: '/gym/exercises', label: 'Exercícios' },
  { href: '/gym/history', label: 'Histórico' },
];

const lastIndex = new Map();

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
    let frame = 0;
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
    const from = fromIndex.current;
    if (from !== undefined && from !== activeIndex && activeIndex !== -1) {
      place(from, false);
      indicator.getBoundingClientRect();
      frame = requestAnimationFrame(() => {
        place(activeIndex, true);
        fromIndex.current = activeIndex;
      });
    } else {
      place(activeIndex, false);
    }
    if (activeIndex !== -1) lastIndex.set(label, activeIndex);
    const onResize = () => place(activeIndex, false);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [activeIndex, label]);

  return (
    <nav className={styles.tabs} aria-label={label} ref={navRef} data-segment-tabs="">
      <span className={styles.indicator} ref={indicatorRef} aria-hidden="true" />
      {tabs.map(({ href, label: text }) => {
        const current = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            {...linkProps(href)}
            className={`${styles.tab} ${current ? styles.active : ''}`}
            aria-current={current ? 'page' : undefined}
          >
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
