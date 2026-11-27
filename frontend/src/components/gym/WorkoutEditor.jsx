'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Plus, Minus, Trash2, Dumbbell, HeartPulse, History, Link2, Link2Off, Copy, Check } from 'lucide-react';
import { getExercises, peekCache } from '../../lib/api';
import { canLoadPerSide, equipmentLabel, familySiblings, formatRest, groupsLabel, planSlots, planSummary, plural, repsLabel, REST_OPTIONS, SIDE_OPTIONS, SUPERSET_LETTERS, TECHNIQUE_ORDER, TECHNIQUES } from '../../lib/gym';
import VariantChoices from './VariantChoices';
import { clearDraft, draftKey, readDraft, writeDraft } from '../../lib/workoutDraft';
import { SortableList, SortableItem, DragHandle } from '../Sortable';
import { useToast } from '../Toast';
import GymSheet from './GymSheet';
import GymSelect from './GymSelect';
import GymSwitch from './GymSwitch';
import { ExercisePicker, preloadSheets } from './lazy';
import WorkoutBodyMap from './WorkoutBodyMap';
import styles from './WorkoutEditor.module.css';

let nextKey = 0;
const newKey = () => `item-${nextKey++}`;

const normalPlan = (count) => Array.from({ length: count }, () => 'normal');

const isStrength = (exercise) => (exercise.tracking ?? 'reps') === 'reps';

