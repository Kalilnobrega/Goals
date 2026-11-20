'use client';
import { useCallback, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import GymSheet from './GymSheet';
import styles from './GymSelect.module.css';

export default function GymSelect({ value, options, onChange, title, label, hint, grid = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const current = options.find(option => option.value === value);

  const choose = (next) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${className}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={label ? `${label}: ${current?.short ?? current?.label ?? '—'}` : undefined}
      >
        <span className={styles.value}>{current?.short ?? current?.label ?? '—'}</span>
        <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
      </button>
      <GymSheet open={open} onClose={close} title={title}>
        <div className={styles.body}>
          {hint && <p className={styles.hint}>{hint}</p>}
          <div className={grid ? styles.grid : styles.list} role="radiogroup" aria-label={title}>
            {options.map(option => {
              const selected = option.value === value;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`${grid ? styles.cell : styles.row} ${selected ? styles.selected : ''}`}
                  onClick={() => choose(option.value)}
                >
                  <span className={styles.optionLabel}>{option.label}</span>
                  {!grid && selected && <Check size={18} strokeWidth={2.6} className={styles.check} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </GymSheet>
    </>
  );
}
