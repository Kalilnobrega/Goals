'use client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import styles from './success.module.css';

export default function RegisterSuccessPage() {
  const params = useSearchParams();
  const email  = params.get('email') || '';

  return (
    <div className={styles.root}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={`${styles.card} glass-strong`}>
        <div className={styles.iconWrap}>
          <Mail size={32} />
        </div>

        <h1 className={styles.title}>Verifique seu e-mail</h1>

        <p className={styles.sub}>
          Enviamos um link de verificação para
        </p>
        {email && <div className={styles.emailChip}>{email}</div>}

        <p className={styles.tip}>
          Clique no link no e-mail para ativar sua conta. O link expira em <strong>24 horas</strong>.
        </p>

        <div className={styles.steps}>
          <div className={styles.step}>
            <CheckCircle2 size={16} style={{ color: 'var(--b400)' }} />
            <span>Abra sua caixa de entrada</span>
          </div>
          <div className={styles.step}>
            <CheckCircle2 size={16} style={{ color: 'var(--b400)' }} />
            <span>Procure o e-mail do Goals App</span>
          </div>
          <div className={styles.step}>
            <CheckCircle2 size={16} style={{ color: 'var(--b400)' }} />
            <span>Clique em "Verificar E-mail"</span>
          </div>
        </div>

        <Link href="/login" className={styles.loginBtn}>
          Ir para o login <ArrowRight size={15} />
        </Link>

        <p className={styles.spam}>
          Não recebeu? Verifique sua pasta de spam.
        </p>
      </div>
    </div>
  );
}