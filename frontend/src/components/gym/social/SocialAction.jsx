import Link from 'next/link';
import { UserRound } from 'lucide-react';
import Floating from '../../Floating';
import styles from './social.module.css';

export function SocialActionButton({ href, label, icon: Icon }) {
  return (
    <Link href={href} className={styles.actionDesktop}>
      <Icon size={17} strokeWidth={2.4} /> {label}
    </Link>
  );
}

export function SocialActionFab({ href, label, icon: Icon }) {
  return (
    <Floating>
      <Link href={href} className={styles.fab} aria-label={label} title={label}>
        <Icon size={26} strokeWidth={2.4} />
      </Link>
    </Floating>
  );
}

export function SocialProfileLink({ username }) {
  if (!username) return null;
  return (
    <Link href={`/gym/u/${username}`} className={styles.profileLink} aria-label="Meu perfil" title="Meu perfil">
      <UserRound size={19} strokeWidth={2.2} />
    </Link>
  );
}
