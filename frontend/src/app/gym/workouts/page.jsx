'use client';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Plus, ClipboardList, History, ChevronRight, X } from 'lucide-react';
import { getWorkouts, peekCache } from '../../../lib/api';
import { prescription, workoutMuscles, plural, cardioNote } from '../../../lib/gym';
import { clearDraft, draftKey, readDraftRaw, subscribeDrafts } from '../../../lib/workoutDraft';
import { WorkoutBodyMini } from '../../../components/gym/WorkoutBodyMap';
import { useBodyType } from '../../../components/gym/BodyMap';
import SegmentTabs, { WORKOUT_TABS } from '../../../components/gym/SegmentTabs';
import Floating from '../../../components/gym/Floating';
import { useConfirm } from '../../../components/ConfirmDialog';
import styles from './page.module.css';

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState(() => peekCache('fitnessWorkouts') ?? null);
  const [loadError, setLoadError] = useState(false);
  const [bodyType] = useBodyType();
  const confirmAction = useConfirm();
  const draftRaw = useSyncExternalStore(subscribeDrafts, () => readDraftRaw(draftKey()), () => null);
  const draft = useMemo(() => {
    try {
      return draftRaw ? JSON.parse(draftRaw) : null;
    } catch {
      return null;
    }
  }, [draftRaw]);

  const fetchWorkouts = useCallback(() => {
    setLoadError(false);
    return getWorkouts().then(setWorkouts).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getWorkouts().then(setWorkouts).catch(() => setLoadError(true));
  }, []);

  const discardDraft = async () => {
    const ok = await confirmAction({
      title: 'Descartar ficha em criação',
      message: ['O que você montou até agora será perdido.'],
      confirmLabel: 'Descartar',
    });
    if (ok) clearDraft(draftKey());
  };

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

      <SegmentTabs tabs={WORKOUT_TABS} label="Treinos" />

      {draft && (
        <div className={styles.draftCard}>
          <Link href="/gym/workouts/new" className={styles.draftLink}>
            <History size={20} className={styles.draftIcon} aria-hidden="true" />
            <span className={styles.cardMain}>
              <span className={styles.draftLabel}>Continuar ficha em criação</span>
              <span className={styles.cardName}>{draft.name?.trim() || 'Ficha sem nome'}</span>
              <span className={styles.cardMeta}>
                {draft.items?.length ? plural(draft.items.length, 'exercício', 'exercícios') : 'Sem exercícios'}
                {draft.cardio?.length ? ` · ${plural(draft.cardio.length, 'cardio', 'cardios')}` : ''}
              </span>
            </span>
            <ChevronRight size={20} className={styles.draftIcon} aria-hidden="true" />
          </Link>
          <button type="button" className={styles.draftDiscard} onClick={discardDraft} aria-label="Descartar ficha em criação">
            <X size={18} />
          </button>
        </div>
      )}

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
                      {cardioNote(workout)}
                      {muscles.length > 0 && ` · ${muscles.slice(0, 3).join(', ')}`}
                    </span>
                    {workout.exercises.length > 0 && (
                      <span className={styles.previewWrap}>
                      <WorkoutBodyMini exercises={workout.exercises} sex={bodyType} />
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
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Floating>
        <Link href="/gym/workouts/new" className={styles.fab} aria-label="Nova ficha">
          <Plus size={26} strokeWidth={2.4} />
        </Link>
      </Floating>
    </div>
  );
}
