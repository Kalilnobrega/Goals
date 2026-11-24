'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import Modal from './Modal';
import GymSheet from './gym/GymSheet';
import gymTheme from './gym/theme.module.css';
import sheet from './gym/sheet.module.css';
import f from '../styles/forms.module.css';
import styles from './ConfirmDialog.module.css';

const ConfirmContext = createContext(() => Promise.resolve(false));

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);
  const pathname = usePathname();
  const gym = pathname === '/gym' || pathname.startsWith('/gym/');

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
  const messages = [request?.message].flat().filter(Boolean);

  if (gym) {
    return (
      <ConfirmContext.Provider value={confirmAction}>
        {children}
        <div className={gymTheme.theme}>
          <GymSheet open={!!request} onClose={close} title={request?.title ?? ''}>
            {request && (
              <div className={sheet.stack}>
                {messages.map((text, index) => <p key={index} className={sheet.text}>{text}</p>)}
                <div className={sheet.actions}>
                  <button type="button" className={danger ? sheet.danger : sheet.primary} onClick={() => finish(true)}>
                    {request.confirmLabel || 'Confirmar'}
                  </button>
                  <button type="button" className={sheet.secondary} onClick={close} autoFocus>
                    {request.cancelLabel || 'Cancelar'}
                  </button>
                </div>
              </div>
            )}
          </GymSheet>
        </div>
      </ConfirmContext.Provider>
    );
  }

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      <Modal open={!!request} onClose={close} title={request?.title} size="sm">
        <div className={styles.content}>
          <span className={`${styles.icon} ${danger ? styles.iconDanger : ''}`}>
            <Icon size={20} />
          </span>
          <div className={styles.message}>
            {messages.map((text, index) => (
              <p key={index}>{text}</p>
            ))}
          </div>
        </div>
        <div className={f.submitRow}>
          <button type="button" className={f.btnCancel} onClick={close} autoFocus>
            {request?.cancelLabel || 'Cancelar'}
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
