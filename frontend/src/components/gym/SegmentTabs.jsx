'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SegmentTabs.module.css';

export const WORKOUT_TABS = [
  { href: '/gym/plans', label: 'Planos' },
  { href: '/gym/workouts', label: 'Fichas' },
  { href: '/gym/exercises', label: 'Exercícios' },
  { href: '/gym/history', label: 'Histórico' },
];

export default function SegmentTabs({ tabs, label }) {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs} aria-label={label}>
      {tabs.map(({ href, label: text }) => {
        const current = pathname === href;
        return (
          <Link
            key={href}
            href={href}
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
