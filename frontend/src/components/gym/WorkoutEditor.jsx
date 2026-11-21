'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Plus, Minus, Trash2, Dumbbell, HeartPulse, History } from 'lucide-react';
import { getExercises, peekCache } from '../../lib/api';
import { equipmentLabel, plural, REST_OPTIONS, formatRest, groupsLabel, familySiblings, canLoadPerSide } from '../../lib/gym';
import VariantChoices from './VariantChoices';
import { clearDraft, draftKey, readDraft, writeDraft } from '../../lib/workoutDraft';
import { SortableList, SortableItem, DragHandle } from '../Sortable';
import { useToast } from '../Toast';
import GymSheet from './GymSheet';
import GymSelect from './GymSelect';
import GymSwitch from './GymSwitch';
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
  load_mode: row.load_mode ?? null,
});

const toCardio = (row) => ({
  key: newKey(),
  phase: row.phase,
  exercise: row.exercise ?? null,
  minutes: String(row.minutes),
});

const CARDIO_PHASES = [
  { value: 'start', title: 'Cardio no início', hint: 'Antes dos exercícios, como aquecimento' },
  { value: 'end', title: 'Cardio no final', hint: 'Depois dos exercícios' },
];

const sideAllowed = (item) => canLoadPerSide(item.exercise.equipment, item.unilateral ?? item.exercise.is_unilateral, item.exercise.tracking);

const toPayload = (name, description, items, cardio) => ({
  name: name.trim(),
  description: description.trim() || null,
  exercises: items.map(item => ({
    exercise_id: item.exercise.id,
    target_sets: item.target_sets,
    reps_min: Number(item.reps_min),
    reps_max: item.reps_max ? Number(item.reps_max) : null,
    rest_seconds: item.rest_seconds,
    unilateral: item.unilateral,
    load_mode: sideAllowed(item) && item.load_mode === 'side' ? 'side' : null,
  })),
  cardio: CARDIO_PHASES.flatMap(phase => cardio.filter(item => item.phase === phase.value)).map(item => ({
    exercise_id: item.exercise?.id ?? null,
    phase: item.phase,
    minutes: Number(item.minutes),
  })),
});

const toDraft = (name, description, items, cardio, base) => ({
  name,
  description,
  items: items.map(({ key, ...rest }) => rest),
  cardio: cardio.map(({ key, ...rest }) => rest),
  base,
  saved_at: new Date().toISOString(),
});

const withKeys = (rows) => (rows ?? []).map(row => ({ ...row, key: newKey() }));

const REST_CHOICES = [{ value: null, label: 'Nenhum' }, ...REST_OPTIONS.map(seconds => ({ value: seconds, label: formatRest(seconds) }))];

const SIDE_OPTIONS = [{ value: false, label: 'Bilateral' }, { value: true, label: 'Unilateral' }];
const LOAD_OPTIONS = [{ value: 'total', label: 'Peso total' }, { value: 'side', label: 'Cada lado' }];

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

const subscribeNothing = () => () => {};

export default function WorkoutEditor(props) {
  const client = useSyncExternalStore(subscribeNothing, () => true, () => false);
  return client ? <Editor {...props} /> : null;
}

