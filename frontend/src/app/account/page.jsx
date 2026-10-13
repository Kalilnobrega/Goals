'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserRound, KeyRound, Trash2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import Navbar from '../../components/Navbar';
import Modal from '../../components/Modal';
import { getMe, updateName, changePassword, deleteAccount } from '../../lib/api';
import { clearToken, saveToken, saveRefreshToken, saveUserName } from '../../lib/auth';
import forms from '../../styles/forms.module.css';
import styles from './page.module.css';

function errorMessage(err, fallback) {
  const detail = err.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

function CardHeader({ icon: Icon, title, sub, danger }) {
  return (
    <div className={styles.cardHeader}>
      <span className={`${styles.cardIcon} ${danger ? styles.cardIconDanger : ''}`}><Icon size={16} /></span>
      <div>
        <h2 className={styles.cardTitle}>{title}</h2>
        {sub && <p className={styles.cardSub}>{sub}</p>}
      </div>
    </div>
  );
}

function Feedback({ error, success }) {
  if (error) return <p className={styles.error}>{error}</p>;
  if (success) return <p className={styles.success}><CheckCircle2 size={14} /> {success}</p>;
  return null;
}

function NameCard({ me, onSaved }) {
  const [name, setName]       = useState(me.name);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!name.trim()) {
      setError('O nome não pode ficar vazio.');
      return;
    }
    setLoading(true);
    try {
      const updated = await updateName(name.trim());
      setName(updated.name);
      onSaved(updated);
      setSuccess('Nome atualizado.');
    } catch (err) {
      setError(errorMessage(err, 'Erro ao atualizar o nome.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`${styles.card} glass`}>
      <CardHeader icon={UserRound} title="Perfil" sub={me.email} />
      <form className={forms.form} onSubmit={handleSubmit}>
        <div className={forms.field}>
          <label className={forms.label} htmlFor="name">Nome</label>
          <input
            id="name"
            className={forms.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoComplete="name"
            required
          />
        </div>
        <Feedback error={error} success={success} />
        <div className={forms.submitRow}>
          <button
            type="submit"
            className={forms.btnSubmit}
            disabled={loading || name.trim() === me.name}
          >
            {loading ? 'Salvando...' : 'Salvar nome'}
          </button>
        </div>
      </form>
    </section>
  );
}

function PasswordCard({ me }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  if (!me.has_password) {
    return (
      <section className={`${styles.card} glass`}>
        <CardHeader icon={KeyRound} title="Senha" />
        <p className={styles.note}>Sua conta usa login com o Google, então não há senha para alterar.</p>
      </section>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (password.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const tokens = await changePassword(current, password);
      saveToken(tokens.access_token);
      saveRefreshToken(tokens.refresh_token);
      setCurrent('');
      setPassword('');
      setConfirm('');
      setSuccess('Senha alterada. As outras sessões foram desconectadas.');
    } catch (err) {
      setError(errorMessage(err, 'Erro ao alterar a senha.'));
    } finally {
      setLoading(false);
    }
  };

  const type = showPwd ? 'text' : 'password';

  return (
    <section className={`${styles.card} glass`}>
      <CardHeader icon={KeyRound} title="Senha" sub="Ao alterar, você será desconectado dos outros dispositivos" />
      <form className={forms.form} onSubmit={handleSubmit}>
        <div className={forms.field}>
          <label className={forms.label} htmlFor="current-password">Senha atual</label>
          <div className={styles.passwordWrap}>
            <input
              id="current-password"
              className={forms.input}
              type={type}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? 'Ocultar senhas' : 'Mostrar senhas'}
            >
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div className={forms.row}>
          <div className={forms.field}>
            <label className={forms.label} htmlFor="new-password">Nova senha</label>
            <input
              id="new-password"
              className={forms.input}
              type={type}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className={forms.field}>
            <label className={forms.label} htmlFor="confirm-password">Confirmar</label>
            <input
              id="confirm-password"
              className={forms.input}
              type={type}
              placeholder="Repita a senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
        </div>
        <Feedback error={error} success={success} />
        <div className={forms.submitRow}>
          <button type="submit" className={forms.btnSubmit} disabled={loading}>
            {loading ? 'Alterando...' : 'Alterar senha'}
          </button>
        </div>
      </form>
    </section>
  );
}

const CONFIRM_WORD = 'EXCLUIR';

function DeleteCard({ me }) {
  const router = useRouter();
  const [open, setOpen]         = useState(false);
  const [password, setPassword] = useState('');
  const [word, setWord]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const close = () => {
    setOpen(false);
    setPassword('');
    setWord('');
    setError('');
  };

  const canDelete = me.has_password ? password.length > 0 : word === CONFIRM_WORD;

  const handleDelete = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await deleteAccount(me.has_password ? password : null);
      clearToken();
      router.replace('/login');
    } catch (err) {
      setError(errorMessage(err, 'Erro ao excluir a conta.'));
      setLoading(false);
    }
  };

  return (
    <section className={`${styles.card} ${styles.dangerCard} glass`}>
      <CardHeader
        icon={Trash2}
        title="Excluir conta"
        sub="Apaga permanentemente sua conta, metas, tarefas e histórico"
        danger
      />
      <div className={forms.submitRow}>
        <button type="button" className={styles.btnDanger} onClick={() => setOpen(true)}>
          <Trash2 size={15} /> Excluir minha conta
        </button>
      </div>

      <Modal open={open} onClose={close} title="Excluir conta">
        <form className={forms.form} onSubmit={handleDelete}>
          <p className={styles.warning}>
            Essa ação não pode ser desfeita. Todas as suas metas, tarefas, registros e sequências serão apagados.
          </p>
          {me.has_password ? (
            <div className={forms.field}>
              <label className={forms.label} htmlFor="delete-password">Digite sua senha para confirmar</label>
              <input
                id="delete-password"
                className={forms.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </div>
          ) : (
            <div className={forms.field}>
              <label className={forms.label} htmlFor="delete-word">Digite {CONFIRM_WORD} para confirmar</label>
              <input
                id="delete-word"
                className={forms.input}
                value={word}
                onChange={(e) => setWord(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>
          )}
          <Feedback error={error} />
          <div className={forms.submitRow}>
            <button type="button" className={forms.btnCancel} onClick={close}>Cancelar</button>
            <button type="submit" className={styles.btnDanger} disabled={!canDelete || loading}>
              {loading ? 'Excluindo...' : 'Excluir permanentemente'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

export default function AccountPage() {
  const [me, setMe]       = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getMe().then(setMe).catch(() => setError('Erro ao carregar sua conta.'));
  }, []);

  const handleNameSaved = (updated) => {
    saveUserName(updated.name);
    setMe((prev) => ({ ...prev, name: updated.name }));
    window.dispatchEvent(new Event('username-changed'));
  };

  return (
    <>
      <Navbar />
      <main className={styles.main}>
        <div className={`${styles.pageHero} glass`}>
          <h1 className={styles.title}>Minha conta</h1>
          <p className={styles.sub}>Gerencie seu nome, senha e conta</p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {!me && !error && <div className={`${styles.skeleton} glass`} />}

        {me && (
          <>
            <NameCard me={me} onSaved={handleNameSaved} />
            <PasswordCard me={me} />
            <DeleteCard me={me} />
          </>
        )}
      </main>
    </>
  );
}