const toItem = (row, index, rows) => ({
  key: newKey(),
  plan: row.set_plan ?? normalPlan(row.target_sets),
  linked: row.superset != null && rows?.[index + 1]?.superset === row.superset,
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

const supersetsOf = (items) => {
  let group = 0;
  return items.map((item, index) => {
    const joined = item.linked && index < items.length - 1;
    const fromPrevious = index > 0 && items[index - 1].linked;
    if (!joined && !fromPrevious) return null;
    if (!fromPrevious) group += 1;
    return group;
  });
};

const supersetLayout = (items) => {
  const groups = supersetsOf(items);
  let unit = 0;
  return items.map((item, index) => {
    const group = groups[index];
    const starts = group === null || groups[index - 1] !== group;
    if (starts) unit += 1;
    const size = group === null ? 1 : groups.filter(value => value === group).length;
    const position = group === null ? 0 : groups.slice(0, index).filter(value => value === group).length;
    return {
      group,
      first: group !== null && position === 0,
      last: group !== null && position === size - 1,
      size,
      label: group === null ? String(unit) : `${unit}${SUPERSET_LETTERS[position]}`,
    };
  });
};

const toPayload = (name, description, items, cardio) => {
  const supersets = supersetsOf(items);
  return {
  name: name.trim(),
  description: description.trim() || null,
  exercises: items.map((item, index) => ({
    exercise_id: item.exercise.id,
    target_sets: item.target_sets,
    reps_min: Number(item.reps_min),
    reps_max: item.reps_max ? Number(item.reps_max) : null,
    rest_seconds: item.rest_seconds,
    unilateral: item.unilateral,
    load_mode: sideAllowed(item) && item.load_mode === 'side' ? 'side' : null,
    superset: supersets[index],
    set_plan: isStrength(item.exercise) ? item.plan : null,
  })),
  cardio: CARDIO_PHASES.flatMap(phase => cardio.filter(item => item.phase === phase.value)).map(item => ({
    exercise_id: item.exercise?.id ?? null,
    phase: item.phase,
    minutes: Number(item.minutes),
  })),
  };
};

const toDraft = (name, description, items, cardio, base) => ({
  name,
  description,
  items: items.map(({ key, ...rest }) => rest),
  cardio: cardio.map(({ key, ...rest }) => rest),
  base,
  saved_at: new Date().toISOString(),
});

const withKeys = (rows) => (rows ?? []).map(row => ({ ...row, key: newKey() }));

const withPlans = (rows) => withKeys(rows).map(row => ({ ...row, plan: row.plan?.length ? row.plan : normalPlan(row.target_sets) }));

const SLOT_COLORS = { warmup: 'slotWarmup', drop: 'slotDrop', rest_pause: 'slotRestPause', failure: 'slotFailure' };

const REST_CHOICES = [{ value: null, label: 'Nenhum' }, ...REST_OPTIONS.map(seconds => ({ value: seconds, label: formatRest(seconds) }))];

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
  const [items, setItems] = useState(() => (restoring ? withPlans(draft.items) : (initial?.exercises ?? []).map(toItem)));
  const [slotSheet, setSlotSheet] = useState(null);
  const [copySheet, setCopySheet] = useState(null);
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

  useEffect(() => preloadSheets(), []);

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
    applySource({ name: draft.name ?? '', description: draft.description ?? '', items: withPlans(draft.items), cardio: withKeys(draft.cardio) });
    setBanner('restored');
  };

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const addExercises = (selected) => {
    setItems(list => [
      ...list,
      ...selected.map(exercise => ({ key: newKey(), linked: false, exercise, ...TRACKING_DEFAULTS[exercise.tracking ?? 'reps'], plan: normalPlan(TRACKING_DEFAULTS[exercise.tracking ?? 'reps'].target_sets), reps_max: '', rest_seconds: null, unilateral: null, load_mode: null })),
    ]);
    setPickerOpen(false);
  };

  const updateItem = (key, changes) => {
    setItems(list => list.map(item => (item.key === key ? { ...item, ...changes } : item)));
    if (invalid?.field === key) setInvalid(null);
  };

  const setPlan = (key, plan) => updateItem(key, { plan, target_sets: plan.filter(kind => kind !== 'warmup').length });

  const resizePlan = (item, count) => {
    const plan = count > item.plan.length
      ? [...item.plan, ...normalPlan(count - item.plan.length)]
      : item.plan.slice(0, count);
    if (!plan.some(kind => kind !== 'warmup')) return;
    setPlan(item.key, plan);
  };

  const chooseTechnique = (kind) => {
    const item = items.find(entry => entry.key === slotSheet.key);
    setSlotSheet(null);
    if (!item) return;
    setPlan(item.key, item.plan.map((current, index) => (index === slotSheet.index ? kind : current)));
  };

  const closeSlotSheet = useCallback(() => setSlotSheet(null), []);
  const closeCopySheet = useCallback(() => setCopySheet(null), []);

  const openCopy = (item) => {
    const targets = items.filter(entry => entry.key !== item.key && isStrength(entry.exercise)).map(entry => entry.key);
    setCopySheet({ key: item.key, selected: targets });
  };

  const toggleCopyTarget = (key) => setCopySheet(current => ({
    ...current,
    selected: current.selected.includes(key) ? current.selected.filter(k => k !== key) : [...current.selected, key],
  }));

  const applyCopy = () => {
    const source = items.find(entry => entry.key === copySheet.key);
    const chosen = new Set(copySheet.selected);
    setCopySheet(null);
    if (!source || !chosen.size) return;
    setItems(list => list.map(entry => (chosen.has(entry.key)
      ? { ...entry, plan: [...source.plan], target_sets: source.target_sets, reps_min: source.reps_min, reps_max: source.reps_max }
      : entry)));
    toast(`Copiado para ${plural(chosen.size, 'exercício', 'exercícios')}`);
  };

  const removeItem = (key) => setItems(list => {
    const index = list.findIndex(item => item.key === key);
    return list
      .map((item, i) => (i === index - 1 ? { ...item, linked: item.linked && list[index].linked } : item))
      .filter(item => item.key !== key);
  });

  const cardioOptions = useMemo(() => (exercises ?? []).filter(exercise => exercise.tracking === 'cardio'), [exercises]);
  const strengthExercises = useMemo(() => exercises?.filter(exercise => exercise.tracking !== 'cardio') ?? null, [exercises]);

  const addCardio = (phase) => setCardio(list => [...list, { key: newKey(), phase, exercise: null, minutes: '20' }]);

  const updateCardio = (key, changes) => {
    setCardio(list => list.map(item => (item.key === key ? { ...item, ...changes } : item)));
    if (invalid?.field === key) setInvalid(null);
  };

  const removeCardio = (key) => setCardio(list => list.filter(item => item.key !== key));

  const reorder = (keys) => {
    setItems(list => {
      const pairs = new Set(list.flatMap((item, index) => (item.linked && list[index + 1] ? [`${item.key}>${list[index + 1].key}`] : [])));
      const ordered = keys.map(key => list.find(item => item.key === key));
      return ordered.map((item, index) => ({ ...item, linked: !!ordered[index + 1] && pairs.has(`${item.key}>${ordered[index + 1].key}`) }));
    });
  };

  const toggleLink = (key) => {
    setItems(list => list.map(item => (item.key === key ? { ...item, linked: !item.linked } : item)));
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
  const layout = supersetLayout(items);

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
                    <li
                      {...itemProps}
                      data-item={item.key}
                      className={[
                        styles.item,
                        layout[index].group !== null ? styles.itemSuperset : '',
                        layout[index].group !== null && !layout[index].first ? styles.itemJoinedTop : '',
                        layout[index].group !== null && !layout[index].last ? styles.itemJoinedBottom : '',
                        isDragging ? styles.itemDragging : '',
                        invalid?.field === item.key ? styles.itemInvalid : '',
                      ].join(' ')}
                    >
                      {layout[index].first && (
                        <span className={styles.supersetKicker}>
                          Superset · {plural(layout[index].size, 'exercício', 'exercícios')}
                          <small>Faça uma série de cada, em sequência, e descanse no fim da rodada</small>
                        </span>
                      )}
                      <div className={styles.itemTop}>
                        <DragHandle handleProps={handleProps} className={styles.handle} />
                        <span className={styles.index}>{layout[index].label}</span>
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
                            value={item.plan.length}
                            min={1}
                            max={isStrength(item.exercise) ? 25 : 20}
                            onChange={value => resizePlan(item, value)}
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
                        {isStrength(item.exercise) && (
                          <div className={styles.slots}>
                            <span className={styles.slotsHeader}>
                              <span className={styles.targetLabel}>Técnica de cada série</span>
                              {items.some(entry => entry.key !== item.key && isStrength(entry.exercise)) && (
                                <button type="button" className={styles.copy} onClick={() => openCopy(item)}>
                                  <Copy size={13} aria-hidden="true" /> Copiar para outros
                                </button>
                              )}
                            </span>
                            <div className={styles.slotRow}>
                              {planSlots(item.plan).map((slot, slotIndex) => (
                                <button
                                  key={slotIndex}
                                  type="button"
                                  className={`${styles.slot} ${slot.kind !== 'normal' ? styles.slotTechnique : ''} ${styles[SLOT_COLORS[slot.kind]] ?? ''}`}
                                  onClick={() => setSlotSheet({ key: item.key, index: slotIndex })}
                                  aria-label={`Série ${slotIndex + 1} de ${item.exercise.name}: ${TECHNIQUES[slot.kind].label}`}
                                >
                                  {slot.label}
                                </button>
                              ))}
                            </div>
                            {item.plan.every(kind => kind === 'normal') && <span className={styles.slotHint}>Toque numa série para escolher a técnica.</span>}
                          </div>
                        )}
                        {(layout[index].group === null || layout[index].last) && (
                          <div className={styles.target}>
                            <span className={styles.targetLabel}>{layout[index].group === null ? 'Descanso' : 'Descanso da rodada'}</span>
                            <GymSelect
                              value={item.rest_seconds ?? null}
                              options={REST_CHOICES}
                              onChange={seconds => updateItem(item.key, { rest_seconds: seconds })}
                              title={layout[index].group === null ? `Descanso · ${item.exercise.name}` : 'Descanso do superset'}
                              label={layout[index].group === null ? `Descanso de ${item.exercise.name}` : 'Descanso depois de cada rodada do superset'}
                              hint={layout[index].group === null ? 'Tempo do cronômetro entre as séries deste exercício.' : 'Tempo do cronômetro depois do último exercício de cada rodada.'}
                              grid
                            />
                          </div>
                        )}
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
                      {index < items.length - 1 && !isDragging && (
                        <button
                          type="button"
                          className={`${styles.link} ${item.linked ? styles.linkOn : ''}`}
                          onClick={() => toggleLink(item.key)}
                          aria-label={item.linked ? `Separar ${item.exercise.name} e ${items[index + 1].exercise.name}` : `Juntar ${item.exercise.name} e ${items[index + 1].exercise.name} em superset`}
                        >
                          {item.linked ? <><Link2Off size={14} aria-hidden="true" /> Separar</> : <><Link2 size={14} aria-hidden="true" /> Superset</>}
                        </button>
                      )}
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

      <GymSheet
        open={!!slotSheet}
        onClose={closeSlotSheet}
        title={slotSheet ? `Série ${slotSheet.index + 1} · ${items.find(entry => entry.key === slotSheet.key)?.exercise.name ?? ''}` : ''}
      >
        {slotSheet && (() => {
          const item = items.find(entry => entry.key === slotSheet.key);
          if (!item) return null;
          const current = item.plan[slotSheet.index];
          const onlyWorking = current !== 'warmup' && item.plan.filter(kind => kind !== 'warmup').length === 1;
          return (
            <div className={styles.techniques}>
              {TECHNIQUE_ORDER.map(kind => (
                <button
                  key={kind}
                  type="button"
                  className={`${styles.technique} ${current === kind ? styles.techniqueOn : ''} ${styles[SLOT_COLORS[kind]] ?? ''}`}
                  onClick={() => chooseTechnique(kind)}
                  disabled={kind === 'warmup' && onlyWorking}
                  aria-pressed={current === kind}
                >
                  <span className={styles.techniqueDot} aria-hidden="true" />
                  <span className={styles.techniqueText}>
                    {TECHNIQUES[kind].label}
                    {kind === 'warmup' && onlyWorking
                      ? <small>Precisa sobrar ao menos uma série de verdade</small>
                      : TECHNIQUES[kind].hint && <small>{TECHNIQUES[kind].hint}</small>}
                  </span>
                </button>
              ))}
            </div>
          );
        })()}
      </GymSheet>

      <GymSheet open={!!copySheet} onClose={closeCopySheet} title="Copiar para outros exercícios">
        {copySheet && (() => {
          const source = items.find(entry => entry.key === copySheet.key);
          if (!source) return null;
          const others = items.filter(entry => entry.key !== source.key && isStrength(entry.exercise));
          const detail = [plural(source.plan.length, 'série', 'séries'), `${repsLabel(source.reps_min, source.reps_max)} reps`, planSummary(source.plan)].filter(Boolean).join(' · ');
          return (
            <div className={styles.copySheet}>
              <p className={styles.copyText}>Leva <strong>{detail}</strong> de {source.exercise.name} para:</p>
              <div className={styles.copyList}>
                {others.map(entry => {
                  const on = copySheet.selected.includes(entry.key);
                  return (
                    <button key={entry.key} type="button" className={`${styles.copyItem} ${on ? styles.copyItemOn : ''}`} onClick={() => toggleCopyTarget(entry.key)} aria-pressed={on}>
                      <span className={styles.copyCheck} aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                      <span className={styles.copyName}>{entry.exercise.name}</span>
                    </button>
                  );
                })}
              </div>
              <button type="button" className={styles.copyConfirm} onClick={applyCopy} disabled={!copySheet.selected.length}>
                {copySheet.selected.length ? `Copiar para ${plural(copySheet.selected.length, 'exercício', 'exercícios')}` : 'Escolha ao menos um exercício'}
              </button>
            </div>
          );
        })()}
      </GymSheet>

      <GymSheet open={pickerOpen} onClose={closePicker} title="Adicionar exercícios">
        {pickerOpen && (
          <ExercisePicker exercises={strengthExercises} loadError={loadError} onRetry={fetchExercises} onConfirm={addExercises} />
        )}
      </GymSheet>
    </form>
  );
}
