'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, ChevronRight, ClipboardList, Play, Zap } from 'lucide-react';
import { getFitnessOverview, getWorkouts, peekCache } from '../../lib/api';
import { muscleLabel, plural, WEEKDAY_NAMES, weekdayOf, cardioNote } from '../../lib/gym';
import GymSheet from './GymSheet';
import useStartSession from './useStartSession';
import s from './sheet.module.css';
import styles from './StartWorkout.module.css';

const StartWorkoutContext = createContext(() => {});

export const useStartWorkout = () => useContext(StartWorkoutContext);

function todayOptions(overview) {
  if (!overview) return { label: null, items: [] };
  if (overview.plan) {
    return {
      label: `Hoje · ${WEEKDAY_NAMES[weekdayOf(overview.today)]} · ${overview.plan.name}`,
      items: overview.plan.today.filter(w => !w.done).map(w => ({ id: w.workout_id, name: w.name })),
    };
  }
  const next = overview.suggested_workout;
  return { label: 'Próximo da fila', items: next ? [{ id: next.id, name: next.name }] : [] };
}

function fichaMeta(workout) {
  if (!workout?.exercises?.length) return `Sem exercícios${cardioNote(workout)}`;
  const groups = [...new Set(workout.exercises.map(item => item.exercise.muscle_group))].slice(0, 3).map(muscleLabel);
  return `${plural(workout.exercises.length, 'exercício', 'exercícios')}${cardioNote(workout)} · ${groups.join(', ')}`;
}

function StartPicker({ overview, workouts, loadError, onRetry, starting, onChoose, onClose }) {
  const active = overview?.active_session;
  const today = todayOptions(overview);
  const todayIds = new Set(today.items.map(item => item.id));
  const byId = new Map((workouts ?? []).map(w => [w.id, w]));
  const others = (workouts ?? []).filter(w => !todayIds.has(w.id));

  return (
    <div className={s.stack}>
      {active && (
        <Link href={`/gym/session/${active.id}`} className={s.primary} onClick={onClose}>
          <Play size={18} fill="currentColor" /> Continuar {active.name}
        </Link>
      )}

      {today.items.length > 0 && (
        <section className={styles.group} aria-label={today.label}>
          <h3 className={styles.groupTitle}>{today.label}</h3>
          {today.items.map(item => (
            <button key={item.id} type="button" className={`${s.option} ${styles.highlight}`} onClick={() => onChoose(item.id)} disabled={starting}>
              <CalendarCheck size={20} className={styles.icon} aria-hidden="true" />
              <span>{item.name}<small>{fichaMeta(byId.get(item.id))}</small></span>
              <Play size={18} fill="currentColor" className={styles.play} aria-hidden="true" />
            </button>
          ))}
        </section>
      )}

      {loadError && !workouts && (
        <p className={s.text}>
          Não foi possível carregar suas fichas. <button type="button" className={styles.retry} onClick={onRetry}>Tentar de novo</button>
        </p>
      )}

      {!workouts && !loadError && (
        <div className={styles.group} aria-busy="true" aria-label="Carregando fichas">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      )}

      {others.length > 0 && (
        <section className={styles.group} aria-label={today.items.length ? 'Outras fichas' : 'Fichas'}>
          <h3 className={styles.groupTitle}>{today.items.length ? 'Outras fichas' : 'Fichas'}</h3>
          {others.map(workout => (
            <button key={workout.id} type="button" className={s.option} onClick={() => onChoose(workout.id)} disabled={starting}>
              <ClipboardList size={20} className={styles.icon} aria-hidden="true" />
              <span>{workout.name}<small>{fichaMeta(workout)}</small></span>
              <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
            </button>
          ))}
        </section>
      )}

      {workouts?.length === 0 && (
        <Link href="/gym/workouts/new" className={s.secondary} onClick={onClose}>Criar primeira ficha</Link>
      )}

      <button type="button" className={s.option} onClick={() => onChoose(null)} disabled={starting}>
        <Zap size={20} className={styles.icon} aria-hidden="true" />
        <span>Treino livre<small>Escolha os exercícios enquanto treina</small></span>
      </button>
    </div>
  );
}

export function StartWorkoutProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState(() => peekCache('fitnessOverview') ?? null);
  const [workouts, setWorkouts] = useState(() => peekCache('fitnessWorkouts') ?? null);
  const [loadError, setLoadError] = useState(false);
  const { begin, starting, sheet } = useStartSession();

  const load = useCallback(() => {
    setLoadError(false);
    getFitnessOverview().then(setOverview).catch(() => {});
    getWorkouts().then(setWorkouts).catch(() => setLoadError(true));
  }, []);

  const show = useCallback(() => {
    setOpen(true);
    load();
  }, [load]);

  const close = useCallback(() => setOpen(false), []);

  const choose = (workoutId) => {
    setOpen(false);
    begin(workoutId);
  };

  return (
    <StartWorkoutContext.Provider value={show}>
      {children}
      <GymSheet open={open} onClose={close} title="Iniciar treino">
        {open && (
          <StartPicker
            overview={overview}
            workouts={workouts}
            loadError={loadError}
            onRetry={load}
            starting={starting}
            onChoose={choose}
            onClose={close}
          />
        )}
      </GymSheet>
      {sheet}
    </StartWorkoutContext.Provider>
  );
}
