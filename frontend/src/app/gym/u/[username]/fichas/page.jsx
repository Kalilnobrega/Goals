'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { copyCloseWorkout, getClosePlan, getCloseWorkouts } from '../../../../../lib/api';
import { apiError, prescription, WEEKDAY_SHORT } from '../../../../../lib/gym';
import { useToast } from '../../../../../components/Toast';
import CloseHeader from '../../../../../components/gym/social/CloseHeader';
import styles from '../../../../../components/gym/social/close.module.css';

export default function CloseWorkoutsPage() {
  const { username } = useParams();
  const router = useRouter();
  const toast = useToast();
  const [workouts, setWorkouts] = useState(null);
  const [plan, setPlan] = useState(undefined);
  const [error, setError] = useState('');
  const [copying, setCopying] = useState(null);

  useEffect(() => {
    getCloseWorkouts(username).then(setWorkouts).catch((err) => setError(apiError(err, 'Não foi possível carregar as fichas.')));
    getClosePlan(username).then(setPlan).catch(() => setPlan(null));
  }, [username]);

  const copy = async (workout) => {
    setCopying(workout.id);
    try {
      const result = await copyCloseWorkout(username, workout.id);
      toast(result.skipped ? `Ficha "${result.name}" criada sem ${result.skipped} exercício(s) personalizado(s).` : `Ficha "${result.name}" criada`);
      router.push(`/gym/workouts/${result.workout_id}`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível copiar a ficha.') });
      setCopying(null);
    }
  };

  const byDay = new Map();
  (plan?.days ?? []).forEach((day) => byDay.set(day.weekday, [...(byDay.get(day.weekday) ?? []), day.workout_name]));

  return (
    <div className={styles.page}>
      <CloseHeader username={username} title="Fichas" />
      {error && <p className={styles.error}>{error}</p>}
      {plan && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Plano: {plan.name}</h2>
          <div className={styles.days}>
            {WEEKDAY_SHORT.map((label, weekday) => {
              const names = byDay.get(weekday);
              return (
                <div key={label} className={`${styles.day} ${names ? styles.dayOn : ''}`}>
                  <span className={styles.dayLabel}>{label}</span>
                  <span className={styles.dayWorkout}>{names ? names.join(' + ') : 'Descanso'}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {!workouts && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando fichas" />}
      {workouts && workouts.length === 0 && <p className={styles.muted}>Nenhuma ficha criada ainda.</p>}
      {workouts && workouts.map((workout) => (
        <section key={workout.id} className={styles.card}>
          <h2 className={styles.cardTitle}>{workout.name}</h2>
          {workout.description && <p className={styles.muted}>{workout.description}</p>}
          <ul className={styles.rows}>
            {workout.exercises.map((item) => (
              <li key={item.id} className={styles.rowItem}>
                <span className={styles.rowName}>{item.exercise.name}</span>
                <span className={styles.rowValue}>{prescription(item)}</span>
              </li>
            ))}
            {workout.cardio.map((item) => (
              <li key={`c${item.id}`} className={styles.rowItem}>
                <span className={styles.rowName}>{item.exercise?.name ?? 'Cardio'}</span>
                <span className={styles.rowValue}>{item.minutes} min</span>
              </li>
            ))}
          </ul>
          <button type="button" className={styles.copy} onClick={() => copy(workout)} disabled={copying === workout.id}>
            <Copy size={16} /> {copying === workout.id ? 'Copiando...' : 'Copiar para minhas fichas'}
          </button>
        </section>
      ))}
    </div>
  );
}
