'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import styles from './GymSheet.module.css';

export default function GymSheet({ open, onClose, title, children }) {
  const [content, setContent] = useState(open ? { title, children } : null);
  const overlayRef = useRef(null);

  if (open && (content?.title !== title || content?.children !== children)) {
    setContent({ title, children });
  }

  const closing = !open && content !== null;

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!content) return null;

  return (
    <div
      ref={overlayRef}
      className={`${styles.overlay} ${closing ? styles.overlayClosing : ''}`}
      onClick={(e) => { if (!closing && e.target === overlayRef.current) onClose(); }}
      onAnimationEnd={(e) => { if (closing && e.target === overlayRef.current) setContent(null); }}
    >
      <div className={`${styles.sheet} ${closing ? styles.sheetClosing : ''}`} role="dialog" aria-modal="true" aria-label={content.title}>
        <div className={styles.grip} aria-hidden="true" />
        <div className={styles.header}>
          <h2 className={styles.title}>{content.title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar" disabled={closing}>
            <X size={20} />
          </button>
        </div>
        <div className={styles.body}>{content.children}</div>
      </div>
    </div>
  );
}
