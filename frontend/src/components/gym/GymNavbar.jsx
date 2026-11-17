'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Dumbbell, House, ClipboardList, Library, History, TrendingUp, LayoutGrid } from 'lucide-react';
import { saveLastApp } from '../../lib/apps';
import styles from './GymNavbar.module.css';

const links = [
  { href: '/gym', label: 'Início', icon: House },
  { href: '/gym/workouts', label: 'Treinos', icon: ClipboardList },
  { href: '/gym/exercises', label: 'Exercícios', icon: Library },
  { href: '/gym/history', label: 'Histórico', icon: History },
  { href: '/gym/progress', label: 'Evolução', icon: TrendingUp },
];

export default function GymNavbar() {
  const pathname = usePathname();
  useEffect(() => {
    saveLastApp('gym');
  }, []);

  if (pathname.startsWith('/gym/session/')) return null;

  const isCurrent = (href) => (href === '/gym' ? pathname === '/gym' : pathname.startsWith(href));

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/gym" className={styles.brand}>
            <span className={styles.brandMark}><Dumbbell size={18} strokeWidth={2.4} /></span>
            <span className={styles.brandName}>Gym<span>Goals</span></span>
          </Link>

          <nav className={styles.topLinks} aria-label="GymGoals">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`${styles.topLink} ${isCurrent(href) ? styles.topLinkActive : ''}`}
                aria-current={isCurrent(href) ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>

          <Link href="/apps" className={styles.switch} aria-label="Trocar aplicativo" title="Trocar aplicativo">
            <LayoutGrid size={16} />
            <span>Apps</span>
          </Link>
        </div>
      </header>

      <nav className={styles.tabbar} aria-label="GymGoals">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`${styles.tab} ${isCurrent(href) ? styles.tabActive : ''}`}
            aria-current={isCurrent(href) ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={isCurrent(href) ? 2.4 : 2} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
