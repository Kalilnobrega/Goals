'use client';
import Link from 'next/link';
import { Trash2, ArrowRight, Calendar, ListTodo, RefreshCw, CheckCircle2, Target, Users, Trophy } from 'lucide-react';
import { formatDeadline, cycleNotStarted } from '../lib/date';
import { formatProgressValue } from '../lib/numeric';
import styles from './GoalCard.module.css';

// Status do backend: 'open' | 'completed' | 'late'
const STATUS_META = {
  open:      { label: 'Em aberto',  color: '#3b82f6' },
  completed: { label: 'Concluída',  color: '#10b981' },
  late:      { label: 'Atrasada',   color: '#ef4444' },
};

export default function GoalCard({ goal, onDelete, onComplete, dragHandle, dragging }) {
  const progress = typeof goal.progress === 'number' ? Math.round(goal.progress) : 0;
  const meta = STATUS_META[goal.status] || STATUS_META.open;
  const isCompleted = goal.status === 'completed';

  return (
    <article className={`${styles.card} ${isCompleted ? '' : goal.status === 'late' ? styles.cardLate : ''} ${dragging ? styles.cardDragging : ''} glass`}>
      <div className={styles.topRow}>
        <div className={styles.badge} style={{ '--badge-color': meta.color }}>
          <span className={styles.badgeDot} />
          {meta.label}
        </div>
        {dragHandle}
      </div>

      <h3 className={styles.title}>{goal.title}</h3>
      {goal.description && (
        <p className={styles.desc}>{goal.description}</p>
      )}

      {/* Progress bar */}
      <div className={styles.progressWrap}>
        <div className={styles.progressBar}>
          <div className={`${styles.progressFill} ${progress >= 100 ? styles.progressFillComplete : ''}`} style={{ width: `${progress}%` }} />
        </div>
        <span className={`${styles.progressLabel} ${progress >= 100 ? styles.progressLabelComplete : ''}`}>{progress}%</span>
      </div>

      {/* Meta info */}
      <div className={styles.meta}>
        {goal.is_numeric ? (
          <span className={styles.metaItem}>
            <Target size={13} />
            {formatProgressValue(goal)}
          </span>
        ) : (
          <span className={styles.metaItem}>
            <ListTodo size={13} />
            {goal.total_tasks ?? 0} tarefa{goal.total_tasks !== 1 ? 's' : ''}
          </span>
        )}
        {goal.group_kind && (
          <span className={styles.metaItem}>
            {goal.group_kind === 'challenge' ? <Trophy size={13} /> : <Users size={13} />}
            {goal.group_kind === 'challenge' ? 'Desafio' : 'Compartilhada'} · {goal.member_count} pessoa{goal.member_count !== 1 ? 's' : ''}
          </span>
        )}
        {goal.deadline && (
          <span className={styles.metaItem}>
            <Calendar size={13} />
            {formatDeadline(goal.deadline)}
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

      {/* Actions */}
      <div className={styles.actions}>
        <Link href={`/goals/${goal.id}`} className={styles.btnPrimary}>
          Ver detalhes <ArrowRight size={14} />
        </Link>
        {!isCompleted && goal.can_complete && (
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
    </article>
  );
}