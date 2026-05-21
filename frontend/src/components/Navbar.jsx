'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Target, LayoutDashboard, ListChecks, LogOut, UserCircle2 } from 'lucide-react';
import { clearToken, getUserName, saveUserName } from '../lib/auth';
import { getMe } from '../lib/api';
import { useLateGoals } from '../lib/LateGoalsContext';
import styles from './Navbar.module.css';

const links = [
  { href: '/',      label: 'Dashboard', icon: LayoutDashboard },
  { href: '/goals', label: 'Metas',     icon: ListChecks },
];

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [userName, setUserName] = useState('');
  const { lateCount, streak } = useLateGoals();

  useEffect(() => {
    const cached = getUserName();
    if (cached) {
      setUserName(cached);
    } else {
      // Se não tiver no localStorage (ex: sessão anterior), busca da API
      getMe()
        .then(me => {
          saveUserName(me.name);
          setUserName(me.name);
        })
        .catch(() => {});
    }
  }, []);

  const handleLogout = () => {
    clearToken();
    router.push('/login');
  };

  const firstName = userName.split(' ')[0];

  return (
    <header className={styles.header}>
      <nav className={`${styles.nav} glass`}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandIcon}><Target size={20} /></span>
          <span className={styles.brandName}>Goals</span>
        </Link>
 
        <ul className={styles.links}>
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            const showBadge = href === '/goals' && lateCount > 0;
            return (
              <li key={href}>
                <Link href={href} className={`${styles.link} ${active ? styles.active : ''}`}>
                  <span className={styles.linkIconWrap}>
                    <Icon size={16} />
                    {showBadge && (
                      <span className={styles.lateBadge}>
                        {lateCount > 9 ? '9+' : lateCount}
                      </span>
                    )}
                  </span>
                  <span>{label}</span>
                  {active && <span className={styles.activePill} />}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className={styles.right}>
          {/* Streak chip */}
          <div className={`${styles.streakChip} ${streak > 0 ? styles.streakChipActive : ''}`}>
            <svg
              className={`${styles.streakFire} ${streak > 0 ? styles.streakFireActive : styles.streakFireOff}`}
              viewBox="0 0 36 44"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Chama base laranja escuro */}
              <path d="M18 2 C18 2 8 12 6 20 C4 28 8 36 14 39 C11 35 12 30 15 28 C15 33 17 37 18 38 C19 37 21 33 21 28 C24 30 25 35 22 39 C28 36 32 28 30 20 C28 12 18 2 18 2Z" fill={streak > 0 ? '#e25d00' : '#9ca3af'} />
              {/* Chama média laranja */}
              <path d="M18 6 C18 6 10 14 9 21 C8 27 11 33 15 36 C13 32 14 28 17 26 C17 30 18 34 18 35 C18 34 19 30 19 26 C22 28 23 32 21 36 C25 33 28 27 27 21 C26 14 18 6 18 6Z" fill={streak > 0 ? '#f97316' : '#d1d5db'} />
              {/* Chama interna amarela */}
              <path d="M18 12 C18 12 13 18 12 23 C11 27 13 31 16 33 C15 30 16 27 18 25 C18 28 18 31 18 32 C18 31 18 28 18 25 C20 27 21 30 20 33 C23 31 25 27 24 23 C23 18 18 12 18 12Z" fill={streak > 0 ? '#fbbf24' : '#e5e7eb'} />
              {/* Núcleo branco/amarelo claro */}
              <ellipse cx="18" cy="28" rx="3.5" ry="5" fill={streak > 0 ? '#fef9c3' : '#f3f4f6'} />
            </svg>
            <span>{streak}</span>
          </div>

          {firstName && (
            <div className={styles.userChip}>
              <UserCircle2 size={16} />
              <span>{firstName}</span>
            </div>
          )}
          <button className={styles.logoutBtn} onClick={handleLogout} aria-label="Sair">
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>
      </nav>
    </header>
  );
}