'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, Trash2, Dumbbell } from 'lucide-react';
import { getExercises, peekCache } from '../../lib/api';
import { equipmentLabel, plural, REST_OPTIONS, formatRest, groupsLabel, familySiblings } from '../../lib/gym';
import { SortableList, SortableItem, DragHandle } from '../Sortable';
import { useToast } from '../Toast';
import GymSheet from './GymSheet';
import GymSelect from './GymSelect';
import ExercisePicker from './ExercisePicker';
import WorkoutBodyMap from './WorkoutBodyMap';
import styles from './WorkoutEditor.module.css';

let nextKey = 0;
const newKey = () => `item-${nextKey++}`;

const toItem = (row) => ({
  key: newKey(),
  exercise: row.exercise,
  target_sets: row.target_sets,
  reps_min: String(row.reps_min),
  reps_max: row.reps_max ? String(row.reps_max) : '',
  rest_seconds: row.rest_seconds ?? null,
  unilateral: row.unilateral ?? null,
});

const toPayload = (name, description, items) => ({
  name: name.trim(),
  description: description.trim() || null,
  exercises: items.map(item => ({
    exercise_id: item.exercise.id,
    target_sets: item.target_sets,
    reps_min: Number(item.reps_min),
    reps_max: item.reps_max ? Number(item.reps_max) : null,
    rest_seconds: item.rest_seconds,
    unilateral: item.unilateral,
  })),
});

const REST_CHOICES = [{ value: null, label: 'Nenhum' }, ...REST_OPTIONS.map(seconds => ({ value: seconds, label: formatRest(seconds) }))];

const digits = (value) => value.replace(/\D/g, '').slice(0, 3);

function Stepper({ value, onChange, min, max, label }) {
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Menos ${label.toLowerCase()}`}>
        <Minus size={16} strokeWidth={2.6} />
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Mais ${label.toLowerCase()}`}>
        <Plus size={16} strokeWidth={2.6} />
      </button>
    </div>
  );
}

const TRACKING_DEFAULTS = {
  reps: { target_sets: 3, reps_min: '10' },
  time: { target_sets: 3, reps_min: '30' },
  cardio: { target_sets: 1, reps_min: '20' },
};

