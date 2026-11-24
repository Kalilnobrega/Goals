'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import styles from './GymSheet.module.css';

const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 0.6;

export default function GymSheet({ open, onClose, title, action = null, children }) {
  const [content, setContent] = useState(open ? { title, action, children } : null);
  const overlayRef = useRef(null);
  const sheetRef = useRef(null);
  const drag = useRef(null);

  if (open && (content?.title !== title || content?.action !== action || content?.children !== children)) {
    setContent({ title, action, children });
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

  const startDrag = (event) => {
    if (closing || event.target.closest('button') || window.matchMedia('(min-width: 768px)').matches) return;
    drag.current = { y: event.clientY, time: event.timeStamp, offset: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    sheetRef.current.style.transition = 'none';
  };

  const moveDrag = (event) => {
    if (!drag.current) return;
    const offset = Math.max(event.clientY - drag.current.y, 0);
    drag.current.offset = offset;
    sheetRef.current.style.transform = `translateY(${offset}px)`;
  };

  const endDrag = (event) => {
    if (!drag.current) return;
    const { offset, time } = drag.current;
    const velocity = offset / Math.max(event.timeStamp - time, 1);
    drag.current = null;
    const sheet = sheetRef.current;
    if (offset > CLOSE_DISTANCE || (offset > 24 && velocity > CLOSE_VELOCITY)) {
      sheet.style.setProperty('--drag-offset', `${offset}px`);
      sheet.style.transition = '';
      sheet.style.transform = '';
      onClose();
      return;
    }
    sheet.style.transition = 'transform var(--dur-base) var(--ease-out)';
    sheet.style.transform = '';
  };

  if (!content) return null;

  return (
    <div
      ref={overlayRef}
      className={`${styles.overlay} ${closing ? styles.overlayClosing : ''}`}
      onClick={(e) => { if (!closing && e.target === overlayRef.current) onClose(); }}
      onAnimationEnd={(e) => { if (closing && e.target === overlayRef.current) setContent(null); }}
    >
      <div ref={sheetRef} className={`${styles.sheet} ${closing ? styles.sheetClosing : ''}`} role="dialog" aria-modal="true" aria-label={content.title}>
        <div
          className={styles.handle}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className={styles.grip} aria-hidden="true" />
          <div className={styles.header}>
            <h2 className={styles.title}>{content.title}</h2>
            <div className={styles.headerButtons}>
              {content.action}
              <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar" disabled={closing}>
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
        <div className={styles.body}>{content.children}</div>
      </div>
    </div>
  );
}

export function SheetAction({ label, active = false, onClick, children }) {
  return (
    <button
      type="button"
      className={`${styles.action} ${active ? styles.actionOn : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
    >
      {children}
    </button>
  );
}
