'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Users, Trophy, UserPlus, Copy, Check, Crown, ShieldPlus, ShieldMinus, UserMinus, LogOut, ArrowRight,
} from 'lucide-react';
import { createInvite, changeMemberRole, transferLeadership, removeMember } from '../lib/api';
import { formatDeadline } from '../lib/date';
import styles from './GroupPanel.module.css';

const ROLE_LABEL = { leader: 'Líder', moderator: 'Moderador' };

function errorMessage(err, fallback) {
  return err?.response?.data?.detail || fallback;
}

export default function GroupPanel({ group, goalId, onChange, onLeft }) {
  const [invite, setInvite] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isChallenge = group.kind === 'challenge';
  const myRole = group.my_role;
  const canInvite = myRole === 'leader' || myRole === 'moderator';
  const full = group.members.length >= group.member_limit;
  const me = group.members.find(m => m.is_me);

  const run = async (action, fallback) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleInvite = () => run(async () => {
    const data = await createInvite(group.id);
    const link = `${window.location.origin}/invite/${data.token}`;
    setInvite({ link, expiresAt: data.expires_at });
    copyLink(link);
  }, 'Erro ao gerar o convite.');

  const handleRole = (member, role) => run(async () => {
    onChange(await changeMemberRole(group.id, member.user_id, role));
  }, 'Erro ao mudar o cargo.');

  const handleTransfer = (member) => {
    if (!confirm(`Passar a liderança para ${member.name}? Você vira moderador.`)) return;
    run(async () => {
      onChange(await transferLeadership(group.id, member.user_id));
    }, 'Erro ao transferir a liderança.');
  };

  const handleRemove = (member) => {
    if (!confirm(`Remover ${member.name} da meta?`)) return;
    run(async () => {
      await removeMember(group.id, member.user_id);
      onChange(null);
    }, 'Erro ao remover participante.');
  };

  const leaveWarning = () => {
    if (group.members.length === 1) {
      return isChallenge
        ? 'Você é o único participante. O desafio acaba e a meta vira uma meta pessoal. Continuar?'
        : 'Você é o único participante. Sair vai excluir a meta. Continuar?';
    }
    const lines = [isChallenge
      ? 'Sair do desafio? Sua meta continua com você como uma meta pessoal.'
      : 'Sair da meta? O que você já fez continua contando no progresso.'];
    if (myRole === 'leader') lines.push('A liderança passa para o moderador mais antigo ou, se não houver, para o participante mais antigo.');
    return lines.join('\n\n');
  };

  const handleLeave = () => {
    if (!confirm(leaveWarning())) return;
    run(async () => {
      await removeMember(group.id, me.user_id);
      onLeft();
    }, 'Erro ao sair da meta.');
  };

  const memberActions = (member) => {
    if (member.is_me) return null;
    const actions = [];
    if (myRole === 'leader') {
      if (member.role === 'member') {
        actions.push({ key: 'promote', icon: ShieldPlus, label: 'Tornar moderador', onClick: () => handleRole(member, 'moderator') });
      } else {
        actions.push({ key: 'demote', icon: ShieldMinus, label: 'Remover moderador', onClick: () => handleRole(member, 'member') });
      }
      actions.push({ key: 'transfer', icon: Crown, label: 'Passar liderança', onClick: () => handleTransfer(member) });
    }
    if (myRole === 'leader' || (myRole === 'moderator' && member.role === 'member')) {
      actions.push({ key: 'remove', icon: UserMinus, label: 'Remover da meta', onClick: () => handleRemove(member), danger: true });
    }
    return actions.length ? (
      <span className={styles.memberActions}>
        {actions.map(({ key, icon: Icon, label, onClick, danger }) => (
          <button
            key={key}
            type="button"
            className={`${styles.iconBtn} ${danger ? styles.danger : ''}`}
            onClick={onClick}
            disabled={busy}
            title={label}
            aria-label={label}
          >
            <Icon size={14} />
          </button>
        ))}
      </span>
    ) : null;
  };

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        {isChallenge ? <Trophy size={16} className={styles.headerIcon} /> : <Users size={16} className={styles.headerIcon} />}
        <h2 className={styles.title}>{isChallenge ? 'Ranking do desafio' : 'Participantes'}</h2>
        <span className={styles.count}>{group.members.length}/{group.member_limit}</span>
        {canInvite && (
          <button type="button" className={styles.inviteBtn} onClick={handleInvite} disabled={busy || full}>
            <UserPlus size={14} /> {full ? 'Grupo cheio' : 'Convidar'}
          </button>
        )}
      </div>

      {invite && (
        <div className={`${styles.inviteBox} glass`}>
          <div className={styles.inviteRow}>
            <input className={styles.inviteInput} value={invite.link} readOnly onFocus={e => e.target.select()} />
            <button type="button" className={styles.copyBtn} onClick={() => copyLink(invite.link)}>
              {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
            </button>
          </div>
          <p className={styles.inviteHint}>
            Envie o link para quem você quer convidar. Ele vale até {formatDeadline(invite.expiresAt)}.
          </p>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {isChallenge && group.finished && group.members[0] && (
        <div className={`${styles.winner} glass`}>
          <Trophy size={18} />
          <span><strong>{group.members[0].is_me ? 'Você venceu' : `${group.members[0].name} venceu`}</strong> o desafio!</span>
        </div>
      )}

      <ul className={styles.list}>
        {group.members.map((member, index) => {
          const progress = Math.round(member.progress ?? 0);
          const viewing = member.goal_id === goalId;
          return (
            <li key={member.user_id} className={`${styles.member} ${viewing && isChallenge ? styles.memberViewing : ''} glass`}>
              {isChallenge && (
                <span className={`${styles.rank} ${index === 0 ? styles.rankFirst : ''}`}>{index + 1}</span>
              )}
              <span className={styles.avatar} aria-hidden="true">{member.name.trim().charAt(0).toUpperCase()}</span>
              <div className={styles.memberBody}>
                <div className={styles.memberTop}>
                  <span className={styles.name}>
                    {member.name}{member.is_me && <span className={styles.you}> (você)</span>}
                  </span>
                  {ROLE_LABEL[member.role] && (
                    <span className={`${styles.role} ${member.role === 'leader' ? styles.roleLeader : ''}`}>
                      {member.role === 'leader' && <Crown size={11} />}
                      {ROLE_LABEL[member.role]}
                    </span>
                  )}
                </div>
                {isChallenge && (
                  <div className={styles.progressRow}>
                    <div className={styles.progressTrack}>
                      <div className={`${styles.progressFill} ${progress >= 100 ? styles.progressDone : ''}`} style={{ width: `${progress}%` }} />
                    </div>
                    <span className={styles.progressPct}>{progress}%</span>
                  </div>
                )}
              </div>
              {memberActions(member)}
              {isChallenge && !viewing && member.goal_id && (
                <Link href={`/goals/${member.goal_id}`} className={styles.viewLink} aria-label={`Ver a meta de ${member.name}`} title="Ver progresso">
                  <ArrowRight size={14} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <button type="button" className={styles.leaveBtn} onClick={handleLeave} disabled={busy}>
        <LogOut size={14} /> {isChallenge ? 'Sair do desafio' : 'Sair da meta'}
      </button>
    </section>
  );
}
