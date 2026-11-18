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

  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;
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
    const previous = lastIndex.get(label);
    if (previous !== undefined && previous !== activeIndex && activeIndex !== -1) {
      place(previous, false);
      indicator.getBoundingClientRect();
      requestAnimationFrame(() => place(activeIndex, true));
    } else {
      place(activeIndex, false);
    }
    if (activeIndex !== -1) lastIndex.set(label, activeIndex);
    const onResize = () => place(activeIndex, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeIndex, label]);

  return (
    <nav className={styles.tabs} aria-label={label} ref={navRef}>
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
