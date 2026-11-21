'use client';
import { createContext, useContext, useRef, useState } from 'react';
import { Check, CloudOff, HeartPulse, Minus, Plus, MoreVertical, Timer, Trash2, MessageSquareText, Pencil } from 'lucide-react';
import {
  sessionTarget, formatKg, formatRest, formatClock, formatShortDate,
  parseKg, kgInput, cleanKgInput, seriesCount, seriesRows, SIDE_LABEL, SIDE_NAME, groupsLabel, setSummary, RIR_OPTIONS, rirLabel, perSide, hasIncline } from '../../lib/gym';
import MarqueeText from './MarqueeText';
import { TimedEditSet, TimedNewSet } from './TimedEntry';
import styles from './SessionExerciseCard.module.css';

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

function NewSet({ item, onLogSet, onStartRest, onCancel }) {
  const next = item.sets.length + 1;
  const reference = item.previous[item.sets.length] ?? item.sets[item.sets.length - 1] ?? null;
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
    const ok = await onLogSet(item, withRir(data, rir));
    if (!ok) setSaving(false);
  };

  return (
    <form className={styles.newSet} onSubmit={submit} noValidate>
      <SetInputs weight={weight} reps={reps} onWeight={setWeight} onReps={setReps} />
      <RirPicker value={rir} onChange={setRir} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.newActions}>
        <button type="submit" className={styles.log} disabled={saving}>
          <Check size={18} strokeWidth={2.8} />
          {saving ? 'Salvando…' : `Registrar série ${next}`}
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
      entries.push(withRir({ ...data, side }, rir));
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
      {missing.map(side => (
        <SideFields key={side} side={side} values={values[side]} onChange={next => setValues(current => ({ ...current, [side]: next }))} />
      ))}
      <RirPicker value={rir} onChange={setRir} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.newActions}>
        <button type="submit" className={styles.log} disabled={saving}>
          <Check size={18} strokeWidth={2.8} />
          {saving ? 'Salvando…' : missing.length === 2 ? `Registrar série ${pairs + 1}` : `Completar série ${pairs + 1} (${SIDE_NAME[missing[0]].toLowerCase()})`}
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

function SetRow({ entry, editing, onEdit, onCancel, onSave, onDelete }) {
  const extra = useContext(ExtraLoad);
  const tracking = useContext(Tracking);
  const incline = useContext(Incline);
  const timed = tracking !== 'reps';
  const side = useContext(PerSide);
  const [weight, setWeight] = useState(inputKg(entry.weight_kg, side));
  const [reps, setReps] = useState(String(entry.reps));
  const [rir, setRir] = useState(entry.rir ?? null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <SwipeToDelete onDelete={() => onDelete(entry)}>
        <button
          type="button"
          className={`${styles.setRow} ${entry.pending ? styles.setPending : ''}`}
          onClick={entry.pending ? undefined : onEdit}
          aria-label={entry.pending ? `Série ${entry.position} guardada no celular, aguardando conexão` : `Editar série ${entry.position}`}
        >
          <span className={styles.setIndex}>{entry.position}</span>
          {timed ? (
            <span className={`${styles.setValue} ${styles.setTimed}`}>{setSummary(entry, tracking, extra)}</span>
          ) : (<>
          <span className={styles.setValue}>
            {entry.weight_kg > 0
              ? <>{extra && <span className={styles.bodyweightPrefix}>PC +</span>}{formatKg(shownKg(entry.weight_kg, side))} <small>{side ? 'kg/lado' : 'kg'}</small></>
              : <span className={styles.bodyweight}>Peso corporal</span>}
          </span>
          <span className={styles.setTimes}>×</span>
          <span className={styles.setValue}>{entry.reps} <small>reps</small></span>
          {entry.rir != null && <span className={styles.tag}>RIR {rirLabel(entry.rir)}</span>}
          </>)}
          {entry.pending
            ? <CloudOff size={18} className={styles.setWaiting} aria-hidden="true" />
            : <Check size={18} className={styles.setDone} aria-hidden="true" />}
        </button>
      </SwipeToDelete>
    );
  }

  if (timed) {
    return <TimedEditSet entry={entry} tracking={tracking} extra={extra} onSave={onSave} onDelete={onDelete} onCancel={onCancel} incline={incline} />;
  }

  const save = async () => {
    const { data, error: problem } = validate(weight, reps, side);
    if (problem) return setError(problem);
    setBusy(true);
    const ok = await onSave(entry, { ...data, rir });
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
        <span className={styles.setIndex}>{entry.position}</span>
        <span>Editar série{entry.side ? ` · ${SIDE_NAME[entry.side]}` : ''}</span>
      </div>
      <SetInputs weight={weight} reps={reps} onWeight={setWeight} onReps={setReps} />
      <RirPicker value={rir} onChange={setRir} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.editActions}>
        <button type="button" className={styles.editDelete} onClick={remove} disabled={busy} aria-label={`Excluir série ${entry.position}`}>
          <Trash2 size={18} />
        </button>
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

