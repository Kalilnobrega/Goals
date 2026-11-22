import Link from 'next/link';
import Avatar from './Avatar';
import styles from './social.module.css';

export default function PersonRow({ person, children, meta }) {
  return (
    <li className={styles.row}>
      <Link href={`/gym/u/${person.username}`} className={styles.rowLink}>
        <Avatar name={person.name} />
        <span className={styles.rowText}>
          <span className={styles.rowName}>{person.name}</span>
          <span className={styles.rowHandle}>@{person.username}{meta ? ` · ${meta}` : ''}</span>
        </span>
      </Link>
      {children && <div className={styles.rowActions}>{children}</div>}
    </li>
  );
}
