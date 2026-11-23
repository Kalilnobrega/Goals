'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Ban, ChevronLeft, Clock, Dumbbell, Flag, Globe, Lock, MoreHorizontal, Settings, Trophy, Users,
} from 'lucide-react';
import { blockUser, getSocialProfile, getUserPosts, peekCache, reportUser } from '../../../../lib/api';
import { apiError, formatDay, formatKg, formatVolume, plural } from '../../../../lib/gym';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import GymSheet from '../../../../components/gym/GymSheet';
import Avatar from '../../../../components/gym/social/Avatar';
import FriendAction from '../../../../components/gym/social/FriendAction';
import PostCard from '../../../../components/gym/social/PostCard';
import styles from './page.module.css';

const VISIBILITY = {
  public: { label: 'Perfil público', icon: Globe },
  friends: { label: 'Visível para amigos', icon: Users },
  private: { label: 'Perfil privado', icon: Lock },
};

const REASONS = [
  { key: 'spam', label: 'Spam' },
  { key: 'offensive', label: 'Conteúdo ofensivo' },
  { key: 'fake', label: 'Perfil falso' },
  { key: 'other', label: 'Outro motivo' },
];

const monthYear = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

function firstName(name) {
  return (name ?? '').split(' ')[0];
}

function lockedMessage(profile) {
  if (profile.relation === 'blocked') return `Você bloqueou ${profile.name}. Desbloqueie para ver o perfil e enviar pedidos.`;
  if (profile.visibility === 'private') return `${firstName(profile.name)} deixou o perfil privado. Treinos e recordes não aparecem para ninguém.`;
  return `Só amigos de ${firstName(profile.name)} e quem está nos mesmos desafios veem os treinos e recordes.`;
}

function Stat({ value, label, sub }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </div>
  );
}

