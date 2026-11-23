'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Newspaper, Trophy, Users } from 'lucide-react';
import styles from './social.module.css';

const TABS = [
  { href: '/gym/social', label: 'Feed', icon: Newspaper, match: (path) => path === '/gym/social' || path.startsWith('/gym/social/post') || path.startsWith('/gym/social/publicar') },
  { href: '/gym/social/desafios', label: 'Desafios', icon: Trophy, match: (path) => path.startsWith('/gym/social/desafios') },
  { href: '/gym/social/amigos', label: 'Amigos', icon: Users, match: (path) => path.startsWith('/gym/social/amigos') },
];

export default function SocialTabs() {
  const pathname = usePathname();

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
    </nav>
  );
}
