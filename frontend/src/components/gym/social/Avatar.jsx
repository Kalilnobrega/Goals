import styles from './social.module.css';

export function initials(name) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts.at(-1)[0] : '';
  return `${first}${last}`.toUpperCase();
}

export default function Avatar({ name, size = 'md' }) {
  return (
    <span className={`${styles.avatar} ${styles[`avatar_${size}`]}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
