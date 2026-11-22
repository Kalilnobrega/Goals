'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, Check, Eye, EyeOff, KeyRound, LoaderCircle, LogOut, Trash2, UserRound, X } from 'lucide-react';
import {
  changePassword, checkUsername, deleteAccount, getFitnessProfile, getMe, logout, updateName, updateUsername,
} from '../../../lib/api';
import { clearToken, getRefreshToken, saveRefreshToken, saveToken, saveUserName } from '../../../lib/auth';
import { apiError } from '../../../lib/gym';
import { useToast } from '../../../components/Toast';
import GymSheet from '../../../components/gym/GymSheet';
import styles from './page.module.css';

const CONFIRM_WORD = 'EXCLUIR';

function Card({ icon: Icon, title, sub, danger, children }) {
  return (
    <section className={`${styles.card} ${danger ? styles.cardDanger : ''}`}>
      <div className={styles.cardHeader}>
        <span className={`${styles.cardIcon} ${danger ? styles.cardIconDanger : ''}`}><Icon size={17} /></span>
        <div className={styles.cardText}>
          <h2 className={styles.cardTitle}>{title}</h2>
          {sub && <p className={styles.cardSub}>{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function NameCard({ me, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(me.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('O nome não pode ficar vazio.');
    setError('');
    setSaving(true);
    try {
      const updated = await updateName(name.trim());
      setName(updated.name);
      onSaved(updated.name);
      toast('Nome atualizado');
    } catch (err) {
      setError(apiError(err, 'Não foi possível atualizar o nome.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card icon={UserRound} title="Nome" sub="Como você aparece no GymGoals e no Goals">
      <form className={styles.form} onSubmit={submit} noValidate>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoComplete="name"
          aria-label="Nome"
        />
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.save} disabled={saving || name.trim() === me.name}>
          {saving ? 'Salvando...' : 'Salvar nome'}
        </button>
      </form>
    </Card>
  );
}

function UsernameCard({ current, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState(current ?? '');
  const [check, setCheck] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const normalized = value.trim().replace(/^@/, '').toLowerCase();
  const unchanged = normalized === (current ?? '');

  useEffect(() => {
    if (!normalized || unchanged) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      checkUsername(normalized)
        .then((result) => { if (active) setCheck(result); })
        .catch(() => {});
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [normalized, unchanged]);

  const result = check?.username === normalized && !unchanged ? check : null;
  const checking = !!normalized && !unchanged && !result;

  const submit = async (e) => {
    e.preventDefault();
    if (!normalized || unchanged || result?.available === false) return;
    setError('');
    setSaving(true);
    try {
      const profile = await updateUsername(normalized);
      setValue(profile.username);
      onSaved(profile.username);
      toast(`Username @${profile.username} salvo`);
    } catch (err) {
      setError(apiError(err, 'Não foi possível salvar o username.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      icon={AtSign}
      title="Username"
      sub={current ? `Você é @${current}` : 'É por ele que seus amigos vão te encontrar'}
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <span className={styles.prefixWrap}>
          <span className={styles.prefix}>@</span>
          <input
            className={`${styles.input} ${styles.prefixed}`}
            value={value}
            onChange={(e) => {
              setValue(e.target.value.replace(/\s/g, '').toLowerCase());
              setError('');
            }}
            maxLength={21}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            placeholder="seu.username"
            aria-label="Username"
            aria-describedby="username-status"
          />
        </span>
        <p id="username-status" className={styles.status} aria-live="polite">
          {error ? (
            <span className={styles.error}>{error}</span>
          ) : checking ? (
            <span className={styles.statusMuted}><LoaderCircle size={14} className={styles.spin} /> Verificando...</span>
          ) : result?.available ? (
            <span className={styles.statusOk}><Check size={14} /> @{result.username} está disponível</span>
          ) : result ? (
            <span className={styles.error}><X size={14} /> {result.reason}</span>
          ) : (
            <span className={styles.statusMuted}>3 a 20 caracteres: letras, números, ponto e _</span>
          )}
        </p>
        <button
          type="submit"
          className={styles.save}
          disabled={saving || !normalized || unchanged || !result?.available}
        >
          {saving ? 'Salvando...' : current ? 'Trocar username' : 'Salvar username'}
        </button>
      </form>
    </Card>
  );
}

function PasswordCard({ me }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!me.has_password) {
    return (
      <Card icon={KeyRound} title="Senha">
        <p className={styles.note}>Sua conta usa login com o Google, então não há senha para alterar.</p>
      </Card>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!current) return setError('Digite sua senha atual.');
    if (password.length < 6) return setError('A nova senha deve ter pelo menos 6 caracteres.');
    if (password !== confirm) return setError('As senhas não coincidem.');
    setError('');
    setSaving(true);
    try {
      const tokens = await changePassword(current, password);
      saveToken(tokens.access_token);
      saveRefreshToken(tokens.refresh_token);
      setCurrent('');
      setPassword('');
      setConfirm('');
      toast('Senha alterada. As outras sessões foram desconectadas.');
    } catch (err) {
      setError(apiError(err, 'Não foi possível alterar a senha.'));
    } finally {
      setSaving(false);
    }
  };

  const type = show ? 'text' : 'password';

  return (
    <Card icon={KeyRound} title="Senha" sub="Ao alterar, os outros dispositivos são desconectados">
      <form className={styles.form} onSubmit={submit} noValidate>
        <label className={styles.field}>
          <span className={styles.label}>Senha atual</span>
          <span className={styles.passwordWrap}>
            <input
              className={styles.input}
              type={type}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className={styles.eye}
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Ocultar senhas' : 'Mostrar senhas'}
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Nova senha</span>
            <input
              className={styles.input}
              type={type}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Confirmar</span>
            <input
              className={styles.input}
              type={type}
              placeholder="Repita a senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.save} disabled={saving}>
          {saving ? 'Alterando...' : 'Alterar senha'}
        </button>
      </form>
    </Card>
  );
}

function LogoutCard() {
  const router = useRouter();

  const handleLogout = () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) logout(refreshToken).catch(() => {});
    clearToken();
    router.push('/login');
  };

  return (
    <Card icon={LogOut} title="Sessão" sub="Desconectar deste dispositivo">
      <button type="button" className={styles.secondary} onClick={handleLogout}>
        <LogOut size={16} /> Sair da conta
      </button>
    </Card>
  );
}

function DeleteCard({ me }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const close = useCallback(() => {
    setOpen(false);
    setPassword('');
    setWord('');
    setError('');
  }, []);

  const canDelete = me.has_password ? password.length > 0 : word === CONFIRM_WORD;

  const submit = async (e) => {
    e.preventDefault();
    if (!canDelete) return;
    setError('');
    setDeleting(true);
    try {
      await deleteAccount(me.has_password ? password : null);
      clearToken();
      router.replace('/login');
    } catch (err) {
      setError(apiError(err, 'Não foi possível excluir a conta.'));
      setDeleting(false);
    }
  };

  return (
    <Card icon={Trash2} title="Excluir conta" sub="Apaga sua conta do GymGoals e do Goals para sempre" danger>
      <button type="button" className={styles.danger} onClick={() => setOpen(true)}>
        <Trash2 size={16} /> Excluir minha conta
      </button>

      <GymSheet open={open} onClose={close} title="Excluir conta">
        <form className={styles.form} onSubmit={submit} noValidate>
          <p className={styles.warning}>
            Essa ação não pode ser desfeita. Seus treinos, fichas, planos, cargas, pesagens e também suas metas e
            tarefas do Goals serão apagados.
          </p>
          {me.has_password ? (
            <label className={styles.field}>
              <span className={styles.label}>Digite sua senha para confirmar</span>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          ) : (
            <label className={styles.field}>
              <span className={styles.label}>Digite {CONFIRM_WORD} para confirmar</span>
              <input
                className={styles.input}
                value={word}
                onChange={(e) => setWord(e.target.value)}
                autoComplete="off"
              />
            </label>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.dangerSolid} disabled={!canDelete || deleting}>
            {deleting ? 'Excluindo...' : 'Excluir permanentemente'}
          </button>
        </form>
      </GymSheet>
    </Card>
  );
}

export default function GymAccountPage() {
  const [me, setMe] = useState(null);
  const [username, setUsername] = useState(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getMe(), getFitnessProfile()])
      .then(([user, profile]) => {
        setMe(user);
        setUsername(profile.username ?? null);
      })
      .catch(() => setError('Não foi possível carregar sua conta.'));
  }, []);

  const handleNameSaved = (name) => {
    saveUserName(name);
    setMe((prev) => ({ ...prev, name }));
    window.dispatchEvent(new Event('username-changed'));
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <h1 className={styles.title}>Minha conta</h1>
        <p className={styles.subtitle}>{me ? me.email : 'Nome, username, senha e sessão'}</p>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {!me && !error && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando sua conta">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeletonTall} />
        </div>
      )}

      {me && (
        <>
          <NameCard me={me} onSaved={handleNameSaved} />
          <UsernameCard current={username} onSaved={setUsername} />
          <PasswordCard me={me} />
          <LogoutCard />
          <DeleteCard me={me} />
        </>
      )}
    </div>
  );
}
