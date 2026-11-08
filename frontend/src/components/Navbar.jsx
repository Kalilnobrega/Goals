'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Target, House, ListChecks, ChartColumn, UserCircle2 } from 'lucide-react';
import { getUserName, saveUserName } from '../lib/auth';
import { getMe, getStreak } from '../lib/api';
import { useLateGoals } from '../lib/LateGoalsContext';
import styles from './Navbar.module.css';
import { prefetchTab, prefetchAllTabs } from '../lib/prefetchTabs';
import { useSwipeTabs } from '../lib/useSwipeTabs';
import { announceTabSlide, isCoarsePointer, subscribeCoarsePointer } from '../lib/pageSlide';

const links = [
  { href: '/',      label: 'Início',       icon: House },
  { href: '/goals', label: 'Metas',        icon: ListChecks },
  { href: '/stats', label: 'Estatísticas', icon: ChartColumn },
];

const subscribeToUserName = (onChange) => {
  window.addEventListener('username-changed', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('username-changed', onChange);
    window.removeEventListener('storage', onChange);
  };
};

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const userName = useSyncExternalStore(subscribeToUserName, getUserName, () => '');
  const coarse = useSyncExternalStore(subscribeCoarsePointer, isCoarsePointer, () => false);
  const { lateCount, streak, setStreak } = useLateGoals();
  const [pendingHref, setPendingHref] = useState(null);
  const [seenPath, setSeenPath] = useState(pathname);
  const linksRef = useRef(null);
  const indicatorRef = useRef(null);

  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setPendingHref(null);
  }

  const isCurrent = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const activeHref = pendingHref ?? links.find(l => isCurrent(l.href))?.href ?? null;
  const currentIndex = links.findIndex(l => isCurrent(l.href));
  const tabSlide = (href) => {
    const target = links.findIndex(l => l.href === href);
    if (currentIndex === -1 || target === currentIndex) return undefined;
    return [target > currentIndex ? 'tab-forward' : 'tab-back'];
  };
  const snapshotSlide = (href) => (coarse ? undefined : tabSlide(href));

  const tabIndex = links.findIndex(l => l.href === pathname);
  useSwipeTabs(tabIndex !== -1, (step) => {
    const next = links[tabIndex + step];
    if (!next) return;
    prefetchTab(next.href);
    setPendingHref(next.href);
    announceTabSlide(tabSlide(next.href));
    router.push(next.href, { transitionTypes: snapshotSlide(next.href) });
  });

  useLayoutEffect(() => {
    const place = () => {
      const indicator = indicatorRef.current;
      const active = activeHref && linksRef.current?.querySelector(`[data-href="${activeHref}"]`);
      if (!indicator) return;
      if (!active) {
        indicator.dataset.hidden = 'true';
        return;
      }
      delete indicator.dataset.hidden;
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
      if (!indicator.dataset.ready) requestAnimationFrame(() => { indicator.dataset.ready = 'true'; });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [activeHref, lateCount]);

  const [seenStreak, setSeenStreak] = useState(streak);
  const [bump, setBump] = useState(0);

  if (streak !== seenStreak) {
    setSeenStreak(streak);
    if (seenStreak !== null && streak > seenStreak) setBump(b => b + 1);
  }

  useEffect(() => {
    if (!getUserName()) {
      getMe()
        .then(me => {
          saveUserName(me.name);
          window.dispatchEvent(new Event('username-changed'));
        })
        .catch(() => {});
    }
    getStreak()
      .then(s => setStreak(s.current_streak ?? 0))
      .catch(() => {});
  }, [setStreak]);

  useEffect(() => {
    if (!('requestIdleCallback' in window)) {
      const timer = setTimeout(prefetchAllTabs, 600);
      return () => clearTimeout(timer);
    }
    const idle = requestIdleCallback(prefetchAllTabs, { timeout: 1500 });
    return () => cancelIdleCallback(idle);
  }, [pathname]);

  const firstName = userName.split(' ')[0];
  const streakValue = streak ?? 0;

  return (
    <header className={styles.header}>
      <nav className={`${styles.nav} glass`} style={{ viewTransitionName: 'app-navbar' }} data-navbar="">
        <Link href="/" className={styles.brand} transitionTypes={snapshotSlide('/')} onClick={() => announceTabSlide(tabSlide('/'))}>
          <span className={styles.brandIcon}><Target size={20} /></span>
          <span className={styles.brandName}>Goals</span>
        </Link>
 
        <ul className={styles.links} ref={linksRef}>
          <li className={styles.indicator} ref={indicatorRef} aria-hidden="true" />
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === activeHref;
            const showBadge = href === '/goals' && lateCount > 0;
            return (
              <li key={href}>
                <Link
                  href={href}
                  scroll={!(href === '/goals' && pathname.startsWith('/goals/'))}
                  transitionTypes={snapshotSlide(href)}
                  data-href={href}
                  className={`${styles.link} ${active ? styles.active : ''}`}
                  aria-current={isCurrent(href) ? 'page' : undefined}
                  onClick={() => {
                    if (isCurrent(href)) return;
                    setPendingHref(href);
                    announceTabSlide(tabSlide(href));
                  }}
                  onPointerEnter={() => prefetchTab(href)}
                  onPointerDown={() => prefetchTab(href)}
                  onFocus={() => prefetchTab(href)}
                >
                  <span className={styles.linkIconWrap}>
                    <Icon size={16} />
                    {showBadge && (
                      <span className={styles.lateBadge}>
                        {lateCount > 9 ? '9+' : lateCount}
                      </span>
                    )}
                  </span>
                  <span className={styles.linkLabel}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className={styles.right}>
          {/* Streak chip */}
          <div className={`${styles.streakChip} ${streakValue > 0 ? styles.streakChipActive : ''}`}>
            <span key={`fire-${bump}`} className={`${styles.fireWrap} ${bump ? styles.firePop : ''}`}>
            <svg
              className={`${styles.streakFire} ${streakValue > 0 ? styles.streakFireActive : styles.streakFireOff}`}
              viewBox="0 0 36 44"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Chama base laranja escuro */}
              <path d="M18 2 C18 2 8 12 6 20 C4 28 8 36 14 39 C11 35 12 30 15 28 C15 33 17 37 18 38 C19 37 21 33 21 28 C24 30 25 35 22 39 C28 36 32 28 30 20 C28 12 18 2 18 2Z" fill={streakValue > 0 ? '#e25d00' : '#9ca3af'} />
              {/* Chama média laranja */}
              <path d="M18 6 C18 6 10 14 9 21 C8 27 11 33 15 36 C13 32 14 28 17 26 C17 30 18 34 18 35 C18 34 19 30 19 26 C22 28 23 32 21 36 C25 33 28 27 27 21 C26 14 18 6 18 6Z" fill={streakValue > 0 ? '#f97316' : '#d1d5db'} />
              {/* Chama interna amarela */}
              <path d="M18 12 C18 12 13 18 12 23 C11 27 13 31 16 33 C15 30 16 27 18 25 C18 28 18 31 18 32 C18 31 18 28 18 25 C20 27 21 30 20 33 C23 31 25 27 24 23 C23 18 18 12 18 12Z" fill={streakValue > 0 ? '#fbbf24' : '#e5e7eb'} />
              {/* Núcleo branco/amarelo claro */}
              <ellipse cx="18" cy="28" rx="3.5" ry="5" fill={streakValue > 0 ? '#fef9c3' : '#f3f4f6'} />
            </svg>
            </span>
            <span className={styles.streakNumber}>
              <span key={`n-${bump}`} className={bump ? styles.numberIn : ''}>{streakValue}</span>
            </span>
          </div>

          {firstName && (
            <Link
              href="/account"
              className={`${styles.userChip} ${pathname.startsWith('/account') ? styles.userChipActive : ''}`}
              aria-label="Minha conta"
            >
              <UserCircle2 size={16} />
              <span>{firstName}</span>
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}