'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Play, ClipboardList, Zap } from 'lucide-react';
import { getWorkouts, peekCache } from '../../../lib/api';
import { prescription, workoutMuscles, plural } from '../../../lib/gym';
import ActiveSessionBanner from '../../../components/gym/ActiveSessionBanner';
import useStartSession from '../../../components/gym/useStartSession';
import styles from './page.module.css';

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState(() => peekCache('fitnessWorkouts') ?? null);
  const [loadError, setLoadError] = useState(false);
  const { begin, starting, sheet } = useStartSession();

  const fetchWorkouts = useCallback(() => {
    setLoadError(false);
    return getWorkouts().then(setWorkouts).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getWorkouts().then(setWorkouts).catch(() => setLoadError(true));
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.title}>Treinos</h1>
          <p className={styles.subtitle}>
            {workouts?.length ? plural(workouts.length, 'ficha', 'fichas') : 'Suas fichas de treino'}
          </p>
        </div>
        <Link href="/gym/workouts/new" className={styles.newDesktop}>
          <Plus size={18} strokeWidth={2.4} /> Nova ficha
        </Link>
      </header>

      <ActiveSessionBanner />

      {loadError && !workouts && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Não foi possível carregar as fichas.</p>
          <button type="button" className={styles.stateAction} onClick={fetchWorkouts}>Tentar de novo</button>
        </div>
      )}

      {!workouts && !loadError && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando fichas">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
      )}

      {workouts?.length === 0 && (
        <div className={styles.state}>
          <ClipboardList size={34} className={styles.stateIcon} aria-hidden="true" />
          <p className={styles.stateTitle}>Nenhuma ficha ainda.</p>
          <p className={styles.stateText}>
            Monte sua primeira ficha com os exercícios, séries e repetições que você costuma fazer.
          </p>
          <Link href="/gym/workouts/new" className={styles.stateAction}>Criar ficha</Link>
        </div>
      )}

      {workouts?.length > 0 && (
        <ul className={styles.list}>
          {workouts.map(workout => {
            const muscles = workoutMuscles(workout);
            return (
              <li key={workout.id} className={styles.card}>
                <Link href={`/gym/workouts/${workout.id}`} className={styles.cardLink}>
                  <span className={styles.cardMain}>
                    <span className={styles.cardName}>{workout.name}</span>
                    <span className={styles.cardMeta}>
                      {workout.exercises.length
                        ? plural(workout.exercises.length, 'exercício', 'exercícios')
                        : 'Sem exercícios'}
                      {muscles.length > 0 && ` · ${muscles.slice(0, 3).join(', ')}`}
                    </span>
                    {workout.exercises.length > 0 && (
                      <span className={styles.preview}>
                        {workout.exercises.slice(0, 3).map(item => (
                          <span key={item.id} className={styles.previewRow}>
                            <span className={styles.previewName}>{item.exercise.name}</span>
                            <span className={styles.previewTarget}>{prescription(item)}</span>
                          </span>
                        ))}
                        {workout.exercises.length > 3 && (
                          <span className={styles.previewMore}>+{workout.exercises.length - 3}</span>
                        )}
                      </span>
                    )}
                  </span>
                </Link>
                <button
                  type="button"
                  className={styles.play}
                  onClick={() => begin(workout.id)}
                  disabled={starting}
                  aria-label={`Iniciar ${workout.name}`}
                >
                  <Play size={20} fill="currentColor" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {workouts && (
        <button type="button" className={styles.free} onClick={() => begin(null)} disabled={starting}>
          <Zap size={18} /> Começar treino livre
        </button>
      )}

      {sheet}

      <Link href="/gym/workouts/new" className={styles.fab} aria-label="Nova ficha">
        <Plus size={26} strokeWidth={2.4} />
      </Link>
    </div>
  );
}
