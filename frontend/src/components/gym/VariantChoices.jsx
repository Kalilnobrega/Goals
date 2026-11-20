import Link from 'next/link';
import { variantRows } from '../../lib/gym';
import styles from './VariantChoices.module.css';

export default function VariantChoices({ variants, current, onSelect, href, isDisabled, chipClassName, activeClassName, spaced }) {
  const rows = variantRows(variants, current);
  if (!rows.length) return null;
  const labelled = rows.some(row => row.key === 'grip');
  return (
    <div className={`${styles.rows} ${spaced ? styles.spaced : ''}`}>
      {rows.map(row => (
        <div key={row.key} className={styles.row} role="group" aria-label={row.label}>
          {labelled && <span className={styles.label}>{row.label}</span>}
          <div className={styles.chips}>
            {row.options.map(option => {
              const chipClass = `${chipClassName} ${option.active ? activeClassName : ''}`;
              return href ? (
                <Link
                  key={option.key}
                  href={href(option.variant)}
                  replace
                  className={chipClass}
                  aria-current={option.active ? 'page' : undefined}
                >
                  {option.label}
                </Link>
              ) : (
                <button
                  key={option.key}
                  type="button"
                  className={chipClass}
                  aria-pressed={option.active}
                  disabled={isDisabled?.(option)}
                  onClick={() => onSelect(option.variant)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
