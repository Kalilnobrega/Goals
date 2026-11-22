'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, AtSign, Building2, Check, Globe, Lock, Pencil, Shield, Target, Users, PersonStanding, Eye, EyeOff, KeyRound, LoaderCircle, LogOut, Trash2, UserRound, X } from 'lucide-react';
import {
  changePassword, checkUsername, createGym, deleteAccount, deleteGym, getBlocks, getFitnessProfile, getGyms, getMe, logout,
  renameGym, setCurrentGym, unblockUser, updateName, updateUsername, updateVisibility,
} from '../../../lib/api';
import { saveLastApp } from '../../../lib/apps';
import { clearToken, getRefreshToken, saveRefreshToken, saveToken, saveUserName } from '../../../lib/auth';
import { apiError } from '../../../lib/gym';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';
import GymSheet from '../../../components/gym/GymSheet';
import BodyMap, { useBodyType } from '../../../components/gym/BodyMap';
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

const VISIBILITY_OPTIONS = [
  {
    key: 'public',
    label: 'Público',
    icon: Globe,
    description: 'Qualquer pessoa vê seus números e recordes. Os últimos treinos ficam só para amigos.',
  },
  {
    key: 'friends',
    label: 'Amigos',
    icon: Users,
    description: 'Só seus amigos veem seus números, recordes e últimos treinos.',
  },
  {
    key: 'private',
    label: 'Privado',
    icon: Lock,
    description: 'Ninguém vê seus treinos. Seu nome e @ continuam aparecendo na busca.',
  },
];

