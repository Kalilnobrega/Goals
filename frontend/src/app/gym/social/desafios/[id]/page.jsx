'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity, CalendarDays, Info, MessageCircle, MoreHorizontal, Check, ChevronLeft, Copy, Crown, LogOut, Share2, Trash2, Trophy, UserMinus, UserPlus, Users,
} from 'lucide-react';
import {
  deleteChallenge, getChallenge, getFriends, inviteToChallenge, leaveChallenge, peekCache, removeChallengeMember,
} from '../../../../../lib/api';
import { apiError, firstName } from '../../../../../lib/gym';
import {
  STATUS_LABEL, formatMetricValue, formatRange, formatScore, inviteUrl, metricDetail, metricLabel, minRuleLabel, timeLeftLabel,
} from '../../../../../lib/challenges';
import { useToast } from '../../../../../components/Toast';
import { useConfirm } from '../../../../../components/ConfirmDialog';
import GymSheet from '../../../../../components/gym/GymSheet';
import Avatar from '../../../../../components/gym/social/Avatar';
import ChallengeActivity from '../../../../../components/gym/social/ChallengeActivity';
import ChallengeChat from '../../../../../components/gym/social/ChallengeChat';
import styles from './detail.module.css';

function InviteFriends({ challenge, onInvited }) {
  const toast = useToast();
  const [friends, setFriends] = useState(null);
  const [sent, setSent] = useState(() => new Set());

  useEffect(() => {
    getFriends().then((data) => setFriends(data.friends)).catch(() => setFriends([]));
  }, []);

  const members = new Set(challenge.ranking.map((row) => row.username));
  const available = (friends ?? []).filter((friend) => !members.has(friend.username));

  const invite = async (friend) => {
    try {
      await inviteToChallenge(challenge.id, friend.username);
      setSent((current) => new Set(current).add(friend.username));
      toast(`Convite enviado para ${firstName(friend.name)}`);
      onInvited?.();
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível convidar.') });
    }
  };

  if (!friends) return <p className={styles.muted}>Carregando amigos...</p>;
  if (!available.length) {
    return <p className={styles.muted}>Todos os seus amigos já estão aqui, ou você ainda não tem amigos. Use o link para chamar outras pessoas.</p>;
  }

  return (
    <ul className={styles.friendList}>
      {available.map((friend) => (
        <li key={friend.username} className={styles.friend}>
          <Avatar name={friend.name} />
          <span className={styles.friendText}>
            <span className={styles.friendName}>{friend.name}</span>
            <span className={styles.friendHandle}>@{friend.username}</span>
          </span>
          {sent.has(friend.username) ? (
            <span className={styles.sent}><Check size={15} /> Enviado</span>
          ) : (
            <button type="button" className={styles.inviteButton} onClick={() => invite(friend)}>Convidar</button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ChallengePage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justCreated = searchParams.get('novo') === '1';
  const [tab, setTab] = useState({ ranking: 'ranking', chat: 'chat' }[searchParams.get('aba')] ?? 'activity');
  const toast = useToast();
  const confirmAction = useConfirm();
  const [challenge, setChallenge] = useState(() => peekCache(`fitnessChallenge:${id}`));
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const fromMenu = (action) => {
    setMenuOpen(false);
    action();
  };
  const closeDetails = useCallback(() => setShowDetails(false), []);

  const load = useCallback(() => {
    getChallenge(id)
      .then((data) => {
        setChallenge(data);
        setError('');
      })
      .catch((err) => setError(err.response?.status === 404 ? 'Desafio não encontrado.' : apiError(err, 'Não foi possível carregar o desafio.')));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const closeInvite = useCallback(() => setInviting(false), []);
  const markChatRead = useCallback(() => setChallenge((current) => (current ? { ...current, chat_unread: 0 } : current)), []);

  const link = challenge ? inviteUrl(challenge.invite_code) : '';
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado');
    } catch {
      toast({ tone: 'danger', message: 'Não foi possível copiar o link.' });
    }
  };

  const shareLink = async () => {
    try {
      await navigator.share({ title: challenge.name, text: `Bora entrar no desafio "${challenge.name}" no GymGoals?`, url: link });
    } catch {}
  };

  const leave = async () => {
    const ok = await confirmAction({
      title: 'Sair do desafio',
      message: [<>Você sai de <strong>{challenge.name}</strong> e some do ranking. Dá para voltar pelo link.</>],
      confirmLabel: 'Sair',
    });
    if (!ok) return;
    try {
      await leaveChallenge(challenge.id);
      toast('Você saiu do desafio');
      router.replace('/gym/social/desafios');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível sair do desafio.') });
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: 'Excluir desafio',
      message: [<>O desafio <strong>{challenge.name}</strong> e o ranking somem para todos os participantes.</>, 'Os treinos de cada um continuam salvos.'],
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteChallenge(challenge.id);
      toast('Desafio excluído');
      router.replace('/gym/social/desafios');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível excluir o desafio.') });
    }
  };

  const removeMember = async (row) => {
    const ok = await confirmAction({
      title: 'Remover participante',
      message: [<><strong>{row.name}</strong> sai do desafio e do ranking.</>],
      confirmLabel: 'Remover',
    });
    if (!ok) return;
    try {
      await removeChallengeMember(challenge.id, row.username);
      toast(`${firstName(row.name)} foi removido`);
      load();
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível remover.') });
    }
  };

  const multi = challenge?.metrics.length > 1;
  const finished = challenge?.status === 'finished';
  const started = challenge && challenge.status !== 'upcoming';
  const winner = finished && challenge.ranking[0]?.score > 0 ? challenge.ranking[0] : null;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link href="/gym/social/desafios" className={styles.back}><ChevronLeft size={18} /> Desafios</Link>
        {challenge && !error && (
          <button type="button" className={styles.moreButton} onClick={() => setMenuOpen(true)} aria-label="Opções do desafio">
            <MoreHorizontal size={20} />
          </button>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {!challenge && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando desafio" />}

      {challenge && !error && (
        <>
          <section className={styles.hero}>
            <div className={styles.heroTop}>
              <span className={`${styles.status} ${styles[`status_${challenge.status}`]}`}>{STATUS_LABEL[challenge.status]}</span>
              <span className={styles.timeLeft}>{timeLeftLabel(challenge)}</span>
            </div>
            <h1 className={styles.name}>{challenge.name}</h1>
            <p className={styles.meta}>
              <CalendarDays size={14} /> {formatRange(challenge.start_date, challenge.end_date)}
              <span aria-hidden="true">·</span>
              <Users size={14} /> {challenge.member_count} {challenge.member_count === 1 ? 'participante' : 'participantes'}
            </p>
          </section>

          <GymSheet open={showDetails} onClose={closeDetails} title="Detalhes do desafio">
            <div className={styles.details}>
              {challenge.description && <p className={styles.description}>{challenge.description}</p>}
              <dl className={styles.detailList}>
                <div className={styles.detailItem}>
                  <dt>Período</dt>
                  <dd>{formatRange(challenge.start_date, challenge.end_date)} · {timeLeftLabel(challenge)}</dd>
                </div>
                {challenge.owner_username && (
                  <div className={styles.detailItem}>
                    <dt>Criado por</dt>
                    <dd>@{challenge.owner_username}</dd>
                  </div>
                )}
                <div className={styles.detailItem}>
                  <dt>O que vale ponto</dt>
                  <dd>
                    <ul className={styles.metricList}>
                      {challenge.metrics.map((metric) => (
                        <li key={metric.id}>
                          {metricLabel(metric)}{multi && metric.weight > 1 ? ` · peso ${metric.weight}×` : ''}
                        </li>
                      ))}
                    </ul>
                    <span className={styles.detailHint}>
                      {multi
                        ? 'Quem lidera cada métrica ganha 100 pontos nela (vezes o peso) e os outros ganham proporcional. O total é a soma.'
                        : 'O ranking mostra a quantidade de cada pessoa.'}
                    </span>
                  </dd>
                </div>
                <div className={styles.detailItem}>
                  <dt>Treino mínimo</dt>
                  <dd>{minRuleLabel(challenge.min_rule)}</dd>
                </div>
                <div className={styles.detailItem}>
                  <dt>Check-in manual</dt>
                  <dd>
                    {challenge.allow_manual
                      ? 'Permitido, com foto obrigatória. Conta em dias treinados, treinos e minutos.'
                      : 'Não permitido. Só contam treinos registrados no app.'}
                  </dd>
                </div>
                {challenge.uses_weight && (
                  <div className={styles.detailItem}>
                    <dt>Peso corporal</dt>
                    <dd>
                      {challenge.hide_weight
                        ? 'Escondido: o ranking mostra só a porcentagem ou a razão, nunca os quilos.'
                        : 'Visível para os participantes: peso inicial e atual.'}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </GymSheet>

          {winner && (
            <section className={styles.winner}>
              <Trophy size={26} />
              <div>
                <p className={styles.winnerTitle}>{winner.is_me ? 'Você venceu!' : `${firstName(winner.name)} venceu`}</p>
                <p className={styles.winnerText}>{formatScore(challenge, winner.score)}</p>
              </div>
            </section>
          )}

          {!finished && (justCreated || challenge.member_count <= 1) && (
            <section className={`${styles.card} ${styles.highlight}`}>
              <h2 className={styles.cardTitle}>{justCreated ? 'Desafio criado! Agora chame a galera' : 'Chame a galera para começar'}</h2>
              {!justCreated && <p className={styles.muted}>Com mais gente o ranking, a atividade e o chat ganham vida.</p>}
              <p className={styles.link}>{link}</p>
              <div className={styles.inviteActions}>
                <button type="button" className={styles.secondary} onClick={copyLink}><Copy size={16} /> Copiar link</button>
                {canShare && <button type="button" className={styles.secondary} onClick={shareLink}><Share2 size={16} /> Compartilhar</button>}
                <button type="button" className={styles.primary} onClick={() => setInviting(true)}><UserPlus size={16} /> Amigos</button>
              </div>
            </section>
          )}

          <div className={styles.tabs} role="tablist" aria-label="Desafio">
            <button type="button" role="tab" aria-selected={tab === 'activity'} className={`${styles.tab} ${tab === 'activity' ? styles.tabActive : ''}`} onClick={() => setTab('activity')}>
              <Activity size={15} /> Atividade
            </button>
            <button type="button" role="tab" aria-selected={tab === 'ranking'} className={`${styles.tab} ${tab === 'ranking' ? styles.tabActive : ''}`} onClick={() => setTab('ranking')}>
              <Crown size={15} /> Ranking
            </button>
            <button type="button" role="tab" aria-selected={tab === 'chat'} className={`${styles.tab} ${tab === 'chat' ? styles.tabActive : ''}`} onClick={() => setTab('chat')}>
              <MessageCircle size={15} /> Chat
              {challenge.chat_unread > 0 && tab !== 'chat' && <span className={styles.tabBadge}>{challenge.chat_unread > 9 ? '9+' : challenge.chat_unread}</span>}
            </button>
          </div>

          {tab === 'activity' && <ChallengeActivity challenge={challenge} />}
          {tab === 'chat' && <ChallengeChat challenge={challenge} onRead={markChatRead} />}

          {tab === 'ranking' && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              <Crown size={17} className={styles.cardIcon} /> Ranking
              {multi && <span className={styles.cardHint}>pontos relativos ao líder</span>}
            </h2>
            {!started && <p className={styles.muted}>O ranking começa a contar em {formatRange(challenge.start_date, challenge.start_date).split(' – ')[0]}.</p>}
            <ol className={styles.ranking}>
              {challenge.ranking.map((row) => (
                <li key={row.username ?? row.name} className={`${styles.row} ${row.is_me ? styles.rowMe : ''}`}>
                  <span className={`${styles.position} ${started && row.position <= 3 && row.score > 0 ? styles[`podium${row.position}`] : ''}`}>
                    {started ? row.position : '–'}
                  </span>
                  <Avatar name={row.name} />
                  <span className={styles.rowText}>
                    {row.username && !row.is_me ? (
                      <Link href={`/gym/u/${row.username}`} className={styles.rowName}>{row.name}</Link>
                    ) : (
                      <span className={styles.rowName}>{row.is_me ? 'Você' : row.name}</span>
                    )}
                    {multi && started && (
                      <span className={styles.rowValues}>
                        {challenge.metrics.map((metric) => formatMetricValue(metric, row.values[metric.id] ?? 0)).join(' · ')}
                      </span>
                    )}
                    {started && challenge.metrics.map((metric) => {
                      if (row.missing.includes(metric.id)) {
                        return row.is_me ? (
                          <Link key={metric.id} href="/gym/progress/body" className={styles.rowMissing}>Registre uma pesagem para pontuar</Link>
                        ) : (
                          <span key={metric.id} className={styles.rowValues}>Sem pesagem ainda</span>
                        );
                      }
                      const detail = metricDetail(metric, row.details[metric.id]);
                      return detail ? <span key={metric.id} className={styles.rowValues}>{detail}</span> : null;
                    })}
                  </span>
                  <span className={styles.score}>{started ? formatScore(challenge, row.score) : ''}</span>
                  {challenge.is_owner && !row.is_me && row.username && (
                    <button type="button" className={styles.removeMember} onClick={() => removeMember(row)} aria-label={`Remover ${row.name}`}>
                      <UserMinus size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
          )}

          <GymSheet open={menuOpen} onClose={closeMenu} title={challenge.name}>
            <div className={styles.menu}>
              {!finished && (
                <button type="button" className={styles.menuItem} onClick={() => fromMenu(() => setInviting(true))}>
                  <UserPlus size={18} /> Convidar
                </button>
              )}
              <button type="button" className={styles.menuItem} onClick={() => fromMenu(() => setShowDetails(true))}>
                <Info size={18} /> Detalhes do desafio
              </button>
              {challenge.is_owner ? (
                <button type="button" className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => fromMenu(remove)}>
                  <Trash2 size={18} /> Excluir desafio
                </button>
              ) : (
                <button type="button" className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => fromMenu(leave)}>
                  <LogOut size={18} /> Sair do desafio
                </button>
              )}
            </div>
          </GymSheet>

          <GymSheet open={inviting} onClose={closeInvite} title="Convidar">
            {inviting && (
              <div className={styles.inviteSheet}>
                <p className={styles.link}>{link}</p>
                <div className={styles.inviteActions}>
                  <button type="button" className={styles.secondary} onClick={copyLink}><Copy size={16} /> Copiar link</button>
                  {canShare && <button type="button" className={styles.secondary} onClick={shareLink}><Share2 size={16} /> Compartilhar</button>}
                </div>
                <h3 className={styles.sheetTitle}>Amigos</h3>
                <InviteFriends challenge={challenge} />
              </div>
            )}
          </GymSheet>
        </>
      )}
    </div>
  );
}
