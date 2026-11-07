'use client';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Trash2, ArrowRight, Calendar, ListTodo, RefreshCw, CheckCircle2, Target, Users, Trophy, MoreVertical, AlertTriangle } from 'lucide-react';
import { formatDeadline, formatShortDeadline, cycleNotStarted } from '../lib/date';
import { formatProgressValue, hasTarget } from '../lib/numeric';
import styles from './GoalCard.module.css';

// Status do backend: 'open' | 'completed' | 'late'
const STATUS_META = {
  open:      { label: 'Em aberto',  color: '#3b82f6' },
  completed: { label: 'Concluída',  color: '#10b981' },
  late:      { label: 'Atrasada',   color: '#ef4444' },
};

const KIND_META = {
  collaborative: { label: 'Colaborativa', color: '#8b5cf6', icon: Users },
  challenge:     { label: 'Desafio',      color: '#d97706', icon: Trophy },
};

export default function GoalCard({ goal, onDelete, onComplete, dragHandle, dragging }) {
  const progress = typeof goal.progress === 'number' ? Math.round(goal.progress) : 0;
  const meta = STATUS_META[goal.status] || STATUS_META.open;
  const isCompleted = goal.status === 'completed';
  const kind = KIND_META[goal.group_kind];
  const isLate = goal.status === 'late';
  const barTone = isLate ? styles.toneLate : (isCompleted || progress >= 100) ? styles.toneComplete : '';
  const StatusIcon = isLate ? AlertTriangle : isCompleted ? CheckCircle2 : null;
  const canComplete = !isCompleted && goal.can_complete;
  const hasActions = canComplete || goal.can_delete;
  const [menu, setMenu] = useState(null);
  const menuButton = useRef(null);

  const shownMeta = [
    goal.is_numeric && 'numeric',
    goal.deadline && 'deadline',
    !goal.is_numeric && 'tasks',
    goal.group_kind && 'people',
  ].filter(Boolean).slice(0, 2);
  const metaClass = (key) => [
    styles.metaItem,
    shownMeta.includes(key) && styles.metaShown,
    shownMeta[0] === key && styles.metaLead,
  ].filter(Boolean).join(' ');

  const openMenu = () => {
    if (menu) return setMenu(null);
    const rect = menuButton.current.getBoundingClientRect();
    const above = rect.bottom + 110 > window.innerHeight;
    setMenu({
      right: window.innerWidth - rect.right,
      ...(above ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  };

  const runAction = (action) => {
    setMenu(null);
    action?.(goal.id);
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  return (
    <article className={`${styles.card} ${isCompleted ? '' : goal.status === 'late' ? styles.cardLate : ''} ${dragging ? styles.cardDragging : ''} glass`}>
      <Link href={`/goals/${goal.id}`} className={styles.cover} aria-label={`Ver detalhes de ${goal.title}`} tabIndex={-1} />
      <div className={styles.topRow}>
        <div className={styles.badges}>
          {StatusIcon && (
            <div className={`${styles.badge} ${styles.statusIcon}`} style={{ '--badge-color': meta.color }} title={meta.label}>
              <StatusIcon size={12} strokeWidth={2.5} aria-label={meta.label} />
            </div>
          )}
          <div className={`${styles.badge} ${styles.statusBadge}`} style={{ '--badge-color': meta.color }}>
            <span className={styles.badgeDot} />
            {meta.label}
          </div>
          {kind && (
            <div className={styles.badge} style={{ '--badge-color': kind.color }} title={kind.label}>
              <kind.icon size={12} strokeWidth={2.5} />
              <span className={styles.badgeLabel}>{kind.label}</span>
            </div>
          )}
        </div>
        <div className={styles.controls}>
          {dragHandle}
          {hasActions && (
            <button
              ref={menuButton}
              className={styles.btnMenu}
              onClick={openMenu}
              aria-label="Mais ações"
              aria-haspopup="menu"
              aria-expanded={!!menu}
            >
              <MoreVertical size={18} />
            </button>
          )}
        </div>
      </div>

      <h3 className={styles.title}>{goal.title}</h3>
      {goal.description && (
        <p className={styles.desc}>{goal.description}</p>
      )}

      {!(goal.is_numeric && !hasTarget(goal)) && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            <div className={`${styles.progressFill} ${barTone}`} style={{ width: `${progress}%` }} />
          </div>
          <span className={`${styles.progressLabel} ${barTone}`}>{progress}%</span>
        </div>
      )}

      <div className={styles.meta}>
        {goal.is_numeric ? (
          <span className={metaClass('numeric')}>
            <Target size={13} />
            {formatProgressValue(goal)}
          </span>
        ) : (
          <span className={metaClass('tasks')}>
            <ListTodo size={13} />
            <span className={styles.short} aria-hidden="true">{goal.total_tasks ?? 0}</span>
            <span className={styles.long}>{goal.total_tasks ?? 0} tarefa{goal.total_tasks !== 1 ? 's' : ''}</span>
          </span>
        )}
        {goal.group_kind && (
          <span className={metaClass('people')}>
            <Users size={13} />
            <span className={styles.short} aria-hidden="true">{goal.member_count}</span>
            <span className={styles.long}>{goal.member_count} pessoa{goal.member_count !== 1 ? 's' : ''}</span>
          </span>
        )}
        {goal.deadline && (
          <span className={metaClass('deadline')}>
            <Calendar size={13} />
            <span className={styles.short} aria-hidden="true">{formatShortDeadline(goal.deadline)}</span>
            <span className={styles.long}>{formatDeadline(goal.deadline)}</span>
          </span>
        )}
        {goal.is_recurring && goal.is_numeric ? (
          <span className={styles.metaItem}>
            <RefreshCw size={13} />
            {cycleNotStarted(goal) ? `Começa em ${formatDeadline(goal.cycle_start_date)}` : 'Por ciclo'}
          </span>
        ) : goal.is_recurring ? (
          <span className={styles.metaItem}>
            <RefreshCw size={13} />
            {cycleNotStarted(goal)
              ? `Começa em ${formatDeadline(goal.cycle_start_date)}`
              : `${goal.current_cycle_progress ?? 0}/${goal.recurrence_target ?? 1} neste ciclo`}
          </span>
        ) : goal.tasks?.some(t => t.is_recurring) && (
          <span className={styles.metaItem}>
            <RefreshCw size={13} />
            Hábitos ativos
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <Link href={`/goals/${goal.id}`} className={styles.btnPrimary}>
          Ver detalhes <ArrowRight size={14} />
        </Link>
        {canComplete && (
          <button
            className={styles.btnComplete}
            onClick={() => onComplete?.(goal.id)}
            aria-label="Marcar como concluída"
            title="Marcar como concluída"
          >
            <CheckCircle2 size={15} />
          </button>
        )}
        {goal.can_delete && (
          <button
            className={styles.btnDelete}
            onClick={() => onDelete?.(goal.id)}
            aria-label="Excluir meta"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {menu && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setMenu(null)} />
          <div className={`${styles.menu} glass-strong`} role="menu" style={menu}>
            {canComplete && (
              <button role="menuitem" className={`${styles.menuItem} ${styles.menuComplete}`} onClick={() => runAction(onComplete)}>
                <span className={styles.menuIcon}><CheckCircle2 size={15} /></span>
                Concluir
              </button>
            )}
            {goal.can_delete && (
              <button role="menuitem" className={`${styles.menuItem} ${styles.menuDelete}`} onClick={() => runAction(onDelete)}>
                <span className={styles.menuIcon}><Trash2 size={15} /></span>
                Excluir
              </button>
            )}
          </div>
        </>,
        document.body,
      )}
    </article>
  );
}