'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Target, CheckCircle2, Eye, EyeOff, Sparkles, ArrowRight } from 'lucide-react';
import { saveToken, saveUserName } from '../../lib/auth';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm]       = useState({ email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // FastAPI OAuth2
      const formData = new URLSearchParams();
      formData.append('username', form.email);
      formData.append('password', form.password);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Email ou senha incorretos.');
      }

      const data = await res.json();
      const token = data.access_token;
      if (token) {
        saveToken(token);
 
        // Busca o nome real do usuário via GET /auth/me
        const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const me = await meRes.json();
          saveUserName(me.name);
        }
      }

      router.push('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.root}>
      {/* Orbs de fundo */}
      <div className={styles.orb1} />
      <div className={styles.orb2} />
      <div className={styles.orb3} />

      <div className={styles.wrapper}>
        {/* Lado esquerdo — branding */}
        <div className={styles.brand}>
          <div className={styles.brandInner}>
          <div className={styles.logoWrapper}>
              <div className={styles.logo}>
                <Target size={35} />
              </div>
              <h1 className={styles.brandTitle}>Goals</h1>
            </div>
            <p className={styles.brandSub}>
              Transforme intenções em conquistas. Organize suas metas, acompanhe seu progresso e celebre cada vitória.
            </p>

            <div className={styles.features}>
              {[
                'Metas organizadas e claras',
                'Tarefas vinculadas a cada objetivo',
                'Progresso visual em tempo real',
              ].map((f, i) => (
                <div key={i} className={styles.feature} style={{ animationDelay: `${i * 120}ms` }}>
                  <CheckCircle2 size={18} className={styles.featureIcon} />
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Floating card decorativo */}
          <div className={`${styles.floatCard} ${styles.floatCard1}`}>
            <span className={styles.floatIcon}>🎯</span>
            <div>
              <div className={styles.floatLabel}>Meta concluída</div>
              <div className={styles.floatVal}>Aprender Inglês</div>
            </div>
          </div>
          <div className={`${styles.floatCard} ${styles.floatCard2}`}>
            <span className={styles.floatIcon}>✅</span>
            <div>
              <div className={styles.floatLabel}>Progresso hoje</div>
              <div className={styles.floatVal}>3 tarefas feitas</div>
            </div>
          </div>
        </div>

        {/* Lado direito — formulário */}
        <div className={styles.formSide}>
          <div className={`${styles.card} glass-strong`}>
            <div className={styles.cardHeader}>
              <div className={styles.badge}>
                <Sparkles size={12} /> Bem-vindo de volta
              </div>
              <h2 className={styles.cardTitle}>Entrar na sua conta</h2>
              <p className={styles.cardSub}>
                Não tem conta?{' '}
                <Link href="/register" className={styles.linkInline}>Criar agora</Link>
              </p>
            </div>

            {error && (
              <div className={styles.errorBox}>
                <span>⚠</span> {error}
              </div>
            )}

            <form className={styles.form} onSubmit={handleSubmit}>
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
                <div className={styles.labelRow}>
                  <label className={styles.label}>Senha</label>
                  <Link href="/forgot-password" className={styles.forgot}>Esqueceu?</Link>
                </div>
                <div className={styles.passwordWrap}>
                  <input
                    className={`${styles.input} ${styles.inputPwd}`}
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={set('password')}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPwd(v => !v)}
                    aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
              >
                {loading ? (
                  <span className={styles.spinner} />
                ) : (
                  <>Entrar <ArrowRight size={16} /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}