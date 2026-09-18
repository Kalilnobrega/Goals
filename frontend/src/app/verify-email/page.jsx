'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import styles from './verify.module.css';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const params  = useSearchParams();
  const router  = useRouter();
  const token   = params.get('token');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token de verificação não encontrado.');
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/verify-email?token=${token}`, {
      method: 'POST',
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setStatus('success');
          setMessage(data.message || 'E-mail verificado com sucesso!');
          setTimeout(() => router.push('/login'), 3000);
        } else {
          setStatus('error');
          setMessage(data.detail || 'Link de verificação inválido ou expirado.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Erro ao conectar com o servidor.');
      });
  }, [token]);

  return (
    <div className={styles.root}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />

      <div className={`${styles.card} glass-strong`}>
        {status === 'loading' && (
          <>
            <div className={styles.iconWrap} style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}>
              <Loader2 size={32} className={styles.spinner} />
            </div>
            <h1 className={styles.title}>Verificando...</h1>
            <p className={styles.sub}>Aguarde enquanto confirmamos seu e-mail.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className={styles.iconWrap} style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              <CheckCircle2 size={32} />
            </div>
            <h1 className={styles.title}>E-mail verificado!</h1>
            <p className={styles.sub}>{message}</p>
            <p className={styles.redirect}>Redirecionando para o login em instantes...</p>
            <Link href="/login" className={styles.btn}>
              Ir para o login agora
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className={styles.iconWrap} style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
              <XCircle size={32} />
            </div>
            <h1 className={styles.title}>Link inválido</h1>
            <p className={styles.sub}>{message}</p>
            <p className={styles.tip}>O link pode ter expirado. Tente criar uma nova conta ou entre em contato.</p>
            <Link href="/register" className={styles.btn}>
              Criar conta novamente
            </Link>
          </>
        )}
      </div>
    </div>
  );
}