export default function WorkoutEditor({ initial, onSubmit, onDelete }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [items, setItems] = useState(() => (initial?.exercises ?? []).map(toItem));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exercises, setExercises] = useState(() => peekCache('fitnessExercises') ?? null);
  const [loadError, setLoadError] = useState(false);
  const [invalid, setInvalid] = useState(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);
  const toast = useToast();
  const [savedPayload] = useState(() => JSON.stringify(toPayload(initial?.name ?? '', initial?.description ?? '', (initial?.exercises ?? []).map(toItem))));
  const submitted = useRef(false);

  const fetchExercises = useCallback(() => {
    setLoadError(false);
    return getExercises().then(setExercises).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getExercises().then(setExercises).catch(() => setLoadError(true));
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(toPayload(name, description, items)) !== savedPayload,
    [name, description, items, savedPayload],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      if (submitted.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const addExercises = (selected) => {
    setItems(list => [
      ...list,
      ...selected.map(exercise => ({ key: newKey(), exercise, ...TRACKING_DEFAULTS[exercise.tracking ?? 'reps'], reps_max: '', rest_seconds: null, unilateral: null })),
    ]);
    setPickerOpen(false);
  };

  const updateItem = (key, changes) => {
    setItems(list => list.map(item => (item.key === key ? { ...item, ...changes } : item)));
    if (invalid?.field === key) setInvalid(null);
  };

  const removeItem = (key) => setItems(list => list.filter(item => item.key !== key));

  const reorder = (keys) => {
    setItems(list => keys.map(key => list.find(item => item.key === key)));
  };

  const validate = () => {
    if (!name.trim()) return { field: 'name', message: 'Dê um nome para a ficha.' };
    for (const item of items) {
      const min = Number(item.reps_min);
      const problem = !min
        ? `Informe ${item.exercise.tracking === 'cardio' ? 'a duração' : item.exercise.tracking === 'time' ? 'o tempo' : 'as repetições'} de ${item.exercise.name}.`
        : min > 600
          ? `Em ${item.exercise.name}, use no máximo 600.`
          : item.reps_max && Number(item.reps_max) < min
            ? `Em ${item.exercise.name}, o máximo de repetições é menor que o mínimo.`
            : '';
      if (problem) return { field: item.key, message: problem };
    }
    return null;
  };

  const showProblem = (problem) => {
    setInvalid(problem);
    toast({ tone: 'danger', message: problem.message });
    if (problem.field === 'name') {
      nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameRef.current?.focus({ preventScroll: true });
    } else if (problem.field) {
      document.querySelector(`[data-item="${problem.field}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) return showProblem(problem);
    setInvalid(null);
    setSaving(true);
    submitted.current = true;
    const message = await onSubmit(toPayload(name, description, items));
    if (message) {
      submitted.current = false;
      setSaving(false);
      showProblem({ field: null, message });
    }
  };

  const totalSets = items.reduce((sum, item) => sum + item.target_sets, 0);

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.label}>Nome da ficha</span>
          <input
            ref={nameRef}
            className={`${styles.nameInput} ${invalid?.field === 'name' ? styles.inputInvalid : ''}`}
            value={name}
            onChange={e => {
              setName(e.target.value);
              if (invalid?.field === 'name') setInvalid(null);
            }}
            aria-invalid={invalid?.field === 'name'}
            maxLength={60}
            placeholder="Ex.: Treino A — Peito e tríceps"
            autoComplete="off"
            enterKeyHint="next"
          />
          {invalid?.field === 'name' && <span className={styles.fieldError}>{invalid.message}</span>}
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Descrição <em>opcional</em></span>
          <textarea
            className={styles.textarea}
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Foco, observações, dia da semana…"
          />
        </label>
      </div>

      <section className={styles.exercises}>
        <div className={styles.exercisesHeader}>
          <h2 className={styles.sectionTitle}>Exercícios</h2>
          {items.length > 0 && (
            <span className={styles.summary}>
              {plural(items.length, 'exercício', 'exercícios')} · {plural(totalSets, 'série', 'séries')}
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <button type="button" className={styles.empty} onClick={() => setPickerOpen(true)}>
            <Dumbbell size={28} aria-hidden="true" />
            <span className={styles.emptyTitle}>Nenhum exercício ainda</span>
            <span className={styles.emptyText}>Toque para escolher da biblioteca</span>
          </button>
        ) : (
          <SortableList ids={items.map(item => item.key)} onReorder={reorder}>
            <ol className={styles.list}>
              {items.map((item, index) => (
                <SortableItem key={item.key} id={item.key}>
                  {({ itemProps, handleProps, isDragging }) => (
                    <li {...itemProps} data-item={item.key} className={`${styles.item} ${isDragging ? styles.itemDragging : ''} ${invalid?.field === item.key ? styles.itemInvalid : ''}`}>
                      <div className={styles.itemTop}>
                        <DragHandle handleProps={handleProps} className={styles.handle} />
                        <span className={styles.index}>{index + 1}</span>
                        <span className={styles.itemText}>
                          <span className={styles.itemName}>{item.exercise.name}</span>
                          <span className={styles.itemMeta}>
                            {groupsLabel(item.exercise)}
                            {familySiblings(item.exercise, exercises).length > 1 ? '' : ` · ${equipmentLabel(item.exercise.equipment)}`}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={styles.remove}
                          onClick={() => removeItem(item.key)}
                          aria-label={`Remover ${item.exercise.name}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      {familySiblings(item.exercise, exercises).length > 1 && (
                        <div className={styles.equipmentBlock}>
                          <span className={styles.targetLabel}>Equipamento</span>
                          <div className={styles.equipmentChips} role="radiogroup" aria-label={`Equipamento de ${item.exercise.name}`}>
                            {familySiblings(item.exercise, exercises).map(variant => (
                              <button
                                key={variant.id}
                                type="button"
                                role="radio"
                                aria-checked={variant.id === item.exercise.id}
                                className={`${styles.equipmentChip} ${variant.id === item.exercise.id ? styles.equipmentChipOn : ''}`}
                                onClick={() => updateItem(item.key, { exercise: variant, unilateral: null })}
                              >
                                {equipmentLabel(variant.equipment)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className={styles.targets}>
                        {item.exercise.tracking !== 'cardio' && <div className={styles.target}>
                          <span className={styles.targetLabel}>Séries</span>
                          <Stepper
                            label="Séries"
                            value={item.target_sets}
                            min={1}
                            max={20}
                            onChange={value => updateItem(item.key, { target_sets: value })}
                          />
                        </div>}
                        {item.exercise.tracking && item.exercise.tracking !== 'reps' ? (
                          <div className={styles.target}>
                            <span className={styles.targetLabel}>{item.exercise.tracking === 'cardio' ? 'Duração (min)' : 'Tempo (seg)'}</span>
                            <div className={styles.reps}>
                              <input
                                className={styles.repsInput}
                                value={item.reps_min}
                                onChange={e => updateItem(item.key, { reps_min: digits(e.target.value), reps_max: '' })}
                                inputMode="numeric"
                                aria-label={`${item.exercise.tracking === 'cardio' ? 'Minutos' : 'Segundos'} de ${item.exercise.name}`}
                                placeholder={TRACKING_DEFAULTS[item.exercise.tracking].reps_min}
                              />
                            </div>
                          </div>
                        ) : (
                        <div className={styles.target}>
                          <span className={styles.targetLabel}>Repetições</span>
                          <div className={styles.reps}>
                            <input
                              className={styles.repsInput}
                              value={item.reps_min}
                              onChange={e => updateItem(item.key, { reps_min: digits(e.target.value) })}
                              inputMode="numeric"
                              aria-label={`Repetições mínimas de ${item.exercise.name}`}
                              placeholder="10"
                            />
                            <span className={styles.repsSep}>até</span>
                            <input
                              className={styles.repsInput}
                              value={item.reps_max}
                              onChange={e => updateItem(item.key, { reps_max: digits(e.target.value) })}
                              inputMode="numeric"
                              aria-label={`Repetições máximas de ${item.exercise.name} (opcional)`}
                              placeholder="—"
                            />
                          </div>
                        </div>
                        )}
                        <div className={styles.target}>
                          <span className={styles.targetLabel}>Descanso</span>
                          <GymSelect
                            value={item.rest_seconds ?? null}
                            options={REST_CHOICES}
                            onChange={seconds => updateItem(item.key, { rest_seconds: seconds })}
                            title={`Descanso · ${item.exercise.name}`}
                            label={`Descanso de ${item.exercise.name}`}
                            hint="Tempo do cronômetro entre as séries deste exercício."
                            grid
                          />
                        </div>
                        <button
                          type="button"
                          className={`${styles.sideToggle} ${(item.unilateral ?? item.exercise.is_unilateral) ? styles.sideToggleOn : ''}`}
                          aria-pressed={!!(item.unilateral ?? item.exercise.is_unilateral)}
                          onClick={() => updateItem(item.key, { unilateral: !(item.unilateral ?? item.exercise.is_unilateral) })}
                        >
                          {(item.unilateral ?? item.exercise.is_unilateral) ? 'Unilateral' : 'Bilateral'}
                        </button>
                      </div>
                      {invalid?.field === item.key && <span className={styles.fieldError}>{invalid.message}</span>}
                    </li>
                  )}
                </SortableItem>
              ))}
            </ol>
          </SortableList>
        )}

        {items.length > 0 && (
          <button type="button" className={styles.add} onClick={() => setPickerOpen(true)}>
            <Plus size={18} strokeWidth={2.4} /> Adicionar exercícios
          </button>
        )}
      </section>

      <WorkoutBodyMap exercises={items} />


      <div className={styles.actions}>
        {onDelete && (
          <button type="button" className={styles.delete} onClick={onDelete} aria-label="Excluir ficha">
            <Trash2 size={20} />
          </button>
        )}
        <button type="submit" className={styles.submit} disabled={saving || (!!initial && !dirty)}>
          {saving ? 'Salvando…' : initial ? (dirty ? 'Salvar alterações' : 'Tudo salvo') : 'Criar ficha'}
        </button>
      </div>

      <GymSheet open={pickerOpen} onClose={closePicker} title="Adicionar exercícios">
        {pickerOpen && (
          <ExercisePicker exercises={exercises} loadError={loadError} onRetry={fetchExercises} onConfirm={addExercises} />
        )}
      </GymSheet>
    </form>
  );
}
