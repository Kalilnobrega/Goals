'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SegmentTabs.module.css';

export const PROGRESS_TABS = [
  { href: '/gym/progress', label: 'Resumo' },
  { href: '/gym/progress/exercises', label: 'Exercícios' },
  { href: '/gym/progress/body', label: 'Peso' },
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