function PairRow({ row, editingId, onEdit, onCancel, onSave, onDelete }) {
  const extra = useContext(ExtraLoad);
  const editing = [row.left, row.right].find(entry => entry && entry.id === editingId);
  if (editing) {
    return (
      <SetRow key={editing.id} entry={editing} editing onEdit={() => {}} onCancel={onCancel} onSave={onSave} onDelete={onDelete} />
    );
  }

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
      <div className={`${styles.setRow} ${styles.pairRow} ${pending ? styles.setPending : ''}`}>
        <span className={styles.setIndex}>{row.position}</span>
        {['left', 'right'].map(side => {
          const entry = row[side];
          return (
            <button
              key={side}
              type="button"
              className={`${styles.pairSide} ${entry ? '' : styles.pairMissing}`}
              onClick={entry && !entry.pending ? () => onEdit(entry.id) : undefined}
              disabled={!entry || entry.pending}
              aria-label={entry ? `Editar série ${row.position}, ${SIDE_NAME[side].toLowerCase()}: ${sideValue(entry, extra)}` : `${SIDE_NAME[side]} ainda não registrada`}
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

export default function SessionExerciseCard({ item, index, onLogSet, onEditSet, onDeleteSet, onStartRest, onOpenRest, onOpenMenu, onRemove, onSaveNote, cardioOptions, onPickCardio }) {
  const [editingId, setEditingId] = useState(null);
  const [extraAt, setExtraAt] = useState(null);
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

  return (
    <ExtraLoad.Provider value={extra}>
    <PerSide.Provider value={side}>
    <Tracking.Provider value={tracking}>
    <Incline.Provider value={cardio && hasIncline(item.exercise_name)}>
      <article className={`${styles.card} ${complete ? styles.complete : ''}`}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <span className={styles.index}>{complete ? <Check size={16} strokeWidth={3} /> : cardio ? <HeartPulse size={16} /> : index + 1}</span>
            <MarqueeText as="h2" text={item.exercise_name} className={styles.name} />
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

        {item.previous.length > 0 && (
          <p className={styles.previous}>
            <span>Última vez{item.previous_at ? ` · ${formatShortDate(item.previous_at)}` : ''}{side ? ' · cada lado' : ''}</span>
            {item.previous.map((entry, i) => (
              <span key={i} className={styles.previousSet}>
                {timed ? setSummary(entry, tracking, extra) : <>{entry.side ? `${SIDE_LABEL[entry.side]} ` : ''}{item.equipment === 'bodyweight' && entry.weight_kg > 0 ? `PC+${formatKg(entry.weight_kg)}` : entry.weight_kg > 0 ? formatKg(shownKg(entry.weight_kg, side)) : 'PC'}×{entry.reps}</>}
              </span>
            ))}
            {item.previous_note && <span className={styles.previousNote}>“{item.previous_note}”</span>}
          </p>
        )}

        {item.sets.length > 0 && (
          <ol className={styles.sets}>
            {rows.map(row => (row.entry ? (
              <SetRow
                key={`${row.entry.id}-${editingId === row.entry.id}-${side}`}
                entry={row.entry}
                editing={editingId === row.entry.id}
                onEdit={() => setEditingId(row.entry.id)}
                onCancel={() => setEditingId(null)}
                onSave={saveEdit}
                onDelete={deleteEntry}
              />
            ) : (
              <PairRow
                key={row.key}
                row={row}
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

        {needsDevice && onPickCardio ? null : !complete || addingExtra ? (
          timed ? (
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
