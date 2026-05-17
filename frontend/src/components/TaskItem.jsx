'use client';
import { useState } from 'react';
import { Check, Trash2, Pencil, RefreshCw } from 'lucide-react';
import styles from './TaskItem.module.css';

export default function TaskItem({ task, onToggle, onDelete, onEdit }) {
  const [hovered, setHovered] = useState(false);
  const done = task.status === true;

  return (
    <li
      className={`${styles.item} ${done ? styles.done : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className={`${styles.check} ${done ? styles.checked : ''}`}
        onClick={() => onToggle?.(task.id)}
        aria-label={done ? 'Marcar como pendente' : 'Concluir tarefa'}
      >
        {done && <Check size={11} strokeWidth={3} />}
      </button>

      <div className={styles.labelWrap}>
        <span className={styles.label}>{task.title}</span>
        {/* Hábito recorrente — usa recurrence_interval_days e recurrence_count */}
        {task.is_recurring && (
          <span className={styles.habit}>
            <RefreshCw size={10} />
            A cada {task.recurrence_interval_days}d
            {task.end_of_goal
              ? ' · até a meta vencer'
              : task.max_recurrences
                ? ` · ${task.recurrence_count ?? 0}/${task.max_recurrences}`
                : ''}
          </span>
        )}
      </div>

      <div className={`${styles.actions} ${hovered ? styles.visible : ''}`}>
        <button className={styles.iconBtn} onClick={() => onEdit?.(task)} aria-label="Editar">
          <Pencil size={13} />
        </button>
        <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => onDelete?.(task.id)} aria-label="Excluir">
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}