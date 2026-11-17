'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './ProgressTabs.module.css';

const TABS = [
  { href: '/gym/progress', label: 'Exercícios' },
  { href: '/gym/progress/body', label: 'Peso corporal' },
];

export default function ProgressTabs() {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs} aria-label="Evolução">
      {TABS.map(({ href, label }) => {
        const current = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.tab} ${current ? styles.active : ''}`}
            aria-current={current ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
