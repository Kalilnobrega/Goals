'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import Modal from './Modal';
import f from '../styles/forms.module.css';
import styles from './ConfirmDialog.module.css';

const ConfirmContext = createContext(() => Promise.resolve(false));

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);

  const confirmAction = useCallback((options) => {
    resolver.current?.(false);
    return new Promise((resolve) => {
      resolver.current = resolve;
      setRequest(options);
    });
  }, []);

  const finish = useCallback((answer) => {
    resolver.current?.(answer);
    resolver.current = null;
    setRequest(null);
  }, []);

  const close = useCallback(() => finish(false), [finish]);
  const danger = request?.danger ?? true;
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      <Modal open={!!request} onClose={close} title={request?.title} size="sm">
        <div className={styles.content}>
          <span className={`${styles.icon} ${danger ? styles.iconDanger : ''}`}>
            <Icon size={20} />
          </span>
          <div className={styles.message}>
            {[request?.message].flat().filter(Boolean).map((text, index) => (
              <p key={index}>{text}</p>
            ))}
          </div>
        </div>
        <div className={f.submitRow}>
          <button type="button" className={f.btnCancel} onClick={close} autoFocus>
            Cancelar
          </button>
          <button
            type="button"
            className={danger ? styles.btnDanger : f.btnSubmit}
            onClick={() => finish(true)}
          >
            {request?.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
