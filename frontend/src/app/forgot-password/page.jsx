'use client';
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Target, ArrowLeft, ArrowRight, Eye, EyeOff, Mail, CheckCircle2, KeyRound } from 'lucide-react';
import { forgotPassword, resetPassword } from '../../lib/api';
import styles from '../login/page.module.css';
import fp from './forgot.module.css';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}

function ForgotPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token  = params.get('token');

  const [email, setEmail]         = useState('');
  const [sent, setSent]           = useState(false);
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch {
      setError('Erro ao enviar o e-mail. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setResetDone(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Link inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />
      <div className={styles.orb3} />

      <div className={fp.wrapper}>
        <Link href="/login" className={fp.backLink}>
          <ArrowLeft size={15} /> Voltar ao login
        </Link>

        <div className={`${fp.card} glass-strong`}>
          <div className={fp.logoRow}>
            <div className={fp.logo}><Target size={35} /></div>
            <span className={fp.logoName}>Goals</span>
          </div>

          {/* ── Pedir link de redefinição ── */}
          {!token && !sent && (
            <>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Esqueceu sua senha?</h2>
                <p className={styles.cardSub}>
                  Digite seu e-mail e enviaremos um link para redefinir sua senha.
                </p>
              </div>

              {error && (
                <div className={styles.errorBox}>
                  <span>⚠</span> {error}
                </div>
              )}

              <form className={styles.form} onSubmit={handleRequestSubmit}>
                <div className={styles.field}>
                  <label className={styles.label}>E-mail</label>
                  <input
                    className={styles.input}
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                <button type="submit" className={styles.submitBtn} disabled={loading}>
                  {loading ? <span className={styles.spinner} /> : <>Enviar link <ArrowRight size={16} /></>}
                </button>
              </form>
            </>
          )}

          {/* ── Link enviado ── */}
          {!token && sent && (
            <div className={fp.center}>
              <div className={fp.iconWrap}>
                <Mail size={32} />
              </div>
              <h2 className={styles.cardTitle}>Verifique seu e-mail</h2>
              <p className={styles.cardSub}>
                Se <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha em instantes.
              </p>
              <p className={fp.spam}>Não recebeu? Verifique sua pasta de spam.</p>
            </div>
          )}

          {/* ── Definir nova senha ── */}
          {token && !resetDone && (
            <>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Crie uma nova senha</h2>
                <p className={styles.cardSub}>Escolha uma nova senha para sua conta.</p>
              </div>

              {error && (
                <div className={styles.errorBox}>
                  <span>⚠</span> {error}
                </div>
              )}

              <form className={styles.form} onSubmit={handleResetSubmit}>
                <div className={styles.field}>
                  <label className={styles.label}>Nova senha</label>
                  <div className={styles.passwordWrap}>
                    <input
                      className={`${styles.input} ${styles.inputPwd}`}
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className={styles.eyeBtn}
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Confirmar nova senha</label>
                  <input
                    className={styles.input}
                    type="password"
                    placeholder="Repita a senha"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>

                <button type="submit" className={styles.submitBtn} disabled={loading}>
                  {loading ? <span className={styles.spinner} /> : <>Redefinir senha <KeyRound size={16} /></>}
                </button>
              </form>
            </>
          )}

          {/* ── Senha redefinida ── */}
          {token && resetDone && (
            <div className={fp.center}>
              <div className={fp.iconWrap}>
                <CheckCircle2 size={32} />
              </div>
              <h2 className={styles.cardTitle}>Senha redefinida!</h2>
              <p className={styles.cardSub}>Redirecionando para o login em instantes...</p>
              <Link href="/login" className={fp.loginBtn}>
                Ir para o login agora <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
