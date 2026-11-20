'use client';
import styles from './GymSwitch.module.css';

export default function GymSwitch({ options, value, onChange, label }) {
  const index = Math.max(0, options.findIndex(option => option.value === value));
  return (
    <div className={styles.switch} role="radiogroup" aria-label={label}>
      <span className={styles.thumb} style={{ transform: `translateX(${index * 100}%)` }} aria-hidden="true" />
      {options.map((option, i) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={i === index}
          className={`${styles.option} ${i === index ? styles.optionOn : ''}`}
          onClick={() => onChange(i === index ? options[(i + 1) % options.length].value : option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
