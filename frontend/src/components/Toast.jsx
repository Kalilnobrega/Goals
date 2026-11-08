'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import styles from './Toast.module.css';

const ToastContext = createContext(() => {});
const MAX_TOASTS = 3;
const ICONS = { success: CheckCircle2, info: Info, danger: AlertTriangle };

function ToastItem({ toast, onDismiss, onRemove }) {
  const Icon = ICONS[toast.tone] || ICONS.success;

  useEffect(() => {
    if (toast.leaving) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.action ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.leaving, toast.action, onDismiss]);

  const finish = (event) => {
    if (toast.leaving && event.target === event.currentTarget) onRemove(toast.id);
  };

  const runAction = () => {
    onDismiss(toast.id);
    toast.action.onClick();
  };

  return (
    <div className={`${styles.slot} ${toast.leaving ? styles.slotLeaving : ''}`} onAnimationEnd={finish}>
      <div className={styles.slotInner}>
        <div className={`${styles.toast} ${styles[toast.tone] || styles.success} glass-strong`}>
          <Icon size={18} className={styles.icon} />
          <span className={styles.message}>{toast.message}</span>
          {toast.action && (
            <button type="button" className={styles.action} onClick={runAction}>
              {toast.action.label}
            </button>
          )}
          <button type="button" className={styles.close} onClick={() => onDismiss(toast.id)} aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, leaving: true } : t)));
  }, []);

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((options) => {
    const toast = { tone: 'success', ...(typeof options === 'string' ? { message: options } : options) };
    nextId.current += 1;
    const id = nextId.current;
    setToasts(prev => {
      const active = prev.filter(t => !t.leaving);
      const overflow = active.length >= MAX_TOASTS ? active[0].id : null;
      return [...prev.map(t => (t.id === overflow ? { ...t, leaving: true } : t)), { ...toast, id }];
    });
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toasts.length > 0 && createPortal(
        <div className={styles.region} role="status" aria-live="polite">
          {toasts.map(toast => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} onRemove={remove} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
