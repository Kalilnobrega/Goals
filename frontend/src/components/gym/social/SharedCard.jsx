'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ClipboardList, Copy, Dumbbell } from 'lucide-react';
import { apiError, equipmentLabel, muscleLabel, muscleName } from '../../../lib/gym';
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
  const isExercise = kind === 'exercise';

  const copy = async () => {
    setCopying(true);
    try {
      const result = await onCopy();
      const extra = result.skipped ? ` ${result.skipped === 1 ? '1 exercício personalizado ficou' : `${result.skipped} exercícios personalizados ficaram`} de fora.` : '';
      if (isExercise) {
        toast(`Exercício "${result.name}" adicionado à sua biblioteca`);
        router.push('/gym/exercises');
        return;
      }
      toast(isPlan ? `Plano "${result.name}" criado, sem ativar.${extra}` : `Ficha "${result.name}" criada.${extra}`);
      router.push(isPlan ? `/gym/plans/${result.id}` : `/gym/workouts/${result.id}`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível copiar.') });
      setCopying(false);
    }
  };

  if (isExercise) {
    const primary = snapshot.muscles.filter((m) => m.role === 'primary').map((m) => muscleName(m.muscle));
    const others = snapshot.muscles.filter((m) => m.role !== 'primary').map((m) => muscleName(m.muscle));
    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.icon}><Dumbbell size={16} /></span>
          <span className={styles.headerText}>
            <span className={styles.kind}>Exercício</span>
            <span className={styles.name}>{snapshot.name}</span>
          </span>
        </div>
        <ul className={styles.rows}>
          <li className={styles.row}><span className={styles.rowName}>Grupo</span><span className={styles.rowValue}>{muscleLabel(snapshot.muscle_group)}</span></li>
          <li className={styles.row}><span className={styles.rowName}>Equipamento</span><span className={styles.rowValue}>{equipmentLabel(snapshot.equipment)}</span></li>
          {primary.length > 0 && <li className={styles.row}><span className={styles.rowName}>Principal</span><span className={styles.rowValue}>{primary.join(', ')}</span></li>}
          {others.length > 0 && <li className={styles.row}><span className={styles.rowName}>Também trabalha</span><span className={styles.rowValue}>{others.join(', ')}</span></li>}
        </ul>
        {onCopy && !mine && (
          <button type="button" className={styles.copy} onClick={copy} disabled={copying}>
            <Copy size={16} /> {copying ? 'Copiando...' : 'Copiar para meus exercícios'}
          </button>
        )}
      </div>
    );
  }

  const byDay = new Map();
  if (isPlan) {
    snapshot.days.forEach((day) => {
      const name = snapshot.workouts[day.workout]?.name;
      if (name) byDay.set(day.weekday, [...(byDay.get(day.weekday) ?? []), name]);
    });
  }

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
                <span className={styles.dayWorkout}>{byDay.get(weekday)?.join(' + ') ?? '—'}</span>
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