function PrivacyCard({ initial, hasUsername }) {
  const toast = useToast();
  const [visibility, setVisibility] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState([]);

  useEffect(() => {
    if (!hasUsername) return;
    getBlocks().then(setBlocked).catch(() => {});
  }, [hasUsername]);

  const choose = async (key) => {
    if (key === visibility || saving) return;
    const previous = visibility;
    setVisibility(key);
    setSaving(true);
    try {
      await updateVisibility(key);
      toast('Privacidade atualizada');
    } catch (err) {
      setVisibility(previous);
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível salvar a privacidade.') });
    } finally {
      setSaving(false);
    }
  };

  const unblock = async (person) => {
    try {
      await unblockUser(person.username);
      setBlocked((list) => list.filter((p) => p.username !== person.username));
      toast(`@${person.username} desbloqueado`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível desbloquear.') });
    }
  };

  return (
    <Card icon={Shield} title="Privacidade" sub="Quem vê seu perfil no Social. Seu peso corporal nunca aparece.">
      <div className={styles.privacyOptions} role="radiogroup" aria-label="Privacidade do perfil">
        {VISIBILITY_OPTIONS.map(({ key, label, icon: Icon, description }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={visibility === key}
            className={`${styles.privacyOption} ${visibility === key ? styles.privacyActive : ''}`}
            onClick={() => choose(key)}
          >
            <span className={styles.privacyIcon}><Icon size={17} /></span>
            <span className={styles.privacyText}>
              <span className={styles.privacyLabel}>{label}{key === 'friends' && <small> padrão</small>}</span>
              <span className={styles.privacyDescription}>{description}</span>
            </span>
            {visibility === key && <Check size={17} className={styles.privacyCheck} />}
          </button>
        ))}
      </div>
      {blocked.length > 0 && (
        <div className={styles.blocked}>
          <p className={styles.label}>Bloqueados</p>
          <ul className={styles.blockedList}>
            {blocked.map((person) => (
              <li key={person.username} className={styles.blockedRow}>
                <span className={styles.blockedName}>{person.name} <span>@{person.username}</span></span>
                <button type="button" className={styles.unblock} onClick={() => unblock(person)}>Desbloquear</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

const BODY_OPTIONS = [
  { key: 'male', label: 'Masculino' },
  { key: 'female', label: 'Feminino' },
];

function BodyTypeCard() {
  const toast = useToast();
  const [bodyType, setBodyType] = useBodyType();

  const choose = (key) => {
    if (key === bodyType) return;
    setBodyType(key);
    toast(`Boneco ${key === 'female' ? 'feminino' : 'masculino'} selecionado`);
  };

  return (
    <Card icon={PersonStanding} title="Boneco" sub="Usado nos mapas musculares de exercícios, fichas, planos e histórico">
      <div className={styles.bodyOptions} role="radiogroup" aria-label="Boneco">
        {BODY_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={bodyType === option.key}
            className={`${styles.bodyOption} ${bodyType === option.key ? styles.bodyOptionActive : ''}`}
            onClick={() => choose(option.key)}
          >
            <span className={styles.bodyPreview} aria-hidden="true">
              <BodyMap sex={option.key} compact />
            </span>
            <span className={styles.bodyLabel}>
              {bodyType === option.key && <Check size={15} />} {option.label}
            </span>
          </button>
        ))}
      </div>
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

function SwitchAppCard() {
  const router = useRouter();

  const openGoals = () => {
    saveLastApp('goals');
    router.push('/');
  };

  return (
    <Card icon={ArrowLeftRight} title="Trocar aplicativo" sub="Também dá para trocar tocando na logo no topo">
      <button type="button" className={styles.secondary} onClick={openGoals}>
        <Target size={16} /> Abrir o Goals
      </button>
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

function GymsCard() {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [data, setData] = useState(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getGyms().then(setData).catch(() => setError('Não foi possível carregar suas academias.'));
  }, []);

  const run = async (action, message) => {
    setBusy(true);
    setError('');
    try {
      setData(await action());
      if (message) toast(message);
      return true;
    } catch (err) {
      setError(apiError(err, 'Não foi possível salvar.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const first = !data?.gyms.length;
    const makeCurrent = first ? false : await confirmAction({
      title: 'Treinar nela a partir de agora?',
      message: <>Os próximos treinos ficam registrados em <strong>{name.trim()}</strong>. Dá para trocar depois.</>,
      confirmLabel: 'Usar esta academia',
      cancelLabel: 'Só adicionar',
      danger: false,
    });
    if (await run(() => createGym(name.trim(), makeCurrent), 'Academia adicionada')) setName('');
  };

  const saveRename = async (e) => {
    e.preventDefault();
    if (!editName.trim()) return;
    if (await run(() => renameGym(editing.id, editName.trim()), 'Academia renomeada')) setEditing(null);
  };

  const remove = async (gym) => {
    const confirmed = await confirmAction({
      title: 'Excluir academia',
      message: <>Excluir <strong>{gym.name}</strong>? Ela ainda não tem treinos registrados.</>,
      confirmLabel: 'Excluir',
    });
    if (confirmed) await run(() => deleteGym(gym.id), 'Academia excluída');
  };

  const gyms = data?.gyms ?? [];

  return (
    <Card
      icon={Building2}
      title="Academias"
      sub="Máquinas, polias e Smith guardam carga, recordes e evolução por academia. Peso livre segue junto."
    >
      {gyms.length > 0 && (
        <ul className={styles.gymList}>
          {gyms.map((gym) => (
            <li key={gym.id} className={styles.gymRow}>
              <div className={styles.gymText}>
                <span className={styles.gymName}>{gym.name}</span>
                <span className={styles.gymMeta}>
                  {gym.sessions === 1 ? '1 treino' : `${gym.sessions} treinos`}
                </span>
              </div>
              {gym.current ? (
                <span className={styles.gymCurrent}><Check size={14} /> Atual</span>
              ) : (
                <button
                  type="button"
                  className={styles.gymUse}
                  disabled={busy}
                  onClick={() => run(() => setCurrentGym(gym.id), `Treinando em ${gym.name}`)}
                >
                  Usar esta
                </button>
              )}
              <button
                type="button"
                className={styles.gymIcon}
                aria-label={`Renomear ${gym.name}`}
                onClick={() => { setEditing(gym); setEditName(gym.name); setError(''); }}
              >
                <Pencil size={15} />
              </button>
              {gym.sessions === 0 && (
                <button
                  type="button"
                  className={`${styles.gymIcon} ${styles.gymIconDanger}`}
                  aria-label={`Excluir ${gym.name}`}
                  disabled={busy}
                  onClick={() => remove(gym)}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && gyms.length === 0 && (
        <p className={styles.note}>
          Cadastre a academia onde você treina hoje. Seus treinos antigos ficam nela, e quando trocar é só adicionar a nova.
        </p>
      )}
      <form className={styles.form} onSubmit={add} noValidate>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={gyms.length ? 'Nova academia' : 'Onde você treina hoje'}
          aria-label="Nome da academia"
        />
        {error && !editing && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.save} disabled={busy || !name.trim()}>
          Adicionar academia
        </button>
      </form>

      <GymSheet open={!!editing} onClose={() => setEditing(null)} title="Renomear academia">
        <form className={styles.form} onSubmit={saveRename} noValidate>
          <input
            className={styles.input}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={60}
            aria-label="Nome da academia"
          />
          {error && editing && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.save} disabled={busy || !editName.trim()}>
            Salvar
          </button>
        </form>
      </GymSheet>
    </Card>
  );
}

export default function GymAccountPage() {
  const [me, setMe] = useState(null);
  const [username, setUsername] = useState(undefined);
  const [visibility, setVisibility] = useState('friends');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getMe(), getFitnessProfile()])
      .then(([user, profile]) => {
        setMe(user);
        setUsername(profile.username ?? null);
        setVisibility(profile.visibility ?? 'friends');
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
          <PrivacyCard initial={visibility} hasUsername={!!username} />
          <BodyTypeCard />
          <GymsCard />
          <PasswordCard me={me} />
          <SwitchAppCard />
          <LogoutCard />
          <DeleteCard me={me} />
        </>
      )}
    </div>
  );
}
