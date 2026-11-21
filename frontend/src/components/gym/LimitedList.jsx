'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './LimitedList.module.css';

export default function LimitedList({ items, render, className, limit = 5 }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, limit);
  const hidden = items.length - limit;
  return (
    <>
      <ul className={className}>{shown.map(render)}</ul>
      {hidden > 0 && (
        <button type="button" className={styles.more} onClick={() => setOpen(value => !value)} aria-expanded={open}>
          {open ? 'Mostrar menos' : `Mostrar mais ${hidden}`}
          <ChevronDown size={16} className={open ? styles.up : ''} aria-hidden="true" />
        </button>
      )}
    </>
  );
}
