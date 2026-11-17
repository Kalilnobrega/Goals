'use client';
import { useRef, useState } from 'react';
import { Check, CloudOff, Minus, Plus, MoreVertical, Timer, Trash2 } from 'lucide-react';
import {
  muscleLabel, sessionTarget, formatKg, formatRest, formatClock, formatShortDate,
  parseKg, kgInput, cleanKgInput,
} from '../../lib/gym';
import styles from './SessionExerciseCard.module.css';

const digits = (value) => value.replace(/\D/g, '').slice(0, 4);

const stepKg = (text, delta) => {
  const value = parseKg(text) ?? 0;
  return kgInput(Math.min(1000, Math.max(0, Math.round((value + delta) * 100) / 100)));
};

const stepReps = (text, delta) => String(Math.min(1000, Math.max(1, (Number(text) || 0) + delta)));

function SetInputs({ weight, reps, onWeight, onReps, autoFocus }) {
  return (
    <div className={styles.inputs}>
      <div className={styles.inputGroup}>
        <button type="button" className={styles.step} onClick={() => onWeight(stepKg(weight, -2.5))} aria-label="Menos 2,5 kg">
          <Minus size={16} strokeWidth={2.6} />
        </button>
        <label className={styles.field}>
          <input
            className={styles.input}
            value={weight}
            onChange={e => onWeight(cleanKgInput(e.target.value))}
            inputMode="decimal"
            placeholder="0"
            aria-label="Carga em kg"
            autoFocus={autoFocus}
          />
          <span className={styles.unit}>kg</span>
        </label>
        <button type="button" className={styles.step} onClick={() => onWeight(stepKg(weight, 2.5))} aria-label="Mais 2,5 kg">
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

function validate(weight, reps) {
  const kg = parseKg(weight === '' ? '0' : weight);
  if (kg === null) return { error: 'Carga inválida. Use até 2 casas decimais, ex.: 62,5.' };
  const count = Number(reps);
  if (!count) return { error: 'Informe as repetições.' };
  return { data: { weight_kg: kg, reps: count } };
}

function NewSet({ item, onLogSet, onStartRest }) {
  const next = item.sets.length + 1;
  const reference = item.previous[item.sets.length] ?? item.sets[item.sets.length - 1] ?? null;
  const [weight, setWeight] = useState(reference ? kgInput(reference.weight_kg) : '');
  const [reps, setReps] = useState(reference ? String(reference.reps) : item.reps_min ? String(item.reps_min) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const { data, error: problem } = validate(weight, reps);
    if (problem) return setError(problem);
    setError('');
    setSaving(true);
    const ok = await onLogSet(item, data);
    if (!ok) setSaving(false);
  };

  return (
    <form className={styles.newSet} onSubmit={submit} noValidate>
      <SetInputs weight={weight} reps={reps} onWeight={setWeight} onReps={setReps} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.newActions}>
        <button type="submit" className={styles.log} disabled={saving}>
          <Check size={18} strokeWidth={2.8} />
          {saving ? 'Salvando…' : `Registrar série ${next}`}
        </button>
        <button
          type="button"
          className={styles.rest}
          onClick={() => onStartRest(item)}
          aria-label={item.rest_seconds ? `Iniciar descanso de ${formatRest(item.rest_seconds)}` : 'Iniciar cronômetro de descanso'}
        >
          <Timer size={18} /> {formatClock(item.rest_seconds ?? 0)}
        </button>
      </div>
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

function SetRow({ entry, editing, onEdit, onCancel, onSave, onDelete }) {
  const [weight, setWeight] = useState(kgInput(entry.weight_kg));
  const [reps, setReps] = useState(String(entry.reps));
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
          <span className={styles.setValue}>
            {entry.weight_kg > 0 ? <>{formatKg(entry.weight_kg)} <small>kg</small></> : <span className={styles.bodyweight}>Peso corporal</span>}
          </span>
          <span className={styles.setTimes}>×</span>
          <span className={styles.setValue}>{entry.reps} <small>reps</small></span>
          {entry.pending
            ? <CloudOff size={18} className={styles.setWaiting} aria-hidden="true" />
            : <Check size={18} className={styles.setDone} aria-hidden="true" />}
        </button>
      </SwipeToDelete>
    );
  }

  const save = async () => {
    const { data, error: problem } = validate(weight, reps);
    if (problem) return setError(problem);
    setBusy(true);
    const ok = await onSave(entry, data);
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
        <span>Editar série</span>
      </div>
      <SetInputs weight={weight} reps={reps} onWeight={setWeight} onReps={setReps} />
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

export default function SessionExerciseCard({ item, index, onLogSet, onEditSet, onDeleteSet, onStartRest, onOpenRest, onOpenMenu }) {
  const [editingId, setEditingId] = useState(null);
  const target = sessionTarget(item);
  const complete = item.target_sets && item.sets.length >= item.target_sets;

  const saveEdit = async (entry, data) => {
    const ok = await onEditSet(item, entry, data);
    if (ok) setEditingId(null);
    return ok;
  };

  const deleteEntry = async (entry) => {
    const ok = await onDeleteSet(item, entry);
    if (ok) setEditingId(null);
    return ok;
  };

  return (
    <article className={`${styles.card} ${complete ? styles.complete : ''}`}>
      <header className={styles.header}>
        <span className={styles.index}>{complete ? <Check size={16} strokeWidth={3} /> : index + 1}</span>
        <div className={styles.title}>
          <h2 className={styles.name}>{item.exercise_name}</h2>
          <p className={styles.meta}>
            {target ? <span className={styles.target}>{target}</span> : null}
            {target ? ' · ' : ''}
            {muscleLabel(item.muscle_group)}
            {item.target_sets ? ` · ${item.sets.length}/${item.target_sets}` : ''}
          </p>
        </div>
        <button type="button" className={styles.restChip} onClick={() => onOpenRest(item)} aria-label={`Descanso: ${formatRest(item.rest_seconds)}`}>
          <Timer size={14} /> {item.rest_seconds ? formatRest(item.rest_seconds) : '—'}
        </button>
        <button type="button" className={styles.menu} onClick={() => onOpenMenu(item)} aria-label={`Opções de ${item.exercise_name}`}>
          <MoreVertical size={18} />
        </button>
      </header>

      {item.previous.length > 0 && (
        <p className={styles.previous}>
          <span>Última vez{item.previous_at ? ` · ${formatShortDate(item.previous_at)}` : ''}</span>
          {item.previous.map((entry, i) => (
            <span key={i} className={styles.previousSet}>
              {entry.weight_kg > 0 ? formatKg(entry.weight_kg) : 'PC'}×{entry.reps}
            </span>
          ))}
        </p>
      )}

      {item.sets.length > 0 && (
        <ol className={styles.sets}>
          {item.sets.map(entry => (
            <SetRow
              key={`${entry.id}-${editingId === entry.id}`}
              entry={entry}
              editing={editingId === entry.id}
              onEdit={() => setEditingId(entry.id)}
              onCancel={() => setEditingId(null)}
              onSave={saveEdit}
              onDelete={deleteEntry}
            />
          ))}
        </ol>
      )}

      <NewSet key={item.sets.length} item={item} onLogSet={onLogSet} onStartRest={onStartRest} />
    </article>
  );
}
