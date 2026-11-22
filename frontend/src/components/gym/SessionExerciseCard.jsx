'use client';
import { Fragment, createContext, useContext, useEffect, useRef, useState } from 'react';
import { Check, CloudOff, HeartPulse, Minus, Plus, MoreVertical, Timer, Trash2, MessageSquareText, Pencil } from 'lucide-react';
import {
  sessionTarget, formatKg, formatRest, formatClock, formatShortDate,
  parseKg, kgInput, cleanKgInput, seriesCount, seriesRows, SIDE_LABEL, SIDE_NAME, groupsLabel, setSummary, RIR_OPTIONS, rirLabel, perSide, hasIncline,
  TECHNIQUES, STAGED_KINDS, nextKind, planSlots, allSeriesCount, rowLabels } from '../../lib/gym';
import MarqueeText from './MarqueeText';
import { TimedEditSet, TimedNewSet } from './TimedEntry';
import styles from './SessionExerciseCard.module.css';

const previousHistory = (item) => (item.history?.length
  ? item.history
  : item.previous.length ? [{ scope: item.previous_scope ?? 'any', at: item.previous_at, note: item.previous_note, sets: item.previous }] : []);

const digits = (value) => value.replace(/\D/g, '').slice(0, 4);

const stepKg = (text, delta) => {
  const value = parseKg(text) ?? 0;
  return kgInput(Math.min(1000, Math.max(0, Math.round((value + delta) * 100) / 100)));
};

const stepReps = (text, delta) => String(Math.min(1000, Math.max(1, (Number(text) || 0) + delta)));

const ExtraLoad = createContext(false);
const PerSide = createContext(false);

const shownKg = (weight, side) => (side ? Math.round((weight / 2) * 100) / 100 : weight);
const inputKg = (weight, side) => kgInput(shownKg(weight, side));

const loadText = (weight, extra) => {
  if (extra) return weight > 0 ? `PC + ${formatKg(weight)} kg` : 'PC';
  return weight > 0 ? `${formatKg(weight)} kg` : 'PC';
};

function SetInputs({ weight, reps, onWeight, onReps, autoFocus }) {
  const extra = useContext(ExtraLoad);
  const side = useContext(PerSide);
  const step = side ? 1.25 : 2.5;
  const stepText = side ? '1,25 kg de cada lado' : '2,5 kg';
  return (
    <div className={styles.inputs}>
      <div className={styles.inputGroup}>
        <button type="button" className={styles.step} onClick={() => onWeight(stepKg(weight, -step))} aria-label={`Menos ${stepText}`}>
          <Minus size={16} strokeWidth={2.6} />
        </button>
        <label className={styles.field}>
          <input
            className={styles.input}
            value={weight}
            onChange={e => onWeight(cleanKgInput(e.target.value))}
            inputMode="decimal"
            placeholder="0"
            aria-label={extra ? 'Carga extra em kg, além do peso corporal' : side ? 'Carga de cada lado em kg' : 'Carga em kg'}
            autoFocus={autoFocus}
          />
          <span className={styles.unit}>{extra ? '+kg' : side ? 'kg/lado' : 'kg'}</span>
        </label>
        <button type="button" className={styles.step} onClick={() => onWeight(stepKg(weight, step))} aria-label={`Mais ${stepText}`}>
          <Plus size={16} strokeWidth={2.6} />
        </button>
      </div>
      <div className={styles.inputGroup}>
        <button type="button" className={styles.step} onClick={() => onReps(stepReps(reps, -1))} aria-label="Menos uma repetição">
          <Minus size={16} strokeWidth={2.6} />
        </button>
        <label className={styles.field}>
          <input
            className={styles.input}
            value={reps}
            onChange={e => onReps(digits(e.target.value))}
            inputMode="numeric"
            placeholder="0"
            aria-label="Repetições"
          />
          <span className={styles.unit}>reps</span>
        </label>
        <button type="button" className={styles.step} onClick={() => onReps(stepReps(reps, 1))} aria-label="Mais uma repetição">
          <Plus size={16} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

function validate(weight, reps, side = false) {
  const kg = parseKg(weight === '' ? '0' : weight);
  if (kg === null) return { error: 'Carga inválida. Use até 2 casas decimais, ex.: 62,5.' };
  const count = Number(reps);
  if (!count) return { error: 'Informe as repetições.' };
  return { data: { weight_kg: side ? Math.round(kg * 200) / 100 : kg, reps: count } };
}

function RirPicker({ value, onChange }) {
  return (
    <div className={styles.rir} role="radiogroup" aria-label="Repetições na reserva (opcional)">
      <span className={styles.rirLabel}>RIR <small>opcional</small></span>
      {RIR_OPTIONS.map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={option === 0 ? '0, chegou na falha' : `${rirLabel(option)} repetições na reserva`}
          className={`${styles.rirChip} ${value === option ? styles.rirChipOn : ''}`}
          onClick={() => onChange(value === option ? null : option)}
        >
          {rirLabel(option)}
        </button>
      ))}
    </div>
  );
}

const withRir = (data, rir) => (rir === null ? data : { ...data, rir });

const KIND_CLASS = { warmup: 'kindWarmup', drop: 'kindDrop', rest_pause: 'kindRestPause', failure: 'kindFailure' };

const kindClass = (kind) => styles[KIND_CLASS[kind]] ?? '';

