'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ClipboardList, Copy } from 'lucide-react';
import { apiError } from '../../../lib/gym';
import { useToast } from '../../Toast';
import styles from './SharedCard.module.css';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function reps(item) {
  return item.reps_max ? `${item.reps_min}–${item.reps_max}` : `${item.reps_min}`;
}

function WorkoutRows({ workout }) {
  return (
    <ul className={styles.rows}>
      {workout.exercises.map((item, index) => (
        <li key={`${item.exercise_id}-${index}`} className={styles.row}>
          <span className={styles.rowName}>{item.name}</span>
          <span className={styles.rowValue}>{item.target_sets} × {reps(item)}</span>
        </li>
      ))}
      {workout.cardio.map((item, index) => (
        <li key={`c${index}`} className={styles.row}>
          <span className={styles.rowName}>{item.name}</span>
          <span className={styles.rowValue}>{item.minutes} min</span>
        </li>
      ))}
    </ul>
  );
}

export default function SharedCard({ kind, snapshot, onCopy, mine = false }) {
  const router = useRouter();
  const toast = useToast();
  const [copying, setCopying] = useState(false);
  const isPlan = kind === 'plan';

  const copy = async () => {
    setCopying(true);
    try {
      const result = await onCopy();
      const extra = result.skipped ? ` ${result.skipped === 1 ? '1 exercício personalizado ficou' : `${result.skipped} exercícios personalizados ficaram`} de fora.` : '';
      toast(isPlan ? `Plano "${result.name}" criado, sem ativar.${extra}` : `Ficha "${result.name}" criada.${extra}`);
      router.push(isPlan ? `/gym/plans/${result.id}` : `/gym/workouts/${result.id}`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível copiar.') });
      setCopying(false);
    }
  };

  const byDay = isPlan ? new Map(snapshot.days.map((day) => [day.weekday, snapshot.workouts[day.workout]?.name])) : null;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.icon}>{isPlan ? <CalendarDays size={16} /> : <ClipboardList size={16} />}</span>
        <span className={styles.headerText}>
          <span className={styles.kind}>{isPlan ? 'Plano' : 'Ficha'}</span>
          <span className={styles.name}>{snapshot.name}</span>
        </span>
      </div>
      {isPlan ? (
        <>
          <div className={styles.days}>
            {WEEKDAYS.map((label, weekday) => (
              <div key={label} className={`${styles.day} ${byDay.get(weekday) ? styles.dayOn : ''}`}>
                <span className={styles.dayLabel}>{label}</span>
                <span className={styles.dayWorkout}>{byDay.get(weekday) ?? '—'}</span>
              </div>
            ))}
          </div>
          {Object.entries(snapshot.workouts).map(([key, workout]) => (
            <details key={key} className={styles.details}>
              <summary>{workout.name}</summary>
              <WorkoutRows workout={workout} />
            </details>
          ))}
        </>
      ) : (
        <WorkoutRows workout={snapshot} />
      )}
      {onCopy && !mine && (
        <button type="button" className={styles.copy} onClick={copy} disabled={copying}>
          <Copy size={16} /> {copying ? 'Copiando...' : isPlan ? 'Copiar plano' : 'Copiar para minhas fichas'}
        </button>
      )}
    </div>
  );
}
