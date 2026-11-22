'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Dumbbell, House, ClipboardList, TrendingUp, Play, Users, UserCircle2 } from 'lucide-react';
import { getUserName, saveUserName } from '../../lib/auth';
import { getFitnessProfile, getFriends, getMe } from '../../lib/api';
import { saveLastApp } from '../../lib/apps';
import { useStartWorkout } from './StartWorkout';
import { GYM_TAB_ORDER, useGymTabNav } from '../../lib/gymTabs';
import { prefetchGymTabs } from '../../lib/gymPrefetch';
import { useSwipeTabs } from '../../lib/useSwipeTabs';
import { useHideOnScroll } from '../../lib/useHideOnScroll';
import GymStreak from './GymStreak';
import AppSwitcher from '../AppSwitcher';
import styles from './GymNavbar.module.css';

const links = [
  { href: '/gym', label: 'Início', icon: House },
  { href: '/gym/plans', label: 'Treinos', icon: ClipboardList, also: ['/gym/workouts', '/gym/exercises', '/gym/history'] },
  { href: '/gym/progress', label: 'Evolução', icon: TrendingUp },
  { href: '/gym/social', label: 'Social', icon: Users, also: ['/gym/u/'] },
];

const subscribeToUserName = (onChange) => {
  window.addEventListener('username-changed', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('username-changed', onChange);
    window.removeEventListener('storage', onChange);
  };
};

export default function GymNavbar() {
  const pathname = usePathname();
  const headerRef = useRef(null);
  const openStart = useStartWorkout();
  const { linkProps, step, swipeable } = useGymTabNav();
  const router = useRouter();
  const userName = useSyncExternalStore(subscribeToUserName, getUserName, () => '');
  const [requests, setRequests] = useState(0);

  useEffect(() => {
    let active = true;
    getFitnessProfile()
      .then((profile) => (profile.username ? getFriends() : null))
      .then((friends) => { if (active) setRequests(friends?.incoming.length ?? 0); })
      .catch(() => {});
    return () => { active = false; };
  }, [pathname]);

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
    if (getUserName()) return;
    getMe()
      .then((me) => {
        saveUserName(me.name);
        window.dispatchEvent(new Event('username-changed'));
      })
      .catch(() => {});
  }, []);

  const revealHeader = useHideOnScroll(headerRef, '(max-width: 767px)', pathname);

  if (pathname.startsWith('/gym/session/')) return null;

  const isCurrent = (href) => {
    if (href === '/gym') return pathname === '/gym';
    return [href, ...(links.find(l => l.href === href)?.also ?? [])].some(path => pathname.startsWith(path));
  };

  const badgeFor = (href) => (href === '/gym/social' && requests > 0 ? (requests > 9 ? '9+' : String(requests)) : null);

  const renderTab = ({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      {...linkProps(href)}
      className={`${styles.tab} ${isCurrent(href) ? styles.tabActive : ''}`}
      aria-current={isCurrent(href) ? 'page' : undefined}
      aria-label={badgeFor(href) ? `${label}, ${requests} ${requests === 1 ? 'pedido de amizade' : 'pedidos de amizade'}` : undefined}
    >
      <span className={styles.tabIcon}>
        <Icon size={22} strokeWidth={isCurrent(href) ? 2.4 : 2} />
        {badgeFor(href) && <span className={styles.badge}>{badgeFor(href)}</span>}
      </span>
      <span>{label}</span>
    </Link>
  );

  return (
    <>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.headerInner}>
          <AppSwitcher current="gym" theme="dark" className={styles.brand}>
            <span className={styles.brandMark}><Dumbbell size={20} strokeWidth={2.4} /></span>
            <span className={styles.brandName}>Gym<span>Goals</span></span>
          </AppSwitcher>

          <nav className={styles.topLinks} aria-label="GymGoals">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                {...linkProps(href)}
                className={`${styles.topLink} ${isCurrent(href) ? styles.topLinkActive : ''}`}
                aria-current={isCurrent(href) ? 'page' : undefined}
              >
                {label}
                {badgeFor(href) && <span className={styles.topBadge}>{badgeFor(href)}</span>}
              </Link>
            ))}
          </nav>

          <button type="button" className={styles.topStart} onClick={openStart}>
            <Play size={15} fill="currentColor" /> Treinar
          </button>

          <div className={styles.right}>
            <GymStreak pathname={pathname} onBump={revealHeader} />
            <Link
              href="/gym/account"
              className={`${styles.userChip} ${pathname.startsWith('/gym/account') ? styles.userChipActive : ''}`}
              aria-label="Minha conta"
              title="Minha conta"
            >
              <UserCircle2 size={16} />
              {userName && <span>{userName.split(' ')[0]}</span>}
            </Link>
          </div>
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