const KIND_NOTE = {
  warmup: 'fora do volume',
  drop: 'anote os drops depois',
  rest_pause: 'anote as pausas depois',
  failure: 'RIR 0',
};

function KindLine({ kind, number }) {
  if (kind === 'normal') return null;
  return (
    <p className={`${styles.kindLine} ${kindClass(kind)}`}>
      <span className={styles.kindDot} aria-hidden="true" />
      <span className={styles.kindText}>
        {kind === 'warmup' ? 'Aquecimento' : `Série ${number} · ${TECHNIQUES[kind].label.toLowerCase()}`}
        <small> · {KIND_NOTE[kind]}</small>
      </span>
    </p>
  );
}

function WarmupSet({ item, onLogSet, onStartRest }) {
  const [saving, setSaving] = useState(false);
  const log = async () => {
    setSaving(true);
    const ok = await onLogSet(item, { weight_kg: 0, reps: 0, kind: 'warmup' });
    if (!ok) setSaving(false);
  };
  return (
    <div className={styles.newSet}>
      <KindLine kind="warmup" />
      <div className={styles.newActions}>
        <button type="button" className={`${styles.log} ${kindClass('warmup')}`} onClick={log} disabled={saving}>
          <Check size={18} strokeWidth={2.8} />
          {saving ? 'Salvando…' : 'Aquecimento feito'}
        </button>
        {onStartRest && (
          <button
            type="button"
            className={styles.rest}
            onClick={() => onStartRest(item)}
            aria-label={item.rest_seconds ? `Iniciar descanso de ${formatRest(item.rest_seconds)}` : 'Iniciar cronômetro de descanso'}
          >
            <Timer size={18} /> {formatClock(item.rest_seconds ?? 0)}
          </button>
        )}
      </div>
    </div>
  );
}

const logLabel = (kind, number) => (kind === 'warmup' ? 'Registrar aquecimento' : `Registrar série ${number}`);

function NewSet({ item, onLogSet, onStartRest, onCancel, onStaged, onHold }) {
  const kind = onCancel ? 'normal' : nextKind(item);
  const next = seriesCount(item.sets) + 1;
  const reference = item.previous[item.sets.length] ?? (kind === 'warmup' ? null : item.sets.filter(entry => entry.kind !== 'warmup').at(-1)) ?? null;
  const side = useContext(PerSide);
  const [weight, setWeight] = useState(reference ? inputKg(reference.weight_kg, side) : '');
  const [reps, setReps] = useState(reference ? String(reference.reps) : item.reps_min ? String(item.reps_min) : '');
  const [rir, setRir] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const { data, error: problem } = validate(weight, reps, side);
    if (problem) return setError(problem);
    setError('');
    setSaving(true);
    const staged = STAGED_KINDS.includes(kind);
    if (staged) onHold?.(true);
    const result = await onLogSet(item, { ...withRir(data, kind === 'normal' || staged ? rir : null), kind });
    if (!result) setSaving(false);
    if (staged && result?.id) onStaged?.(result.id);
    else if (staged) onHold?.(false);
  };

  return (
    <form className={styles.newSet} onSubmit={submit} noValidate>
      <KindLine kind={kind} number={next} />
      <SetInputs weight={weight} reps={reps} onWeight={setWeight} onReps={setReps} />
      {kind !== 'warmup' && kind !== 'failure' && <RirPicker value={rir} onChange={setRir} />}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.newActions}>
        <button type="submit" className={`${styles.log} ${kindClass(kind)}`} disabled={saving}>
          <Check size={18} strokeWidth={2.8} />
          {saving ? 'Salvando…' : logLabel(kind, next)}
        </button>
        {onStartRest && (
        <button
          type="button"
          className={styles.rest}
          onClick={() => onStartRest(item)}
          aria-label={item.rest_seconds ? `Iniciar descanso de ${formatRest(item.rest_seconds)}` : 'Iniciar cronômetro de descanso'}
        >
          <Timer size={18} /> {formatClock(item.rest_seconds ?? 0)}
        </button>
        )}
      </div>
      {onCancel && (
        <button type="button" className={styles.extraCancel} onClick={onCancel} disabled={saving}>
          Cancelar série extra
        </button>
      )}
    </form>
  );
}

const sideCount = (item, side) => item.sets.filter(entry => entry.side === side).length;

function sideReference(item, side, index) {
  const previous = item.previous.filter(entry => entry.side === side);
  const done = item.sets.filter(entry => entry.side === side);
  return previous[index] ?? done.at(-1) ?? previous.at(-1) ?? null;
}

function SideFields({ side, values, onChange }) {
  return (
    <div className={styles.side}>
      <span className={styles.sideLabel} aria-label={SIDE_NAME[side]}>{SIDE_LABEL[side]}</span>
      <SetInputs
        weight={values.weight}
        reps={values.reps}
        onWeight={weight => onChange({ ...values, weight })}
        onReps={reps => onChange({ ...values, reps })}
      />
    </div>
  );
}

