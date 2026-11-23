import Link from 'next/link';
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
