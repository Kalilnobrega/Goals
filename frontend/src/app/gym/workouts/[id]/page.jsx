'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Pencil, Timer, TrendingUp } from 'lucide-react';
import { getWorkout, peekCache } from '../../../../lib/api';
import { muscleLabel, equipmentLabel, plural, prescription, formatRest } from '../../../../lib/gym';
import WorkoutBodyMap from '../../../../components/gym/WorkoutBodyMap';
import styles from './workout.module.css';

export default function WorkoutDetailPage() {
  const { id } = useParams();
  const [workout, setWorkout] = useState(() => peekCache(`fitnessWorkout:${id}`) ?? null);
  const [status, setStatus] = useState(workout ? 'ready' : 'loading');

  const load = useCallback(() => (
    getWorkout(id)
      .then(data => { setWorkout(data); setStatus('ready'); })
      .catch(err => setStatus(err?.response?.status === 404 ? 'missing' : 'error'))
  ), [id]);

  useEffect(() => {
    load();
  }, [load]);

  const back = <Link href="/gym/workouts" className={styles.back}><ChevronLeft size={18} /> Treinos</Link>;

  if (status === 'missing' || (status === 'error' && !workout)) {
    return (
      <div className={styles.page}>
        {back}
        <div className={styles.state}>
          <p>{status === 'missing' ? 'Essa ficha não existe ou foi excluída.' : 'Não foi possível carregar a ficha.'}</p>
          {status === 'missing'
            ? <Link href="/gym/workouts" className={styles.stateAction}>Ver suas fichas</Link>
            : <button type="button" className={styles.stateAction} onClick={load}>Tentar de novo</button>}
        </div>
      </div>
    );
  }

  if (!workout) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Carregando ficha">
        {back}
        <div className={styles.skeleton} />
        <div className={styles.skeletonTall} />
      </div>
    );
  }

  const exercises = workout.exercises;
  const totalSets = exercises.reduce((sum, item) => sum + item.target_sets, 0);

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        {back}
        <h1 className={styles.title}>{workout.name}</h1>
        <p className={styles.subtitle}>
          {exercises.length
            ? `${plural(exercises.length, 'exercício', 'exercícios')} · ${plural(totalSets, 'série', 'séries')}`
            : 'Sem exercícios'}
        </p>
        {workout.description && <p className={styles.description}>{workout.description}</p>}
      </div>

      <div className={styles.actions}>
        <Link href={`/gym/workouts/${workout.id}/edit`} className={styles.edit}><Pencil size={18} /> Editar</Link>
        <Link href={`/gym/progress/workouts/${workout.id}`} className={styles.edit}><TrendingUp size={18} /> Evolução</Link>
      </div>

      {exercises.length > 0 ? (
        <section className={styles.card} aria-labelledby="workout-exercises-title">
          <h2 id="workout-exercises-title" className={styles.cardTitle}>Exercícios</h2>
          <ol className={styles.list}>
            {exercises.map((item, index) => (
              <li key={item.id} className={styles.item}>
                <span className={styles.index}>{index + 1}</span>
                <span className={styles.itemText}>
                  <span className={styles.itemName}>{item.exercise.name}</span>
                  <span className={styles.itemMeta}>
                    {muscleLabel(item.exercise.muscle_group)} · {equipmentLabel(item.exercise.equipment)}
                  </span>
                </span>
                <span className={styles.itemTarget}>
                  <span className={styles.prescription}>{prescription(item)}</span>
                  {item.rest_seconds && (
                    <span className={styles.rest}><Timer size={12} aria-hidden="true" /> {formatRest(item.rest_seconds)}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <div className={styles.state}>
          <p>Nenhum exercício nesta ficha ainda.</p>
          <Link href={`/gym/workouts/${workout.id}/edit`} className={styles.stateAction}>Adicionar exercícios</Link>
        </div>
      )}

      <WorkoutBodyMap exercises={exercises} />
    </div>
  );
}