function UnilateralNewSet({ item, onLogSet, onStartRest, onCancel }) {
  const kind = onCancel ? 'normal' : nextKind(item);
  const number = seriesCount(item.sets) + (item.sets.length && sideCount(item, 'left') !== sideCount(item, 'right') ? 0 : 1);
  const left = sideCount(item, 'left');
  const right = sideCount(item, 'right');
  const pairs = Math.min(left, right);
  const initial = (side) => {
    const reference = sideReference(item, side, pairs);
    return {
      weight: reference ? kgInput(reference.weight_kg) : '',
      reps: reference ? String(reference.reps) : item.reps_min ? String(item.reps_min) : '',
    };
  };
  const [values, setValues] = useState(() => ({ left: initial('left'), right: initial('right') }));
  const [rir, setRir] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const missing = saving ? ['left', 'right'] : left === right ? ['left', 'right'] : [left < right ? 'left' : 'right'];

  const submit = async (event) => {
    event.preventDefault();
    const entries = [];
    for (const side of missing) {
      const { data, error: problem } = validate(values[side].weight, values[side].reps);
      if (problem) return setError(`${SIDE_NAME[side]}: ${problem}`);
      entries.push({ ...withRir({ ...data, side }, kind === 'warmup' || kind === 'failure' ? null : rir), kind });
    }
    setError('');
    setSaving(true);
    for (const data of entries) {
      const ok = await onLogSet(item, data);
      if (!ok) {
        setSaving(false);
        return;
      }
    }
  };

  return (
    <form className={styles.newSet} onSubmit={submit} noValidate>
      <KindLine kind={kind} number={number} />
      {missing.map(side => (
        <SideFields key={side} side={side} values={values[side]} onChange={next => setValues(current => ({ ...current, [side]: next }))} />
      ))}
      {kind !== 'warmup' && kind !== 'failure' && <RirPicker value={rir} onChange={setRir} />}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.newActions}>
        <button type="submit" className={`${styles.log} ${kindClass(kind)}`} disabled={saving}>
          <Check size={18} strokeWidth={2.8} />
          {saving ? 'Salvando…' : missing.length === 2 ? logLabel(kind, number) : `Completar ${kind === 'warmup' ? 'aquecimento' : `série ${number}`} (${SIDE_NAME[missing[0]].toLowerCase()})`}
        </button>
        {onStartRest && (
        <button
          type="button"
          className={styles.rest}
          onClick={() => onStartRest(item)}
          aria-label={item.rest_seconds ? `Iniciar descanso de ${formatRest(item.rest_seconds)}` : 'Iniciar cronômetro de descanso'}
        >
          <Timer size={18} /> {formatClock(item.rest_seconds ?? 0)}
        </button>
        )}
      </div>
      {onCancel && (
        <button type="button" className={styles.extraCancel} onClick={onCancel} disabled={saving}>
          Cancelar série extra
        </button>
      )}
    </form>
  );
}

const REVEAL = 88;

function SwipeToDelete({ onDelete, children }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const gesture = useRef(null);
  const rowRef = useRef(null);

  const down = (event) => {
    if (removing) return;
    gesture.current = { x: event.clientX, y: event.clientY, base: offset, axis: null, id: event.pointerId };
  };

  const move = (event) => {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'y') {
        gesture.current = null;
        return;
      }
      event.currentTarget.setPointerCapture(g.id);
      setDragging(true);
    }
    const width = rowRef.current.offsetWidth;
    setOffset(Math.min(0, Math.max(g.base + dx, -width)));
  };

  const remove = async () => {
    setRemoving(true);
    setOffset(-rowRef.current.offsetWidth);
    const ok = await onDelete();
    if (!ok) {
      setRemoving(false);
      setOffset(0);
    }
  };

  const up = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.axis) return;
    setDragging(false);
    const width = rowRef.current.offsetWidth;
    if (offset < -width * 0.55) remove();
    else setOffset(offset < -REVEAL / 2 ? -REVEAL : 0);
  };

  const captureClick = (event) => {
    if (dragging || offset !== 0) {
      event.preventDefault();
      event.stopPropagation();
      if (!dragging) setOffset(0);
    }
  };

  return (
    <li ref={rowRef} className={`${styles.swipe} ${removing ? styles.swipeRemoving : ''}`}>
      <button
        type="button"
        className={styles.swipeAction}
        onClick={remove}
        tabIndex={offset ? 0 : -1}
        aria-hidden={!offset}
        style={{ width: Math.max(-offset, REVEAL), visibility: offset ? 'visible' : 'hidden' }}
      >
        <Trash2 size={18} /> <span>Excluir</span>
      </button>
      <div
        className={styles.swipeFront}
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={captureClick}
      >
        {children}
      </div>
    </li>
  );
}

const Tracking = createContext('reps');
const Incline = createContext(false);

function Stages({ entry }) {
  const side = useContext(PerSide);
  if (!entry.stages?.length) return null;
  return (
    <span className={styles.stages}>
      {entry.stages.map((stage, index) => (
        <span key={index} className={styles.stage}>
          ↳ {entry.kind === 'rest_pause' ? 'pausa · ' : ''}{stage.weight_kg > 0 ? `${formatKg(shownKg(stage.weight_kg, side))} ${side ? 'kg/lado' : 'kg'}` : 'PC'} × {stage.reps}
        </span>
      ))}
    </span>
  );
}

function KindTag({ kind }) {
  if (!kind || kind === 'normal') return null;
  return <span className={`${styles.kindTag} ${kindClass(kind)}`}>{TECHNIQUES[kind].tag}</span>;
}

