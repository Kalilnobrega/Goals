'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, HeartPulse, Link2, Pencil, Timer, TrendingUp } from 'lucide-react';
import { getWorkout, peekCache } from '../../../../lib/api';
import { equipmentLabel, plural, prescription, formatRest, groupsLabel, canLoadPerSide, cardioNote, supersetMarks } from '../../../../lib/gym';
import WorkoutBodyMap from '../../../../components/gym/WorkoutBodyMap';
import UnilateralTag from '../../../../components/gym/UnilateralTag';
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
  const marks = supersetMarks(exercises);

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        {back}
        <h1 className={styles.title}>{workout.name}</h1>
        <p className={styles.subtitle}>
          {exercises.length
            ? `${plural(exercises.length, 'exercício', 'exercícios')} · ${plural(totalSets, 'série', 'séries')}`
            : 'Sem exercícios'}
          {cardioNote(workout)}
        </p>
        {workout.description && <p className={styles.description}>{workout.description}</p>}
      </div>

      <div className={styles.actions}>
        <Link href={`/gym/workouts/${workout.id}/edit`} className={styles.edit}><Pencil size={18} /> Editar</Link>
        <Link href={`/gym/progress/workouts/${workout.id}`} className={styles.edit}><TrendingUp size={18} /> Evolução</Link>
      </div>

      {cardioCard(workout, 'start', 'Cardio no início')}

      {exercises.length > 0 ? (
        <section className={styles.card} aria-labelledby="workout-exercises-title">
          <h2 id="workout-exercises-title" className={styles.cardTitle}>Exercícios</h2>
          <ol className={styles.list}>
            {exercises.map((item, index) => (
              <li key={item.id} className={`${styles.item} ${marks[index].grouped ? styles.itemSuperset : ''} ${marks[index].first ? styles.itemSupersetFirst : ''} ${marks[index].grouped && !marks[index].last ? styles.itemSupersetInner : ''}`}>
                {marks[index].first && <span className={styles.supersetTag}><Link2 size={12} aria-hidden="true" /> Superset · descanso no fim da rodada</span>}
                <span className={styles.index}>{marks[index].label}</span>
                <span className={styles.itemText}>
                  <span className={styles.itemName}>{item.exercise.name}</span>
                  <span className={styles.itemMeta}>
                    {groupsLabel(item.exercise)} · {equipmentLabel(item.exercise.equipment)}
                    {(item.unilateral ?? item.exercise.is_unilateral) && <>{' '}<UnilateralTag /></>}
                    {item.load_mode === 'side' && canLoadPerSide(item.exercise.equipment, item.unilateral ?? item.exercise.is_unilateral, item.exercise.tracking) && ' · carga de cada lado'}
                  </span>
                </span>
                <span className={styles.itemTarget}>
                  <span className={styles.prescription}>{prescription(item)}</span>
                  {item.rest_seconds && marks[index].last && (
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

      {cardioCard(workout, 'end', 'Cardio no final')}

      <WorkoutBodyMap exercises={exercises} />
    </div>
  );
}

function cardioCard(workout, phase, title) {
  const rows = (workout.cardio ?? []).filter(item => item.phase === phase);
  if (!rows.length) return null;
  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <ol className={styles.list}>
        {rows.map(item => (
          <li key={item.id} className={styles.item}>
            <span className={styles.index}><HeartPulse size={14} aria-hidden="true" /></span>
            <span className={styles.itemText}>
              <span className={styles.itemName}>{item.exercise?.name ?? 'Qualquer cardio'}</span>
              <span className={styles.itemMeta}>{item.exercise ? 'Cardio' : 'Você escolhe o aparelho na hora'}</span>
            </span>
            <span className={styles.itemTarget}>
              <span className={styles.prescription}>{item.minutes} min</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
