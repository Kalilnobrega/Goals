'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Users, Trophy, UserPlus, Copy, Check, Crown, ShieldPlus, ShieldMinus, UserMinus, LogOut, ArrowRight, MoreHorizontal,
} from 'lucide-react';
import { createInvite, changeMemberRole, transferLeadership, removeMember } from '../lib/api';
import { formatDeadline } from '../lib/date';
import { useConfirm } from './ConfirmDialog';
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
  const [menuFor, setMenuFor] = useState(null);
  const confirmAction = useConfirm();
  const menuRef = useRef(null);

  const isChallenge = group.kind === 'challenge';
  const myRole = group.my_role;
  const canInvite = myRole === 'leader' || myRole === 'moderator';
  const full = group.members.length >= group.member_limit;
  const me = group.members.find(m => m.is_me);

  useEffect(() => {
    if (menuFor === null) return;
    const handlePointer = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuFor(null);
    };
    const handleKey = (e) => { if (e.key === 'Escape') setMenuFor(null); };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuFor]);

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

  const handleTransfer = async (member) => {
    const confirmed = await confirmAction({
      title: 'Passar liderança',
      message: <><strong>{member.name}</strong> vira líder desta meta e você passa a ser moderador.</>,
      confirmLabel: 'Passar liderança',
      danger: false,
    });
    if (!confirmed) return;
    run(async () => {
      onChange(await transferLeadership(group.id, member.user_id));
    }, 'Erro ao transferir a liderança.');
  };

  const handleRemove = async (member) => {
    const confirmed = await confirmAction({
      title: 'Remover participante',
      message: isChallenge
        ? <><strong>{member.name}</strong> sai do desafio e fica com a meta dele como uma meta pessoal.</>
        : <><strong>{member.name}</strong> perde o acesso à meta. O que já foi feito continua contando no progresso.</>,
      confirmLabel: 'Remover',
    });
    if (!confirmed) return;
    run(async () => {
      await removeMember(group.id, member.user_id);
      onChange(null);
    }, 'Erro ao remover participante.');
  };

  const leaveConfirm = () => {
    const title = isChallenge ? 'Sair do desafio' : 'Sair da meta';
    if (group.members.length === 1) {
      return isChallenge
        ? { title, message: 'Você é o único participante. O desafio acaba e a meta vira uma meta pessoal.', confirmLabel: 'Sair' }
        : { title, message: ['Você é o único participante, então a meta será excluída.', 'Isso não pode ser desfeito.'], confirmLabel: 'Sair e excluir' };
    }
    const message = [isChallenge
      ? 'Sua meta continua com você como uma meta pessoal.'
      : 'Você perde o acesso à meta. O que já fez continua contando no progresso.'];
    if (myRole === 'leader') message.push('A liderança passa para o moderador mais antigo ou, se não houver, para o participante mais antigo.');
    return { title, message, confirmLabel: 'Sair' };
  };

  const handleLeave = async () => {
    if (!(await confirmAction(leaveConfirm()))) return;
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
    if (!actions.length) return null;

    const open = menuFor === member.user_id;
    return (
      <span className={styles.menuWrap} ref={open ? menuRef : null}>
        <button
          type="button"
          className={`${styles.iconBtn} ${open ? styles.iconBtnActive : ''}`}
          onClick={() => setMenuFor(open ? null : member.user_id)}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Ações para ${member.name}`}
          title="Ações"
        >
          <MoreHorizontal size={16} />
        </button>
        {open && (
          <div className={styles.menu} role="menu">
            {actions.map(({ key, icon: Icon, label, onClick, danger }) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                className={`${styles.menuItem} ${danger ? styles.menuItemDanger : ''}`}
                onClick={() => { setMenuFor(null); onClick(); }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        )}
      </span>
    );
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
            <li key={member.user_id} className={`${styles.member} ${viewing && isChallenge ? styles.memberViewing : ''} ${menuFor === member.user_id ? styles.memberMenuOpen : ''} glass`}>
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
