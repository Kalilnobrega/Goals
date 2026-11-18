'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Dumbbell, House, ClipboardList, History, TrendingUp, LayoutGrid, Play } from 'lucide-react';
import { saveLastApp } from '../../lib/apps';
import { useStartWorkout } from './StartWorkout';
import styles from './GymNavbar.module.css';

const links = [
  { href: '/gym', label: 'Início', icon: House },
  { href: '/gym/plans', label: 'Treinos', icon: ClipboardList, also: ['/gym/workouts', '/gym/exercises'] },
  { href: '/gym/history', label: 'Histórico', icon: History },
  { href: '/gym/progress', label: 'Evolução', icon: TrendingUp },
];

export default function GymNavbar() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const openStart = useStartWorkout();

  useEffect(() => {
    saveLastApp('gym');
  }, []);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (y < 64) setHidden(false);
      else if (y > last + 8) setHidden(true);
      else if (y < last - 8) setHidden(false);
      if (Math.abs(y - last) > 8) last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  if (pathname.startsWith('/gym/session/')) return null;

  const isCurrent = (href) => {
    if (href === '/gym') return pathname === '/gym';
    return [href, ...(links.find(l => l.href === href)?.also ?? [])].some(path => pathname.startsWith(path));
  };

  const renderTab = ({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      className={`${styles.tab} ${isCurrent(href) ? styles.tabActive : ''}`}
      aria-current={isCurrent(href) ? 'page' : undefined}
    >
      <Icon size={22} strokeWidth={isCurrent(href) ? 2.4 : 2} />
      <span>{label}</span>
    </Link>
  );

  return (
    <>
      <header className={`${styles.header} ${hidden ? styles.headerHidden : ''}`}>
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

          <button type="button" className={styles.topStart} onClick={openStart}>
            <Play size={15} fill="currentColor" /> Treinar
          </button>

          <Link href="/apps" className={styles.switch} aria-label="Trocar aplicativo" title="Trocar aplicativo">
            <LayoutGrid size={16} />
            <span>Apps</span>
          </Link>
        </div>
      </header>

      <nav className={styles.tabbar} aria-label="GymGoals">
        {links.slice(0, 2).map(renderTab)}
        <div className={styles.tabStartSlot}>
          <button type="button" className={styles.tabStart} onClick={openStart} aria-label="Iniciar treino">
            <Play size={26} fill="currentColor" />
          </button>
        </div>
        {links.slice(2).map(renderTab)}
      </nav>
    </>
  );
}
