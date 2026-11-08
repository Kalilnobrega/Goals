'use client';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Trash2, ArrowRight, Calendar, ListTodo, RefreshCw, CheckCircle2, Target, Users, Trophy, MoreVertical, LogOut } from 'lucide-react';
import SuperGoalIcon from './SuperGoalIcon';
import CountUp from './CountUp';
import { useDropSettle } from '../lib/useDropSettle';
import { useCardLink } from '../lib/useCardLink';
import { formatDeadline, formatShortDeadline, cycleNotStarted } from '../lib/date';
import { formatProgressValue, hasTarget } from '../lib/numeric';
import styles from './GoalCard.module.css';

// Status do backend: 'open' | 'completed' | 'late'
const STATUS_META = {
  open:      { label: 'Em aberto',  color: '#3b82f6' },
  completed: { label: 'Concluída',  color: '#10b981' },
  late:      { label: 'Atrasada',   color: '#ef4444' },
};

const stopEvent = (event) => event.stopPropagation();

const RING_RADIUS = 18;
const RING_DURATION_MS = 700;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const KIND_META = {
  collaborative: { label: 'Colaborativa', color: '#8b5cf6', icon: Users },
  challenge:     { label: 'Desafio',      color: '#d97706', icon: Trophy },
};

export default function GoalCard({ goal, onDelete, onComplete, onMoveToSuperGoal, onRemoveFromSuperGoal, dragHandle, dragging, entering = true }) {
  const progress = typeof goal.progress === 'number' ? Math.round(goal.progress) : 0;
  const meta = STATUS_META[goal.status] || STATUS_META.open;
  const isCompleted = goal.status === 'completed';
  const kind = KIND_META[goal.group_kind];
  const isLate = goal.status === 'late';
  const barTone = isLate ? styles.toneLate : (isCompleted || progress >= 100) ? styles.toneComplete : '';
  const canComplete = !isCompleted && goal.can_complete;
  const inSuperGoal = goal.super_goal_id != null;
  const hasActions = canComplete || goal.can_delete || onMoveToSuperGoal || (inSuperGoal && onRemoveFromSuperGoal);
  const [menu, setMenu] = useState(null);
  const [settling, endSettle] = useDropSettle(dragging);
  const [seenProgress, setSeenProgress] = useState(progress);
  const [flash, setFlash] = useState(false);

  if (progress !== seenProgress) {
    setSeenProgress(progress);
    if (seenProgress < 100 && progress >= 100) setFlash(true);
  }
  const cardLink = useCardLink(`/goals/${goal.id}`, dragging);
  const menuButton = useRef(null);

  const shownMeta = [
    goal.is_numeric && 'numeric',
    goal.deadline && 'deadline',
    !goal.is_numeric && 'tasks',
    goal.group_kind && 'people',
  ].filter(Boolean).slice(0, 3);
  const metaClass = (key) => [
    styles.metaItem,
    shownMeta.includes(key) && styles.metaShown,
    shownMeta[0] === key && styles.metaLead,
  ].filter(Boolean).join(' ');
  const cycleStart = cycleNotStarted(goal);

  const closeMenu = () => setMenu(current => current && { ...current, closing: true });

  const openMenu = () => {
    if (menu && !menu.closing) return closeMenu();
    const rect = menuButton.current.getBoundingClientRect();
    const above = rect.bottom + 200 > window.innerHeight;
    setMenu({
      above,
      closing: false,
      style: {
        right: window.innerWidth - rect.right,
        ...(above ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      },
    });
  };

  const finishMenuAnimation = (event) => {
    if (event.target === event.currentTarget && menu?.closing) setMenu(null);
  };

  const runAction = (action) => {
    closeMenu();
    action();
  };


  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e) => e.key === 'Escape' && setMenu(current => current && { ...current, closing: true });
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
    <article className={`${styles.card} ${entering ? styles.cardEntering : ''} ${isCompleted ? '' : goal.status === 'late' ? styles.cardLate : ''} ${dragging ? styles.cardDragging : ''} ${settling ? styles.cardSettling : ''} glass`} {...cardLink} onAnimationEnd={endSettle} aria-label={goal.title}>
      <div className={styles.topRow}>
        <div className={styles.badges}>
          <div className={`${styles.badge} ${styles.statusBadge}`} style={{ '--badge-color': meta.color }}>
            <span className={styles.badgeDot} />
            {meta.label}
          </div>
          {kind && (
            <div className={styles.badge} style={{ '--badge-color': kind.color }} title={kind.label}>
              <kind.icon size={12} strokeWidth={2.5} />
              <span className={styles.kindLabel}>{kind.label}</span>
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
              aria-expanded={!!menu && !menu.closing}
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
        <div className={`${styles.progressWrap} ${flash ? styles.flash : ''}`} onAnimationEnd={(e) => e.target === e.currentTarget && setFlash(false)}>
          <div className={styles.progressBar}>
            <div className={`${styles.progressFill} ${barTone}`} style={{ width: `${progress}%` }} />
          </div>
          <span className={`${styles.progressLabel} ${barTone}`}><CountUp value={`${progress}%`} duration={RING_DURATION_MS} /></span>
        </div>
      )}

      {!(goal.is_numeric && !hasTarget(goal)) && (
        <div className={`${styles.ring} ${barTone} ${flash ? styles.flash : ''}`} onAnimationEnd={(e) => e.target === e.currentTarget && setFlash(false)} role="img" aria-label={`${progress}% concluído`}>
          <svg viewBox="0 0 44 44" className={styles.ringSvg}>
            <circle className={styles.ringTrack} cx="22" cy="22" r={RING_RADIUS} />
            <circle
              className={styles.ringFill}
              cx="22"
              cy="22"
              r={RING_RADIUS}
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - Math.min(progress, 100) / 100)}
            />
          </svg>
          <span className={styles.ringLabel}><CountUp value={progress} duration={RING_DURATION_MS} /><small>%</small></span>
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
            <span className={styles.short} aria-hidden="true">{cycleStart ? formatShortDeadline(goal.cycle_start_date) : 'Ciclo'}</span>
            <span className={styles.long}>{cycleStart ? `Começa em ${formatDeadline(goal.cycle_start_date)}` : 'Por ciclo'}</span>
          </span>
        ) : goal.is_recurring ? (
          <span className={styles.metaItem}>
            <RefreshCw size={13} />
            <span className={styles.short} aria-hidden="true">
              {cycleStart
                ? formatShortDeadline(goal.cycle_start_date)
                : `${goal.current_cycle_progress ?? 0}/${goal.recurrence_target ?? 1}`}
            </span>
            <span className={styles.long}>
              {cycleStart
                ? `Começa em ${formatDeadline(goal.cycle_start_date)}`
                : `${goal.current_cycle_progress ?? 0}/${goal.recurrence_target ?? 1} neste ciclo`}
            </span>
          </span>
        ) : goal.tasks?.some(t => t.is_recurring) && (
          <span className={styles.metaItem}>
            <RefreshCw size={13} />
            <span className={styles.short} aria-hidden="true">Hábitos</span>
            <span className={styles.long}>Hábitos ativos</span>
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
        <div
          className={styles.menuLayer}
          onClick={stopEvent}
          onMouseDown={stopEvent}
          onTouchStart={stopEvent}
        >
          {!menu.closing && <div className={styles.menuBackdrop} onClick={closeMenu} />}
          <div
            className={`${styles.menu} ${menu.above ? styles.menuAbove : ''} ${menu.closing ? styles.menuClosing : ''} glass-strong`}
            role="menu"
            style={menu.style}
            onAnimationEnd={finishMenuAnimation}
          >
            {canComplete && (
              <button role="menuitem" className={`${styles.menuItem} ${styles.menuComplete} ${styles.menuMobileOnly}`} onClick={() => runAction(() => onComplete?.(goal.id))}>
                <span className={styles.menuIcon}><CheckCircle2 size={15} /></span>
                Concluir
              </button>
            )}
            {onMoveToSuperGoal && (
              <button role="menuitem" className={`${styles.menuItem} ${styles.menuSuper}`} onClick={() => runAction(() => onMoveToSuperGoal(goal))}>
                <span className={styles.menuIcon}><SuperGoalIcon size={15} /></span>
                {inSuperGoal ? 'Trocar de supermeta' : 'Mover para supermeta'}
              </button>
            )}
            {inSuperGoal && onRemoveFromSuperGoal && (
              <button role="menuitem" className={`${styles.menuItem} ${styles.menuNeutral}`} onClick={() => runAction(() => onRemoveFromSuperGoal(goal))}>
                <span className={styles.menuIcon}><LogOut size={15} /></span>
                Tirar da supermeta
              </button>
            )}
            {goal.can_delete && (
              <button role="menuitem" className={`${styles.menuItem} ${styles.menuDelete} ${styles.menuMobileOnly}`} onClick={() => runAction(() => onDelete?.(goal.id))}>
                <span className={styles.menuIcon}><Trash2 size={15} /></span>
                Excluir
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </article>
  );
}
