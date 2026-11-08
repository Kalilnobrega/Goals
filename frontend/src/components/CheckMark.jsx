import styles from './CheckMark.module.css';

export default function CheckMark({ checked, size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={styles.svg} aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" className={`${styles.mark} ${checked ? styles.on : ''}`} />
    </svg>
  );
}