function ReportSheet({ open, profile, onClose }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  const close = useCallback(() => {
    setReason('');
    setDetails('');
    onClose();
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason) return;
    setSending(true);
    try {
      await reportUser(profile.username, reason, details.trim() || null);
      toast('Denúncia enviada. Obrigado por avisar.');
      close();
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível enviar a denúncia.') });
    } finally {
      setSending(false);
    }
  };

  return (
    <GymSheet open={open} onClose={close} title={`Denunciar @${profile.username}`}>
      <form className={styles.sheetForm} onSubmit={submit}>
        <div className={styles.reasons} role="radiogroup" aria-label="Motivo">
          {REASONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={reason === option.key}
              className={`${styles.reason} ${reason === option.key ? styles.reasonActive : ''}`}
              onClick={() => setReason(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <textarea
          className={styles.textarea}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Conte o que aconteceu (opcional)"
          aria-label="Detalhes"
        />
        <button type="submit" className={styles.primary} disabled={!reason || sending}>
          {sending ? 'Enviando...' : 'Enviar denúncia'}
        </button>
      </form>
    </GymSheet>
  );
}

export default function SocialProfilePage() {
  const { username } = useParams();
  const handle = decodeURIComponent(username).toLowerCase();
  const toast = useToast();
  const confirmAction = useConfirm();
  const [profile, setProfile] = useState(() => peekCache(`socialProfile:${handle}`));
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [posts, setPosts] = useState(null);

  const load = useCallback(() => {
    getSocialProfile(handle)
      .then((data) => {
        setProfile(data);
        setError('');
      })
      .catch((err) => setError(err.response?.status === 404 ? 'Perfil não encontrado.' : apiError(err, 'Não foi possível carregar o perfil.')));
  }, [handle]);

  useEffect(() => {
    load();
  }, [load]);

  const canView = profile?.can_view;
  useEffect(() => {
    if (!canView) return;
    getUserPosts(handle).then((data) => setPosts(data.posts)).catch(() => setPosts([]));
  }, [canView, handle]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeReport = useCallback(() => setReporting(false), []);

  const block = async () => {
    setMenuOpen(false);
    const ok = await confirmAction({
      title: `Bloquear ${profile.name}`,
      message: [
        'Vocês deixam de ser amigos e nenhum dos dois consegue enviar pedidos.',
        `${firstName(profile.name)} não vai mais encontrar nem ver o seu perfil.`,
      ],
      confirmLabel: 'Bloquear',
    });
    if (!ok) return;
    try {
      await blockUser(profile.username);
      toast(`${firstName(profile.name)} foi bloqueado`);
      load();
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível bloquear.') });
    }
  };

  const visibility = profile ? VISIBILITY[profile.visibility] : null;
  const self = profile?.relation === 'self';

  return (
    <div className={styles.page}>
      <Link href="/gym/social" className={styles.back}><ChevronLeft size={18} /> Social</Link>

      {error && <p className={styles.error}>{error}</p>}

      {!profile && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando perfil" />}

      {profile && !error && (
        <>
          <section className={styles.hero}>
            <Avatar name={profile.name} size="lg" />
            <div className={styles.identity}>
              <h1 className={styles.name}>{profile.name}</h1>
              <p className={styles.handle}>@{profile.username}</p>
              <p className={styles.visibility}><visibility.icon size={13} /> {visibility.label}</p>
            </div>
            <div className={styles.actions}>
              {self ? (
                <Link href="/gym/account" className={styles.secondary}><Settings size={16} /> Editar conta</Link>
              ) : (
                <>
                  <FriendAction person={profile} onChange={load} />
                  <button type="button" className={styles.more} onClick={() => setMenuOpen(true)} aria-label="Mais opções">
                    <MoreHorizontal size={18} />
                  </button>
                </>
              )}
            </div>
          </section>

          {!profile.can_view && (
            <section className={styles.locked}>
              <Lock size={20} />
              <p>{lockedMessage(profile)}</p>
            </section>
          )}

          {profile.can_view && profile.stats && (
            <>
              <section className={styles.stats}>
                <Stat value={profile.stats.workouts} label={profile.stats.workouts === 1 ? 'treino' : 'treinos'} sub={profile.stats.member_since ? `desde ${monthYear.format(new Date(`${profile.stats.member_since}T12:00:00`))}` : null} />
                <Stat value={profile.stats.workouts_this_month} label="este mês" />
                <Stat
                  value={profile.stats.week_streak}
                  label={profile.stats.week_streak === 1 ? 'semana seguida' : 'semanas seguidas'}
                  sub={profile.stats.best_week_streak ? `recorde ${profile.stats.best_week_streak}` : null}
                />
                <Stat value={profile.stats.friends} label={profile.stats.friends === 1 ? 'amigo' : 'amigos'} />
              </section>

              <section className={styles.card}>
                <h2 className={styles.cardTitle}><Trophy size={17} /> Recordes recentes</h2>
                {profile.records.length ? (
                  <ul className={styles.list}>
                    {profile.records.map((record) => (
                      <li key={`${record.name}-${record.date}`} className={styles.item}>
                        <span className={styles.itemMain}>
                          <span className={styles.itemName}>{record.name}</span>
                          <span className={styles.itemMeta}>{formatDay(record.date)} · antes {formatKg(record.previous_kg)} kg</span>
                        </span>
                        <span className={styles.itemValue}>{formatKg(record.weight_kg)} kg × {record.reps}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>Nenhum recorde de carga ainda.</p>
                )}
              </section>

              {profile.recent_sessions ? (
                <section className={styles.card}>
                  <h2 className={styles.cardTitle}><Dumbbell size={17} /> Últimos treinos</h2>
                  {profile.recent_sessions.length ? (
                    <ul className={styles.list}>
                      {profile.recent_sessions.map((session, index) => (
                        <li key={`${session.date}-${index}`} className={styles.item}>
                          <span className={styles.itemMain}>
                            <span className={styles.itemName}>{session.name}</span>
                            <span className={styles.itemMeta}>
                              {formatDay(session.date)} · {plural(session.exercises, 'exercício', 'exercícios')}
                            </span>
                          </span>
                          <span className={styles.itemSide}>
                            <span className={styles.itemValue}>{formatVolume(session.volume_kg)}</span>
                            <span className={styles.itemMeta}><Clock size={12} /> {session.minutes} min</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.muted}>Nenhum treino concluído ainda.</p>
                  )}
                </section>
              ) : (
                <p className={styles.note}>Os últimos treinos aparecem só para amigos e quem está nos mesmos desafios.</p>
              )}
            </>
          )}

          {profile.can_view && posts && posts.length > 0 && (
            <section className={styles.posts}>
              <h2 className={styles.postsTitle}>Publicações</h2>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onChange={(updated) => setPosts((list) => list.map((p) => (p.id === updated.id ? updated : p)))}
                  onDeleted={(removed) => setPosts((list) => list.filter((p) => p.id !== removed.id))}
                />
              ))}
            </section>
          )}

          {!self && (
            <GymSheet open={menuOpen} onClose={closeMenu} title={`@${profile.username}`}>
              <div className={styles.menu}>
                {profile.relation !== 'blocked' && (
                  <button type="button" className={styles.menuItem} onClick={block}>
                    <Ban size={18} /> Bloquear
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuDanger}`}
                  onClick={() => {
                    setMenuOpen(false);
                    setReporting(true);
                  }}
                >
                  <Flag size={18} /> Denunciar
                </button>
              </div>
            </GymSheet>
          )}
          {!self && <ReportSheet open={reporting} profile={profile} onClose={closeReport} />}
        </>
      )}
    </div>
  );
}
