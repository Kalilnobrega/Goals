'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Target, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react';
import { saveToken } from '../../lib/auth';
import styles from '../login/page.module.css';
import reg from './register.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm]       = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    if (form.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Erro ao criar conta.');
      }

      const data = await res.json();
      const token = data.access_token || data.token;
      if (token) saveToken(token);

      router.push('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const strength = (() => {
    const p = form.password;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 6)  s++;
    if (p.length >= 10) s++;
    if (/[A-Z]/.test(p) && /[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  })();

  const strengthLabels = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];
  const strengthColors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#10b981'];

  return (
    <div className={styles.root}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />
      <div className={styles.orb3} />

      <div className={reg.wrapper}>
        <Link href="/login" className={reg.backLink}>
          <ArrowLeft size={15} /> Voltar ao login
        </Link>

        <div className={`${reg.card} glass-strong`}>
          {/* Header */}
          <div className={styles.cardHeader}>
            <div className={reg.logoRow}>
              <div className={reg.logo}><Target size={35} /></div>
              <span className={reg.logoName}>Goals</span>
            </div>
            <h2 className={styles.cardTitle}>Criar sua conta</h2>
            <p className={styles.cardSub}>
              Já tem conta?{' '}
              <Link href="/login" className={styles.linkInline}>Entrar agora</Link>
            </p>
          </div>

          {error && (
            <div className={styles.errorBox}>
              <span>⚠</span> {error}
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label}>Nome</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Seu nome completo"
                value={form.name}
                onChange={set('name')}
                required
                autoComplete="name"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>E-mail</label>
              <input
                className={styles.input}
                type="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={set('email')}
                required
                autoComplete="email"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Senha</label>
              <div className={styles.passwordWrap}>
                <input
                  className={`${styles.input} ${styles.inputPwd}`}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={set('password')}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPwd(v => !v)}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Strength bar */}
              {form.password && (
                <div className={reg.strengthWrap}>
                  <div className={reg.strengthBar}>
                    {[1,2,3,4].map(n => (
                      <div
                        key={n}
                        className={reg.strengthSeg}
                        style={{ background: n <= strength ? strengthColors[strength] : 'rgba(59,130,246,.1)' }}
                      />
                    ))}
                  </div>
                  <span className={reg.strengthLabel} style={{ color: strengthColors[strength] }}>
                    {strengthLabels[strength]}
                  </span>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Confirmar senha</label>
              <input
                className={`${styles.input} ${form.confirm && form.confirm !== form.password ? reg.inputError : ''}`}
                type="password"
                placeholder="Repita a senha"
                value={form.confirm}
                onChange={set('confirm')}
                required
                autoComplete="new-password"
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? (
                <span className={styles.spinner} />
              ) : (
                <>Criar conta <ArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}