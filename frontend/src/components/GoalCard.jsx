'use client';
import Link from 'next/link';
import { Trash2, ArrowRight, Calendar, ListTodo, RefreshCw, CheckCircle2 } from 'lucide-react';
import styles from './GoalCard.module.css';

// Status do backend: 'open' | 'completed' | 'paused' | 'late'
const STATUS_META = {
  open:      { label: 'Em aberto',  color: '#3b82f6' },
  completed: { label: 'Concluída',  color: '#10b981' },
  paused:    { label: 'Pausada',    color: '#f59e0b' },
  late:      { label: 'Atrasada',   color: '#ef4444' },
};

export default function GoalCard({ goal, onDelete, onComplete }) {
  const progress = typeof goal.progress === 'number' ? Math.round(goal.progress) : 0;
  const meta = STATUS_META[goal.status] || STATUS_META.open;
  const isCompleted = goal.status === 'completed';

  return (
    <article className={`${styles.card} ${isCompleted ? '' : goal.status === 'late' ? styles.cardLate : ''} glass`}>
      {goal.status === 'late' && <div className={styles.lateStripe} />}
      {/* Status badge */}
      <div className={styles.badge} style={{ '--badge-color': meta.color }}>
        <span className={styles.badgeDot} />
        {meta.label}
      </div>

      <h3 className={styles.title}>{goal.title}</h3>
      {goal.description && (
        <p className={styles.desc}>{goal.description}</p>
      )}

      {/* Progress bar */}
      <div className={styles.progressWrap}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <span className={styles.progressLabel}>{progress}%</span>
      </div>

      {/* Meta info */}
      <div className={styles.meta}>
        <span className={styles.metaItem}>
          <ListTodo size={13} />
          {goal.total_tasks ?? 0} tarefa{goal.total_tasks !== 1 ? 's' : ''}
        </span>
        {goal.deadline && (
          <span className={styles.metaItem}>
            <Calendar size={13} />
            {new Date(goal.deadline).toLocaleDateString('pt-BR')}
          </span>
        )}
        {goal.tasks?.some(t => t.is_recurring) && (
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
        {!isCompleted && (
          <button
            className={styles.btnComplete}
            onClick={() => onComplete?.(goal.id)}
            aria-label="Marcar como concluída"
            title="Marcar como concluída"
          >
            <CheckCircle2 size={15} />
          </button>
        )}
        <button
          className={styles.btnDelete}
          onClick={() => onDelete?.(goal.id)}
          aria-label="Excluir meta"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}