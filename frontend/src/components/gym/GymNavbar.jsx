'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Dumbbell, House, ClipboardList, TrendingUp, LayoutGrid, Play, Users } from 'lucide-react';
import { saveLastApp } from '../../lib/apps';
import { useStartWorkout } from './StartWorkout';
import { useToast } from '../Toast';
import { GYM_TAB_ORDER, useGymTabNav } from '../../lib/gymTabs';
import { prefetchGymTabs } from '../../lib/gymPrefetch';
import { useSwipeTabs } from '../../lib/useSwipeTabs';
import { useHideOnScroll } from '../../lib/useHideOnScroll';
import styles from './GymNavbar.module.css';

const links = [
  { href: '/gym', label: 'Início', icon: House },
  { href: '/gym/plans', label: 'Treinos', icon: ClipboardList, also: ['/gym/workouts', '/gym/exercises', '/gym/history'] },
  { href: '/gym/progress', label: 'Evolução', icon: TrendingUp },
  { href: '/gym/social', label: 'Social', icon: Users, soon: true },
];

const SOON_MESSAGE = 'Social em construção: desafios, feed e amigos chegam em breve.';

export default function GymNavbar() {
  const pathname = usePathname();
  const headerRef = useRef(null);
  const openStart = useStartWorkout();
  const toast = useToast();
  const announceSoon = () => toast({ tone: 'info', message: SOON_MESSAGE });
  const { linkProps, step, swipeable } = useGymTabNav();
  const router = useRouter();

  useEffect(() => {
    const prefetch = () => {
      GYM_TAB_ORDER.forEach(href => router.prefetch(href));
      prefetchGymTabs();
    };
    if (!('requestIdleCallback' in window)) {
      const timer = setTimeout(prefetch, 600);
      return () => clearTimeout(timer);
    }
    const idle = requestIdleCallback(prefetch, { timeout: 1500 });
    return () => cancelIdleCallback(idle);
  }, [router, pathname]);
  useSwipeTabs(swipeable && !pathname.startsWith('/gym/session/'), step);

  useEffect(() => {
    saveLastApp('gym');
  }, []);

  useHideOnScroll(headerRef, '(max-width: 767px)', pathname);

  if (pathname.startsWith('/gym/session/')) return null;

  const isCurrent = (href) => {
    if (href === '/gym') return pathname === '/gym';
    return [href, ...(links.find(l => l.href === href)?.also ?? [])].some(path => pathname.startsWith(path));
  };

  const renderTab = ({ href, label, icon: Icon, soon }) => (soon ? (
    <button
      key={href}
      type="button"
      className={`${styles.tab} ${styles.tabSoon}`}
      onClick={announceSoon}
      aria-disabled="true"
      aria-label={`${label}, em construção`}
    >
      <span className={styles.tabSoonIcon}>
        <Icon size={22} strokeWidth={2} />
        <span className={styles.soonBadge}>Em breve</span>
      </span>
      <span>{label}</span>
    </button>
  ) : (
    <Link
      key={href}
      href={href}
      {...linkProps(href)}
      className={`${styles.tab} ${isCurrent(href) ? styles.tabActive : ''}`}
      aria-current={isCurrent(href) ? 'page' : undefined}
    >
      <Icon size={22} strokeWidth={isCurrent(href) ? 2.4 : 2} />
      <span>{label}</span>
    </Link>
  ));

  return (
    <>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/gym" {...linkProps('/gym')} className={styles.brand}>
            <span className={styles.brandMark}><Dumbbell size={18} strokeWidth={2.4} /></span>
            <span className={styles.brandName}>Gym<span>Goals</span></span>
          </Link>

          <nav className={styles.topLinks} aria-label="GymGoals">
            {links.map(({ href, label, soon }) => (soon ? (
              <button
                key={href}
                type="button"
                className={`${styles.topLink} ${styles.topLinkSoon}`}
                onClick={announceSoon}
                aria-disabled="true"
              >
                {label} <span className={styles.soonTag}>Em breve</span>
              </button>
            ) : (
              <Link
                key={href}
                href={href}
                {...linkProps(href)}
                className={`${styles.topLink} ${isCurrent(href) ? styles.topLinkActive : ''}`}
                aria-current={isCurrent(href) ? 'page' : undefined}
              >
                {label}
              </Link>
            )))}
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