function Editor({ initial, onSubmit, onDelete }) {
  const storageKey = draftKey(initial?.id);
  const base = initial?.updated_at ?? null;
  const [draft] = useState(() => readDraft(storageKey));
  const stale = !!draft && !!initial && draft.base !== base;
  const restoring = !!draft && !stale;
  const [banner, setBanner] = useState(draft ? (stale ? 'stale' : 'restored') : null);
  const [name, setName] = useState(restoring ? draft.name ?? '' : initial?.name ?? '');
  const [description, setDescription] = useState(restoring ? draft.description ?? '' : initial?.description ?? '');
  const [items, setItems] = useState(() => (restoring ? withKeys(draft.items) : (initial?.exercises ?? []).map(toItem)));
  const [cardio, setCardio] = useState(() => (restoring ? withKeys(draft.cardio) : (initial?.cardio ?? []).map(toCardio)));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exercises, setExercises] = useState(() => peekCache('fitnessExercises') ?? null);
  const [loadError, setLoadError] = useState(false);
  const [invalid, setInvalid] = useState(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);
  const toast = useToast();
  const [savedPayload] = useState(() => JSON.stringify(toPayload(initial?.name ?? '', initial?.description ?? '', (initial?.exercises ?? []).map(toItem), (initial?.cardio ?? []).map(toCardio))));
  const submitted = useRef(false);

  const fetchExercises = useCallback(() => {
    setLoadError(false);
    return getExercises().then(setExercises).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getExercises().then(setExercises).catch(() => setLoadError(true));
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(toPayload(name, description, items, cardio)) !== savedPayload,
    [name, description, items, cardio, savedPayload],
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

  useEffect(() => {
    if (submitted.current || banner === 'stale') return;
    if (dirty) writeDraft(storageKey, toDraft(name, description, items, cardio, base));
    else clearDraft(storageKey);
  }, [dirty, name, description, items, cardio, banner, storageKey, base]);

  const applySource = (source) => {
    setName(source.name);
    setDescription(source.description);
    setItems(source.items);
    setCardio(source.cardio);
    setInvalid(null);
  };

  const discardDraft = () => {
    clearDraft(storageKey);
    applySource({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      items: (initial?.exercises ?? []).map(toItem),
      cardio: (initial?.cardio ?? []).map(toCardio),
    });
    setBanner(null);
  };

  const restoreDraft = () => {
    applySource({ name: draft.name ?? '', description: draft.description ?? '', items: withKeys(draft.items), cardio: withKeys(draft.cardio) });
    setBanner('restored');
  };

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const addExercises = (selected) => {
    setItems(list => [
      ...list,
      ...selected.map(exercise => ({ key: newKey(), exercise, ...TRACKING_DEFAULTS[exercise.tracking ?? 'reps'], reps_max: '', rest_seconds: null, unilateral: null, load_mode: null })),
    ]);
    setPickerOpen(false);
  };

  const updateItem = (key, changes) => {
    setItems(list => list.map(item => (item.key === key ? { ...item, ...changes } : item)));
    if (invalid?.field === key) setInvalid(null);
  };

  const removeItem = (key) => setItems(list => list.filter(item => item.key !== key));

  const cardioOptions = useMemo(() => (exercises ?? []).filter(exercise => exercise.tracking === 'cardio'), [exercises]);
  const strengthExercises = useMemo(() => exercises?.filter(exercise => exercise.tracking !== 'cardio') ?? null, [exercises]);

  const addCardio = (phase) => setCardio(list => [...list, { key: newKey(), phase, exercise: null, minutes: '20' }]);

  const updateCardio = (key, changes) => {
    setCardio(list => list.map(item => (item.key === key ? { ...item, ...changes } : item)));
    if (invalid?.field === key) setInvalid(null);
  };

  const removeCardio = (key) => setCardio(list => list.filter(item => item.key !== key));

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
    for (const item of cardio) {
      const minutes = Number(item.minutes);
      const label = item.exercise?.name ?? 'cardio';
      if (!minutes) return { field: item.key, message: `Informe a duração do ${label}.` };
      if (minutes > 300) return { field: item.key, message: `No ${label}, use no máximo 300 minutos.` };
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
    const message = await onSubmit(toPayload(name, description, items, cardio));
    if (!message) clearDraft(storageKey);
    if (message) {
      submitted.current = false;
      setSaving(false);
      showProblem({ field: null, message });
    }
  };

  const totalSets = items.reduce((sum, item) => sum + item.target_sets, 0);

  const cardioBlock = (phase) => {
    const rows = cardio.filter(item => item.phase === phase.value);
    if (!rows.length) {
      return (
        <button type="button" className={styles.cardioAdd} onClick={() => addCardio(phase.value)}>
          <HeartPulse size={18} aria-hidden="true" /> {phase.title}
        </button>
      );
    }
    return (
      <section className={styles.cardio} aria-label={phase.title}>
        <div className={styles.exercisesHeader}>
          <h2 className={styles.sectionTitle}>{phase.title}</h2>
          <span className={styles.summary}>{phase.hint}</span>
        </div>
        <ol className={styles.list}>
          {rows.map(item => (
            <li key={item.key} data-item={item.key} className={`${styles.item} ${invalid?.field === item.key ? styles.itemInvalid : ''}`}>
              <div className={styles.itemTop}>
                <HeartPulse size={18} className={styles.cardioIcon} aria-hidden="true" />
                <span className={styles.itemText}>
                  <span className={styles.itemName}>{item.exercise?.name ?? 'Qualquer cardio'}</span>
                  <span className={styles.itemMeta}>{item.exercise ? 'Cardio' : 'Você escolhe o aparelho na hora'}</span>
                </span>
                <button type="button" className={styles.remove} onClick={() => removeCardio(item.key)} aria-label={`Remover ${item.exercise?.name ?? 'cardio'}`}>
                  <Trash2 size={18} />
                </button>
              </div>
              <div className={styles.equipmentBlock}>
                <span className={styles.targetLabel}>Aparelho</span>
                <div className={styles.equipmentChips} role="radiogroup" aria-label={`Aparelho do ${phase.title.toLowerCase()}`}>
                  {[null, ...cardioOptions].map(option => (
                    <button
                      key={option?.id ?? 'any'}
                      type="button"
                      role="radio"
                      aria-checked={(item.exercise?.id ?? null) === (option?.id ?? null)}
                      className={`${styles.equipmentChip} ${(item.exercise?.id ?? null) === (option?.id ?? null) ? styles.equipmentChipOn : ''}`}
                      onClick={() => updateCardio(item.key, { exercise: option })}
                    >
                      {option?.name ?? 'Qualquer'}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.targets}>
                <div className={styles.target}>
                  <span className={styles.targetLabel}>Duração (min)</span>
                  <div className={styles.reps}>
                    <input
                      className={styles.repsInput}
                      value={item.minutes}
                      onChange={e => updateCardio(item.key, { minutes: digits(e.target.value) })}
                      inputMode="numeric"
                      aria-label={`Minutos do ${phase.title.toLowerCase()}`}
                      placeholder="20"
                    />
                  </div>
                </div>
              </div>
              {invalid?.field === item.key && <span className={styles.fieldError}>{invalid.message}</span>}
            </li>
          ))}
        </ol>
        <button type="button" className={styles.add} onClick={() => addCardio(phase.value)}>
          <Plus size={18} strokeWidth={2.4} /> Adicionar outro cardio
        </button>
      </section>
    );
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {banner === 'restored' && (
        <div className={styles.draft} role="status">
          <History size={18} aria-hidden="true" />
          <span className={styles.draftText}>
            Continuando de onde você parou
            <small>Rascunho salvo automaticamente</small>
          </span>
          <button type="button" className={styles.draftAction} onClick={discardDraft}>Descartar rascunho</button>
        </div>
      )}
      {banner === 'stale' && (
        <div className={styles.draft} role="status">
          <History size={18} aria-hidden="true" />
          <span className={styles.draftText}>
            Você tem um rascunho desta ficha
            <small>A ficha foi alterada depois que o rascunho foi salvo.</small>
          </span>
          <span className={styles.draftActions}>
            <button type="button" className={styles.draftAction} onClick={discardDraft}>Descartar</button>
            <button type="button" className={`${styles.draftAction} ${styles.draftPrimary}`} onClick={restoreDraft}>Restaurar</button>
          </span>
        </div>
      )}
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

      {cardioBlock(CARDIO_PHASES[0])}

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
                          <VariantChoices
                            variants={familySiblings(item.exercise, exercises)}
                            current={familySiblings(item.exercise, exercises).find(variant => variant.id === item.exercise.id)}
                            onSelect={variant => updateItem(item.key, { exercise: variant, unilateral: null })}
                            chipClassName={styles.equipmentChip}
                            activeClassName={styles.equipmentChipOn}
                          />
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
                        <div className={styles.target}>
                          <span className={styles.targetLabel}>Execução</span>
                          <GymSwitch
                            label={`Execução de ${item.exercise.name}`}
                            value={!!(item.unilateral ?? item.exercise.is_unilateral)}
                            options={SIDE_OPTIONS}
                            onChange={unilateral => updateItem(item.key, { unilateral })}
                          />
                        </div>
                        {sideAllowed(item) && (
                          <div className={styles.target}>
                            <span className={styles.targetLabel}>Carga</span>
                            <GymSwitch
                              label={`Como anotar a carga de ${item.exercise.name}`}
                              value={item.load_mode === 'side' ? 'side' : 'total'}
                              options={LOAD_OPTIONS}
                              onChange={mode => updateItem(item.key, { load_mode: mode === 'side' ? 'side' : null })}
                            />
                          </div>
                        )}
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

      {cardioBlock(CARDIO_PHASES[1])}

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
          <ExercisePicker exercises={strengthExercises} loadError={loadError} onRetry={fetchExercises} onConfirm={addExercises} />
        )}
      </GymSheet>
    </form>
  );
}
