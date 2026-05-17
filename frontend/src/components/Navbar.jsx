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
  const { lateCount } = useLateGoals();

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