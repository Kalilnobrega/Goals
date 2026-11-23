'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Trophy, Users } from 'lucide-react';
import { useToast } from '../../Toast';
import styles from './social.module.css';

const TABS = [
  { href: '/gym/social', label: 'Amigos', icon: Users, match: (path) => path === '/gym/social' },
  { href: '/gym/social/desafios', label: 'Desafios', icon: Trophy, match: (path) => path.startsWith('/gym/social/desafios') },
];

export default function SocialTabs() {
  const pathname = usePathname();
  const toast = useToast();

  return (
    <nav className={styles.pills} aria-label="Social">
      {TABS.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.pill} ${active ? styles.pillActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={15} /> {label}
          </Link>
        );
      })}
      <button
        type="button"
        className={styles.pill}
        aria-disabled="true"
        onClick={() => toast({ tone: 'info', message: 'Feed chega em breve.' })}
      >
        Feed <span className={styles.soon}>Em breve</span>
      </button>
    </nav>
  );
}
