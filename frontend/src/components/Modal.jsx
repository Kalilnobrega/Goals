'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

export default function Modal({ open, onClose, title, children, size }) {
  const overlayRef = useRef(null);
  const [content, setContent] = useState(open ? { title, children } : null);

  if (open && (content?.title !== title || content?.children !== children)) {
    setContent({ title, children });
  }

  const closing = !open && content !== null;

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!content || typeof document === 'undefined') return null;

  const finishClosing = (e) => {
    if (closing && e.target === overlayRef.current) setContent(null);
  };

  return createPortal(
    <div
      className={`${styles.overlay} ${closing ? styles.overlayClosing : ''}`}
      ref={overlayRef}
      onClick={(e) => { if (!closing && e.target === overlayRef.current) onClose(); }}
      onAnimationEnd={finishClosing}
    >
      <div
        className={`${styles.modal} ${size === 'sm' ? styles.modalSm : ''} ${closing ? styles.modalClosing : ''} glass-strong`}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{content.title}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Fechar" disabled={closing}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.body}>{content.children}</div>
      </div>
    </div>,
    document.body
  );
}