function SetRow({ entry, label, editing, onEdit, onCancel, onSave, onDelete, onAddDrop }) {
  const extra = useContext(ExtraLoad);
  const tracking = useContext(Tracking);
  const incline = useContext(Incline);
  const timed = tracking !== 'reps';
  const side = useContext(PerSide);
  const [weight, setWeight] = useState(inputKg(entry.weight_kg, side));
  const [reps, setReps] = useState(String(entry.reps));
  const [rir, setRir] = useState(entry.rir ?? null);
  const [stages, setStages] = useState(() => (entry.stages ?? []).map(stage => ({ weight: inputKg(stage.weight_kg, side), reps: String(stage.reps) })));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <SwipeToDelete onDelete={() => onDelete(entry)}>
        <button
          type="button"
          className={`${styles.setRow} ${entry.pending ? styles.setPending : ''} ${entry.kind === 'warmup' ? styles.setWarmup : ''} ${entry.stages?.length ? styles.setStaged : ''}`}
          onClick={entry.pending || entry.kind === 'warmup' ? undefined : onEdit}
          aria-label={entry.pending ? `Série ${label} guardada no celular, aguardando conexão` : entry.kind === 'warmup' ? 'Aquecimento feito, deslize para excluir' : `Editar série ${label}`}
        >
          <span className={`${styles.setIndex} ${entry.kind === 'warmup' ? kindClass('warmup') : ''}`}>{label}</span>
          {entry.kind === 'warmup' ? (
            <span className={`${styles.setValue} ${styles.setTimed}`}>Aquecimento feito</span>
          ) : timed ? (
            <span className={`${styles.setValue} ${styles.setTimed}`}>{setSummary(entry, tracking, extra)}</span>
          ) : (<>
          <span className={styles.setValue}>
            {entry.weight_kg > 0
              ? <>{extra && <span className={styles.bodyweightPrefix}>PC +</span>}{formatKg(shownKg(entry.weight_kg, side))} <small>{side ? 'kg/lado' : 'kg'}</small></>
              : <span className={styles.bodyweight}>Peso corporal</span>}
          </span>
          <span className={styles.setTimes}>×</span>
          <span className={styles.setValue}>{entry.reps} <small>reps</small></span>
          {entry.rir != null && entry.kind !== 'failure' && <span className={styles.tag}>RIR {rirLabel(entry.rir)}</span>}
          <KindTag kind={entry.kind} />
          </>)}
          {entry.pending
            ? <CloudOff size={18} className={styles.setWaiting} aria-hidden="true" />
            : <Check size={18} className={styles.setDone} aria-hidden="true" />}
          <Stages entry={entry} />
        </button>
      </SwipeToDelete>
    );
  }

  if (timed) {
    return <TimedEditSet entry={entry} tracking={tracking} extra={extra} onSave={onSave} onDelete={onDelete} onCancel={onCancel} incline={incline} />;
  }

  const pause = entry.kind === 'rest_pause';

  const updateStage = (index, change) => setStages(list => list.map((stage, i) => (i === index ? { ...stage, ...change } : stage)));

  const save = async () => {
    const { data, error: problem } = validate(weight, reps, side);
    if (problem) return setError(problem);
    const cleanStages = [];
    for (const [index, stage] of stages.entries()) {
      const checked = validate(pause ? weight : stage.weight, stage.reps, side);
      if (checked.error) return setError(`${pause ? 'Pausa' : 'Drop'} ${index + 1}: ${checked.error}`);
      cleanStages.push(checked.data);
    }
    setBusy(true);
    const payload = entry.kind === 'warmup' || entry.kind === 'failure' ? data : { ...data, rir };
    const ok = await onSave(entry, STAGED_KINDS.includes(entry.kind) ? { ...payload, stages: cleanStages } : payload);
    if (!ok) setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    const ok = await onDelete(entry);
    if (!ok) setBusy(false);
  };

  return (
    <li className={styles.editRow}>
      <div className={styles.editHeader}>
        <span className={styles.setIndex}>{label}</span>
        <span>{entry.kind === 'warmup' ? 'Editar aquecimento' : 'Editar série'}{entry.side ? ` · ${SIDE_NAME[entry.side]}` : ''}</span>
      </div>
      <SetInputs weight={weight} reps={reps} onWeight={setWeight} onReps={setReps} />
      {entry.kind !== 'warmup' && entry.kind !== 'failure' && <RirPicker value={rir} onChange={setRir} />}
      {stages.length > 0 && (
        <div className={`${styles.editStages} ${kindClass(entry.kind)}`}>
          {stages.map((stage, index) => (
            <div key={index} className={styles.editStage}>
              <span className={styles.editStageLabel}>
                <span className={styles.kindDot} aria-hidden="true" />
                {pause ? `Pausa ${index + 1}` : `Drop ${index + 1}`}
                <button
                  type="button"
                  className={styles.editStageRemove}
                  onClick={() => setStages(list => list.filter((_, i) => i !== index))}
                  aria-label={`Remover ${pause ? 'pausa' : 'drop'} ${index + 1}`}
                >
                  <Trash2 size={15} />
                </button>
              </span>
              {pause ? (
                <div className={styles.inputs}>
                  <div className={styles.inputGroup}>
                    <button type="button" className={styles.step} onClick={() => updateStage(index, { reps: stepReps(stage.reps, -1) })} aria-label="Menos uma repetição">
                      <Minus size={16} strokeWidth={2.6} />
                    </button>
                    <label className={styles.field}>
                      <input className={styles.input} value={stage.reps} onChange={e => updateStage(index, { reps: digits(e.target.value) })} inputMode="numeric" placeholder="0" aria-label={`Repetições da pausa ${index + 1}`} />
                      <span className={styles.unit}>reps</span>
                    </label>
                    <button type="button" className={styles.step} onClick={() => updateStage(index, { reps: stepReps(stage.reps, 1) })} aria-label="Mais uma repetição">
                      <Plus size={16} strokeWidth={2.6} />
                    </button>
                  </div>
                  <span className={styles.stageWeight}>mesmo peso</span>
                </div>
              ) : (
                <SetInputs
                  weight={stage.weight}
                  reps={stage.reps}
                  onWeight={value => updateStage(index, { weight: value })}
                  onReps={value => updateStage(index, { reps: value })}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.editActions}>
        <button type="button" className={styles.editDelete} onClick={remove} disabled={busy} aria-label={`Excluir série ${label}`}>
          <Trash2 size={18} />
        </button>
        {onAddDrop && (
          <button
            type="button"
            className={`${styles.editDrop} ${kindClass(entry.kind === 'rest_pause' ? 'rest_pause' : 'drop')}`}
            onClick={async () => {
              setBusy(true);
              const ok = await onAddDrop(entry);
              if (!ok) setBusy(false);
            }}
            disabled={busy}
          >
            <Plus size={16} strokeWidth={2.6} /> {entry.kind === 'rest_pause' ? 'Pausa' : 'Drop'}
          </button>
        )}
        <button type="button" className={styles.editCancel} onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="button" className={styles.editSave} onClick={save} disabled={busy}>Salvar</button>
      </div>
    </li>
  );
}

const NOTE_LIMIT = 200;

function ExerciseNote({ item, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.note ?? '');
  const [saving, setSaving] = useState(false);

  const open = () => {
    setDraft(item.note ?? '');
    setEditing(true);
  };

  const save = async () => {
    const note = draft.trim();
    if (note === (item.note ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(item, note || null);
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <div className={styles.noteEditor}>
        <textarea
          className={styles.noteInput}
          value={draft}
          onChange={e => setDraft(e.target.value.slice(0, NOTE_LIMIT))}
          maxLength={NOTE_LIMIT}
          rows={2}
          placeholder="Ex.: execução boa, subir a carga na próxima"
          aria-label={`Observação de ${item.exercise_name}`}
          autoFocus
          enterKeyHint="done"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
        />
        <div className={styles.noteActions}>
          <span className={styles.noteCount}>{draft.length}/{NOTE_LIMIT}</span>
          <button type="button" className={styles.noteCancel} onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
          <button type="button" className={styles.noteSave} onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    );
  }

  if (item.note) {
    return (
      <button type="button" className={styles.note} onClick={open} aria-label={`Editar observação: ${item.note}`}>
        <MessageSquareText size={15} className={styles.noteIcon} aria-hidden="true" />
        <span className={styles.noteText}>{item.note}</span>
        <Pencil size={14} className={styles.noteEdit} aria-hidden="true" />
      </button>
    );
  }

  return (
    <button type="button" className={styles.noteAdd} onClick={open}>
      <MessageSquareText size={15} aria-hidden="true" /> Adicionar observação
    </button>
  );
}

const sideValue = (entry, extra) => `${loadText(entry.weight_kg, extra)} × ${entry.reps}`;

function PairRow({ row, label, editingId, onEdit, onCancel, onSave, onDelete }) {
  const extra = useContext(ExtraLoad);
  const editing = [row.left, row.right].find(entry => entry && entry.id === editingId);
  if (editing) {
    return (
      <SetRow key={editing.id} entry={editing} label={label} editing onEdit={() => {}} onCancel={onCancel} onSave={onSave} onDelete={onDelete} />
    );
  }
  const kind = (row.left ?? row.right)?.kind;

  const removeBoth = async () => {
    for (const entry of [row.left, row.right].filter(Boolean)) {
      const ok = await onDelete(entry, true);
      if (!ok) return false;
    }
    return true;
  };

  const pending = [row.left, row.right].some(entry => entry?.pending);

  return (
    <SwipeToDelete onDelete={removeBoth}>
      <div className={`${styles.setRow} ${styles.pairRow} ${pending ? styles.setPending : ''} ${kind === 'warmup' ? styles.setWarmup : ''}`}>
        <span className={`${styles.setIndex} ${kind === 'warmup' ? kindClass('warmup') : ''}`}>{label}</span>
        {['left', 'right'].map(side => {
          const entry = row[side];
          return (
            <button
              key={side}
              type="button"
              className={`${styles.pairSide} ${entry ? '' : styles.pairMissing}`}
              onClick={entry && !entry.pending ? () => onEdit(entry.id) : undefined}
              disabled={!entry || entry.pending}
              aria-label={entry ? `Editar série ${label}, ${SIDE_NAME[side].toLowerCase()}: ${sideValue(entry, extra)}` : `${SIDE_NAME[side]} ainda não registrada`}
            >
              <span className={styles.pairLabel}>{SIDE_LABEL[side]}</span>
              <span className={styles.pairValue}>{entry ? sideValue(entry, extra) : '—'}</span>
            </button>
          );
        })}
        {pending
          ? <CloudOff size={18} className={styles.setWaiting} aria-hidden="true" />
          : <Check size={18} className={styles.setDone} aria-hidden="true" />}
      </div>
    </SwipeToDelete>
  );
}

const PHASE_LABEL = { start: 'Cardio no início', end: 'Cardio no final' };

const PAUSE_OPTIONS = [10, 15, 20];
const PAUSE_KEY = 'gymPauseSeconds';

function readPause() {
  try {
    const value = Number(localStorage.getItem(PAUSE_KEY));
    return PAUSE_OPTIONS.includes(value) ? value : 15;
  } catch {
    return 15;
  }
}

function previousStaged(item, entry, label) {
  const done = (item.previous ?? []).filter(set => set.kind !== 'warmup');
  const same = done[Number(label) - 1];
  if (same?.kind === entry.kind && same.stages?.length) return same;
  return [...done].reverse().find(set => set.kind === entry.kind && set.stages?.length) ?? null;
}

const dropWeight = (weight) => Math.max(0, Math.round((weight * 0.75) / 2.5) * 2.5);

function PauseClock({ startedAt }) {
  const [now, setNow] = useState(() => Date.now());
  const [target, setTarget] = useState(readPause);
  const buzzed = useRef(false);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const ready = seconds >= target;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ready || buzzed.current) return;
    buzzed.current = true;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {}
  }, [ready]);

  const cycle = () => {
    const next = PAUSE_OPTIONS[(PAUSE_OPTIONS.indexOf(target) + 1) % PAUSE_OPTIONS.length];
    setTarget(next);
    buzzed.current = seconds >= next;
    try {
      localStorage.setItem(PAUSE_KEY, String(next));
    } catch {}
  };

  return (
    <button
      type="button"
      className={`${styles.pauseClock} ${ready ? styles.pauseReady : ''}`}
      onClick={cycle}
      aria-label={`Pausa de ${target} segundos, toque para mudar`}
    >
      {formatClock(seconds)} / {formatClock(target)}
    </button>
  );
}

function StageForm({ item, entry, label, onSave, onDone }) {
  const side = useContext(PerSide);
  const drop = entry.kind === 'drop';
  const stages = entry.stages ?? [];
  const last = stages.at(-1) ?? entry;
  const suggestion = previousStaged(item, entry, label)?.stages?.[stages.length] ?? null;
  const [weight, setWeight] = useState(() => inputKg(drop ? suggestion?.weight_kg ?? dropWeight(last.weight_kg) : entry.weight_kg, side));
  const [reps, setReps] = useState(() => String(suggestion?.reps ?? (drop ? last.reps : Math.max(1, Math.round(entry.reps / 3)))));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pausedAt] = useState(() => Date.now());

  const submit = async (e) => {
    e.preventDefault();
    const { data, error: problem } = validate(drop ? weight : inputKg(entry.weight_kg, side), reps, side);
    if (problem) return setError(problem);
    setError('');
    setSaving(true);
    const ok = await onSave(item, entry, { stages: [...stages, { weight_kg: data.weight_kg, reps: data.reps }] });
    if (!ok) setSaving(false);
  };

  const number = stages.length + 1;

  return (
    <form className={`${styles.stageForm} ${kindClass(entry.kind)}`} onSubmit={submit} noValidate>
      <div className={styles.stageHeader}>
        <span className={styles.kindLineText}>
          <span className={styles.kindDot} aria-hidden="true" />
          {drop ? `Drop ${number}` : `Pausa ${number}`}
          <small> · série {label} · {drop ? 'sem descanso' : 'mesmo peso'}</small>
        </span>
        {!drop && <PauseClock key={pausedAt} startedAt={pausedAt} />}
      </div>
      {drop ? (
        <SetInputs weight={weight} reps={reps} onWeight={setWeight} onReps={setReps} />
      ) : (
        <div className={styles.inputs}>
          <div className={styles.inputGroup}>
            <button type="button" className={styles.step} onClick={() => setReps(stepReps(reps, -1))} aria-label="Menos uma repetição">
              <Minus size={16} strokeWidth={2.6} />
            </button>
            <label className={styles.field}>
              <input className={styles.input} value={reps} onChange={e => setReps(digits(e.target.value))} inputMode="numeric" placeholder="0" aria-label="Repetições da pausa" />
              <span className={styles.unit}>reps</span>
            </label>
            <button type="button" className={styles.step} onClick={() => setReps(stepReps(reps, 1))} aria-label="Mais uma repetição">
              <Plus size={16} strokeWidth={2.6} />
            </button>
          </div>
          <span className={styles.stageWeight}>{entry.weight_kg > 0 ? `${formatKg(shownKg(entry.weight_kg, side))} ${side ? 'kg/lado' : 'kg'}` : 'Peso corporal'}</span>
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.newActions}>
        <button type="submit" className={`${styles.log} ${kindClass(entry.kind)}`} disabled={saving}>
          {saving ? 'Salvando…' : drop ? 'Registrar drop' : 'Registrar pausa'}
        </button>
        <button type="button" className={styles.stageDone} onClick={onDone} disabled={saving}>Terminar série</button>
      </div>
      {suggestion
        ? <p className={styles.stageHint}>Sugestão da última vez: {drop ? `${formatKg(shownKg(suggestion.weight_kg, side))} kg × ` : ''}{suggestion.reps} reps.</p>
        : drop && number === 1 && <p className={styles.stageHint}>A carga já vem 25% menor. Faça quantos drops quiser.</p>}
    </form>
  );
}

function PlanProgress({ item }) {
  const done = allSeriesCount(item.sets);
  return (
    <div className={styles.plan} aria-label="Plano de séries da ficha">
      {planSlots(item.set_plan).map((slot, index) => (
        <span
          key={index}
          className={`${styles.planSlot} ${slot.kind !== 'normal' ? `${styles.planTechnique} ${kindClass(slot.kind)}` : ''} ${index < done ? styles.planDone : ''} ${index === done ? styles.planCurrent : ''}`}
        >
          {index < done ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : slot.label}
        </span>
      ))}
    </div>
  );
}

const previousSetText = (set, item, side) => {
  if (set.kind === 'warmup') return 'Aq';
  const base = item.equipment === 'bodyweight' && set.weight_kg > 0 ? `PC+${formatKg(set.weight_kg)}` : set.weight_kg > 0 ? formatKg(shownKg(set.weight_kg, side)) : 'PC';
  const stages = (set.stages ?? []).map(stage => ` + ${stage.weight_kg > 0 ? formatKg(shownKg(stage.weight_kg, side)) : 'PC'}×${stage.reps}`).join('');
  return `${set.kind === 'warmup' ? 'Aq ' : ''}${set.side ? `${SIDE_LABEL[set.side]} ` : ''}${base}×${set.reps}${stages}`;
};

export default function SessionExerciseCard({ item, index, label, turn = false, onStaging, onLogSet, onEditSet, onDeleteSet, onStartRest, onOpenRest, onOpenMenu, onRemove, onSaveNote, cardioOptions, onPickCardio }) {
  const [editingId, setEditingId] = useState(null);
  const [extraAt, setExtraAt] = useState(null);
  const [stagingId, setStagingId] = useState(null);
  const stage = (id) => {
    setStagingId(id);
    onStaging?.(id !== null);
  };
  const target = sessionTarget(item);
  const done = seriesCount(item.sets);
  const complete = item.target_sets && done >= item.target_sets;
  const addingExtra = complete && extraAt === done;
  const rows = seriesRows(item.sets);
  const pairedKey = item.unilateral ? Math.min(sideCount(item, 'left'), sideCount(item, 'right')) : item.sets.length;
  const tracking = item.tracking ?? 'reps';
  const timed = tracking !== 'reps';
  const extra = item.equipment === 'bodyweight';
  const side = perSide(item);
  const cardio = tracking === 'cardio';
  const picking = cardio && !!onPickCardio && item.sets.length === 0 && cardioOptions?.length > 0;
  const needsDevice = cardio && item.exercise_id === null;

  const saveEdit = async (entry, data) => {
    const ok = await onEditSet(item, entry, data);
    if (ok) setEditingId(null);
    return ok;
  };

  const deleteEntry = async (entry, silent = false) => {
    const ok = await onDeleteSet(item, entry, silent);
    if (ok) setEditingId(null);
    return ok;
  };

  const past = previousHistory(item);
  const labels = rowLabels(rows);
  const stagedEntry = stagingId ? item.sets.find(entry => entry.id === stagingId) : null;
  const staging = !!onLogSet && !item.unilateral && stagedEntry && STAGED_KINDS.includes(stagedEntry.kind) ? stagedEntry : null;
  const canDrop = !!onLogSet && !!onEditSet && !timed && !item.unilateral;

  const addDrop = async (entry) => {
    if (!STAGED_KINDS.includes(entry.kind)) {
      const ok = await onEditSet(item, entry, { kind: 'drop' });
      if (!ok) return false;
    }
    setEditingId(null);
    stage(entry.id);
    return true;
  };

  return (
    <ExtraLoad.Provider value={extra}>
    <PerSide.Provider value={side}>
    <Tracking.Provider value={tracking}>
    <Incline.Provider value={cardio && hasIncline(item.exercise_name)}>
      <article className={`${styles.card} ${complete ? styles.complete : ''} ${turn ? styles.turn : ''}`} data-session-item={item.id}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <span className={styles.index}>{complete ? <Check size={16} strokeWidth={3} /> : cardio ? <HeartPulse size={16} /> : label ?? index + 1}</span>
            <MarqueeText as="h2" text={item.exercise_name} className={styles.name} />
            {turn && <span className={styles.turnTag}>Agora</span>}
            {onOpenMenu && (
              <button type="button" className={styles.menu} onClick={() => onOpenMenu(item)} aria-label={`Opções de ${item.exercise_name}`}>
                <MoreVertical size={18} />
              </button>
            )}
            {onRemove && (
              <button type="button" className={`${styles.menu} ${styles.remove}`} onClick={() => onRemove(item)} aria-label={`Remover ${item.exercise_name} do treino`}>
                <Trash2 size={17} />
              </button>
            )}
          </div>
          <div className={styles.headerBottom}>
            <p className={styles.meta}>
              {target ? <span className={styles.target}>{target}</span> : null}
              <span className={styles.metaLine}>
                {cardio ? PHASE_LABEL[item.phase] ?? 'Cardio' : groupsLabel(item)}
                {item.target_sets && !cardio ? ` · ${done}/${item.target_sets}` : ''}
              </span>
            </p>
          {onOpenRest && tracking !== 'cardio' && <button type="button" className={styles.restChip} onClick={() => onOpenRest(item)} aria-label={`Descanso: ${formatRest(item.rest_seconds)}`}>
            <Timer size={14} /> {item.rest_seconds ? formatRest(item.rest_seconds) : '—'}
          </button>}
          </div>
        </header>

        {item.set_plan?.length > 0 && !cardio && !timed && <PlanProgress item={item} />}

        {past.length > 0 && (
          <div className={styles.previousBox}>
            <span className={styles.previousTitle}>Última vez{side ? ' · cada lado' : ''}</span>
            {past.map(entry => (
              <p key={entry.scope} className={`${styles.previous} ${past.length > 1 && entry.scope === item.previous_scope ? styles.previousReference : ''}`}>
                <span className={styles.previousLabel}>
                  {[entry.workout_name, entry.at && formatShortDate(entry.at)].filter(Boolean).join(' · ')}
                </span>
                <span className={styles.previousSets}>
                  {entry.sets.map((set, i) => (
                    <span key={i} className={`${styles.previousSet} ${set.kind === 'warmup' ? styles.previousWarmup : ''}`}>
                      {timed ? setSummary(set, tracking, extra) : previousSetText(set, item, side)}
                    </span>
                  ))}
                </span>
                {entry.note && <span className={styles.previousNote}>“{entry.note}”</span>}
              </p>
            ))}
          </div>
        )}

        {item.sets.length > 0 && (
          <ol className={styles.sets}>
            {rows.map((row, rowIndex) => (row.entry ? (
              <Fragment key={row.entry.id}>
              <SetRow
                key={`${row.entry.id}-${editingId === row.entry.id}-${side}`}
                entry={row.entry}
                label={labels[rowIndex]}
                editing={editingId === row.entry.id}
                onEdit={() => setEditingId(row.entry.id)}
                onCancel={() => setEditingId(null)}
                onSave={saveEdit}
                onDelete={deleteEntry}
                onAddDrop={canDrop && row.entry.kind !== 'warmup' && !row.entry.pending ? addDrop : undefined}
              />
              {staging?.id === row.entry.id && (
                <li className={styles.stageItem}>
                  <StageForm key={`${staging.id}-${staging.stages?.length ?? 0}`} item={item} entry={staging} label={labels[rowIndex]} onSave={onEditSet} onDone={() => stage(null)} />
                </li>
              )}
              </Fragment>
            ) : (
              <PairRow
                key={row.key}
                row={row}
                label={labels[rowIndex]}
                editingId={editingId}
                onEdit={setEditingId}
                onCancel={() => setEditingId(null)}
                onSave={saveEdit}
                onDelete={deleteEntry}
              />
            )))}
          </ol>
        )}

        {picking && (
          <div className={styles.cardioPick} role="radiogroup" aria-label={`Aparelho do ${item.exercise_name}`}>
            <span className={styles.cardioPickLabel}>{needsDevice ? 'Escolha o aparelho' : 'Aparelho'}</span>
            <div className={styles.cardioChips}>
              {cardioOptions.map(option => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={option.id === item.exercise_id}
                  className={`${styles.cardioChip} ${option.id === item.exercise_id ? styles.cardioChipOn : ''}`}
                  onClick={() => option.id !== item.exercise_id && onPickCardio(item, option)}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {staging ? null : needsDevice && onPickCardio ? null : !complete || addingExtra ? (
          !timed && !addingExtra && nextKind(item) === 'warmup' ? (
            <WarmupSet key={`w-${item.sets.length}`} item={item} onLogSet={onLogSet} onStartRest={onStartRest} />
          ) : timed ? (
            <TimedNewSet
              key={`t-${item.sets.length}`}
              item={item}
              extra={extra}
              onLogSet={onLogSet}
              onStartRest={onStartRest}
              onCancel={addingExtra ? () => setExtraAt(null) : undefined}
            />
          ) : item.unilateral ? (
            <UnilateralNewSet
              key={`u-${pairedKey}`}
              item={item}
              onLogSet={onLogSet}
              onStartRest={onStartRest}
              onCancel={addingExtra ? () => setExtraAt(null) : undefined}
            />
          ) : (
            <NewSet
              key={`${pairedKey}-${side}`}
              item={item}
              onLogSet={onLogSet}
              onStartRest={onStartRest}
              onCancel={addingExtra ? () => setExtraAt(null) : undefined}
              onStaged={stage}
              onHold={onStaging}
            />
          )
        ) : (
          <div className={styles.completeBox}>
            <p className={styles.completeText}>
              <Check size={16} strokeWidth={3} aria-hidden="true" /> {tracking === 'cardio' ? 'Cardio feito' : `${item.target_sets} de ${item.target_sets} séries do exercício feitas`}
            </p>
            <button type="button" className={styles.extra} onClick={() => setExtraAt(done)}>
              <Plus size={18} strokeWidth={2.4} /> {tracking === 'cardio' ? 'Adicionar outro trecho' : 'Adicionar série extra'}
            </button>
          </div>
        )}

        {onSaveNote && <ExerciseNote key={item.note ?? ''} item={item} onSave={onSaveNote} />}
      </article>
    </Incline.Provider>
    </Tracking.Provider>
    </PerSide.Provider>
    </ExtraLoad.Provider>
  );
}
