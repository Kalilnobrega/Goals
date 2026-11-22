'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, Dumbbell, Target } from 'lucide-react';
import { APP_HOMES, saveLastApp } from '../lib/apps';
import styles from './AppSwitcher.module.css';

export const SWITCHER_APPS = [
  { key: 'goals', label: 'Goals', description: 'Metas, hábitos e tarefas', icon: Target },
  { key: 'gym', label: 'GymGoals', description: 'Treinos, cargas e evolução', icon: Dumbbell },
];

export default function AppSwitcher({ current, theme = 'light', className = '', children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector('button')?.focus();
      }
    };
    const handleScroll = () => setOpen(false);
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [open]);

  useEffect(() => {
    if (open) rootRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open]);

  const choose = (key) => {
    setOpen(false);
    saveLastApp(key);
    const home = APP_HOMES[key];
    if (key !== current || pathname !== home) router.push(home);
  };

  const moveFocus = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...rootRef.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  };

  return (
    <div ref={rootRef} className={`${styles.root} ${theme === 'dark' ? styles.dark : styles.light}`}>
      <button
        type="button"
        className={`${styles.trigger} ${className}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Trocar aplicativo"
        onClick={() => setOpen((value) => !value)}
      >
        {children}
        <ChevronDown size={16} strokeWidth={2.4} className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div id={menuId} className={styles.menu} role="menu" aria-label="Aplicativos" onKeyDown={moveFocus}>
          <p className={styles.menuTitle}>Trocar aplicativo</p>
          {SWITCHER_APPS.map(({ key, label, description, icon: Icon }) => {
            const active = key === current;
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                className={`${styles.item} ${active ? styles.itemActive : ''}`}
                onClick={() => choose(key)}
              >
                <span className={`${styles.itemIcon} ${styles[key]}`}><Icon size={17} strokeWidth={2.4} /></span>
                <span className={styles.itemText}>
                  <span className={styles.itemLabel}>{label}</span>
                  <span className={styles.itemDescription}>{description}</span>
                </span>
                {active && <Check size={17} strokeWidth={2.6} className={styles.check} aria-label="App atual" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
