'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Plus, X, Trash2, Check, Moon } from 'lucide-react';
import { WEEKDAY_NAMES, plural } from '../../lib/gym';
import GymSheet from './GymSheet';
import PlanSummary, { summarizePlan } from './PlanSummary';
import PlanWeek from './PlanWeek';
import sheetStyles from './sheet.module.css';
import styles from './PlanEditor.module.css';

const emptyWeek = () => Array.from({ length: 7 }, () => []);

function weekFrom(plan) {
  const week = emptyWeek();
  plan?.days.forEach(day => week[day.weekday].push(day.workout_id));
  return week;
}

export default function PlanEditor({ initial, workouts, onSubmit, onDelete }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [active, setActive] = useState(initial ? initial.is_active : true);
  const [week, setWeek] = useState(() => weekFrom(initial));
  const [picking, setPicking] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const byId = new Map(workouts.map(w => [w.id, w]));
  const trainingDays = week.filter(day => day.length).length;
  const closePicker = useCallback(() => setPicking(null), []);
  const closeReview = useCallback(() => setReviewing(false), []);

  const add = (weekday, workoutId) => {
    setWeek(current => current.map((ids, i) => (i === weekday && !ids.includes(workoutId) ? [...ids, workoutId] : ids)));
    setPicking(null);
  };

  const remove = (weekday, workoutId) => {
    setWeek(current => current.map((ids, i) => (i === weekday ? ids.filter(id => id !== workoutId) : ids)));
  };

  const submit = (event) => {
    event.preventDefault();
    if (!name.trim()) return setError('Dê um nome para o plano, ex.: Treino 1.');
    setError('');
    setReviewing(true);
  };

  const confirm = async () => {
    setSaving(true);
    const days = week.flatMap((ids, weekday) => ids.filter(id => byId.has(id)).map(workoutId => ({ weekday, workout_id: workoutId })));
    const problem = await onSubmit({ name: name.trim(), days, is_active: active });
    setSaving(false);
    if (problem) {
      setReviewing(false);
      setError(problem);
    }
  };

  const reviewWeek = week.map(ids => ids.map(id => byId.get(id)).filter(Boolean));

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>
        <span className={styles.label}>Nome do plano</span>
        <input
          className={styles.name}
          value={name}
          onChange={e => setName(e.target.value.slice(0, 60))}
          placeholder="Ex.: Treino 1, Upper/Lower"
        />
      </label>

      <label className={styles.toggle}>
        <span className={styles.toggleText}>
          <span className={styles.toggleTitle}>Plano ativo</span>
          <span className={styles.toggleHint}>As fichas do plano ativo aparecem nos dias certos no início</span>
        </span>
        <input type="checkbox" className={styles.switch} checked={active} onChange={e => setActive(e.target.checked)} />
      </label>

      <div className={styles.weekHeader}>
        <h2 className={styles.weekTitle}>Semana</h2>
        <span className={styles.weekMeta}>{plural(trainingDays, 'dia de treino', 'dias de treino')}</span>
      </div>

      {workouts.length === 0 && (
        <p className={styles.notice}>
          Você ainda não tem fichas. <Link href="/gym/workouts/new">Crie uma ficha</Link> para colocar no plano.
        </p>
      )}

      <ol className={styles.days}>
        {week.map((ids, weekday) => {
          const items = ids.map(id => byId.get(id)).filter(Boolean);
          return (
            <li key={WEEKDAY_NAMES[weekday]} className={`${styles.day} ${items.length ? styles.dayTraining : ''}`}>
              <span className={styles.dayName}>{WEEKDAY_NAMES[weekday]}</span>
              <div className={styles.dayItems}>
                {items.length === 0 && (
                  <span className={styles.rest}><Moon size={14} aria-hidden="true" /> Descanso</span>
                )}
                {items.map(workout => (
                  <span key={workout.id} className={styles.chip}>
                    <span className={styles.chipName}>{workout.name}</span>
                    <button
                      type="button"
                      className={styles.chipRemove}
                      onClick={() => remove(weekday, workout.id)}
                      aria-label={`Tirar ${workout.name} de ${WEEKDAY_NAMES[weekday].toLowerCase()}`}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
                {workouts.length > 0 && (
                  <button
                    type="button"
                    className={styles.add}
                    onClick={() => setPicking(weekday)}
                    aria-label={`Adicionar ficha na ${WEEKDAY_NAMES[weekday].toLowerCase()}`}
                  >
                    <Plus size={16} strokeWidth={2.4} /> {items.length ? '' : 'Ficha'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        {onDelete && (
          <button type="button" className={styles.delete} onClick={onDelete} aria-label="Excluir plano">
            <Trash2 size={20} />
          </button>
        )}
        <button type="submit" className={styles.save} disabled={saving}>
          <Check size={20} strokeWidth={2.6} /> Salvar plano
        </button>
      </div>

      <GymSheet open={reviewing} onClose={closeReview} title={name.trim() || 'Plano'}>
        {reviewing && (
          <div className={sheetStyles.stack}>
            <PlanWeek week={reviewWeek} />
            <PlanSummary summary={summarizePlan(week, byId)} bare />
            <div className={sheetStyles.actions}>
              <button type="button" className={sheetStyles.primary} onClick={confirm} disabled={saving}>
                <Check size={20} strokeWidth={2.6} /> {saving ? 'Salvando…' : 'Confirmar'}
              </button>
              <button type="button" className={sheetStyles.secondary} onClick={closeReview} disabled={saving}>
                Voltar e editar
              </button>
            </div>
          </div>
        )}
      </GymSheet>

      <GymSheet
        open={picking !== null}
        onClose={closePicker}
        title={picking !== null ? `Ficha de ${WEEKDAY_NAMES[picking].toLowerCase()}` : ''}
      >
        {picking !== null && (
          <ul className={styles.pickList}>
            {workouts.map(workout => {
              const chosen = week[picking].includes(workout.id);
              return (
                <li key={workout.id}>
                  <button
                    type="button"
                    className={styles.pick}
                    onClick={() => add(picking, workout.id)}
                    disabled={chosen}
                  >
                    <span className={styles.pickName}>{workout.name}</span>
                    <span className={styles.pickMeta}>
                      {chosen ? 'Já está neste dia' : plural(workout.exercises.length, 'exercício', 'exercícios')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </GymSheet>
    </form>
  );
}
