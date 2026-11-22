'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarCheck, ChevronRight, ClipboardList, Link2, Play, Timer, Zap } from 'lucide-react';
import { getFitnessOverview, getWorkouts, peekCache } from '../../lib/api';
import {
  muscleLabel, plural, WEEKDAY_NAMES, weekdayOf, cardioNote, prescription, formatRest, equipmentLabel, gripLabel,
  canLoadPerSide, cardioMinutes, supersetMarks, planSummary,
} from '../../lib/gym';
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

function exerciseDetails(item) {
  const { exercise } = item;
  const unilateral = item.unilateral ?? exercise.is_unilateral;
  return [
    exercise.grip && `Pegada ${gripLabel(exercise.grip).toLowerCase()}`,
    equipmentLabel(exercise.equipment),
    unilateral && 'Unilateral',
    item.load_mode === 'side' && canLoadPerSide(exercise.equipment, unilateral, exercise.tracking) && 'Carga por lado',
    planSummary(item.set_plan),
  ].filter(Boolean).join(' · ');
}

function CardioRows({ workout, phase, label }) {
  return (workout.cardio ?? []).filter(item => item.phase === phase).map(item => (
    <li key={`c${item.id}`} className={styles.row}>
      <span className={styles.rowMain}>
        <span className={styles.rowName}>{item.exercise?.name ?? 'Qualquer cardio'}</span>
        <span className={styles.rowTarget}>{item.minutes} min</span>
      </span>
      <span className={styles.rowDetails}>{label}</span>
    </li>
  ));
}

function WorkoutPreview({ workout, starting, onStart, onBack }) {
  if (!workout) {
    return (
      <div className={styles.group} aria-busy="true" aria-label="Carregando ficha">
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
    );
  }
  const exercises = workout.exercises ?? [];
  const totalSets = exercises.reduce((sum, item) => sum + item.target_sets, 0);
  const marks = supersetMarks(exercises);
  const minutes = cardioMinutes(workout);
  const summary = [
    plural(exercises.length, 'exercício', 'exercícios'),
    plural(totalSets, 'série', 'séries'),
    minutes && `${minutes} min de cardio`,
  ].filter(Boolean).join(' · ');

  return (
    <div className={s.stack}>
      <p className={styles.summary}>{summary}</p>
      <ol className={styles.list}>
        <CardioRows workout={workout} phase="start" label="Cardio no início" />
        {exercises.map((item, index) => (
          <li key={item.id} className={`${styles.row} ${marks[index].grouped ? styles.rowSuperset : ''} ${marks[index].grouped && !marks[index].last ? styles.rowSupersetInner : ''}`}>
            {marks[index].first && <span className={styles.rowSupersetTag}><Link2 size={11} aria-hidden="true" /> Superset</span>}
            <span className={styles.rowMain}>
              <span className={styles.rowName}>{item.exercise.name}</span>
              <span className={styles.rowTarget}>{prescription(item)}</span>
            </span>
            <span className={styles.rowDetails}>
              {exerciseDetails(item)}
              {item.rest_seconds && marks[index].last ? <span className={styles.rowRest}><Timer size={11} aria-hidden="true" /> {formatRest(item.rest_seconds)}</span> : null}
            </span>
          </li>
        ))}
        <CardioRows workout={workout} phase="end" label="Cardio no final" />
      </ol>
      {workout.description && <p className={styles.note}>{workout.description}</p>}
      <div className={s.actions}>
        <button type="button" className={s.primary} onClick={onStart} disabled={starting}>
          <Play size={18} fill="currentColor" /> {starting ? 'Iniciando…' : 'Começar treino'}
        </button>
        <button type="button" className={s.secondary} onClick={onBack} disabled={starting}>
          <ArrowLeft size={18} /> Voltar
        </button>
      </div>
    </div>
  );
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
  const [previewId, setPreviewId] = useState(null);
  const { begin, starting, sheet } = useStartSession();

  const load = useCallback(() => {
    setLoadError(false);
    getFitnessOverview().then(setOverview).catch(() => {});
    getWorkouts().then(setWorkouts).catch(() => setLoadError(true));
  }, []);

  const show = useCallback(() => {
    setPreviewId(null);
    setOpen(true);
    load();
  }, [load]);

  const close = useCallback(() => setOpen(false), []);

  const startNow = (workoutId) => {
    setOpen(false);
    begin(workoutId);
  };

  const choose = (workoutId) => {
    if (workoutId === null) return startNow(null);
    setPreviewId(workoutId);
  };

  const previewWorkout = previewId === null ? null : (workouts ?? []).find(w => w.id === previewId);

  return (
    <StartWorkoutContext.Provider value={show}>
      {children}
      <GymSheet open={open} onClose={close} title={previewId === null ? 'Iniciar treino' : (previewWorkout?.name ?? 'Ficha')}>
        {open && previewId !== null && (
          <WorkoutPreview
            workout={previewWorkout}
            starting={starting}
            onStart={() => startNow(previewId)}
            onBack={() => setPreviewId(null)}
          />
        )}
        {open && previewId === null && (
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
