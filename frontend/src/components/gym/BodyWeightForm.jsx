'use client';
import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { cleanKgInput, formatDay, kgInput, parseKg, todayIso } from '../../lib/gym';
import styles from './BodyWeightForm.module.css';

export default function BodyWeightForm({ initial, takenDays, onSubmit, onDelete, compact = false }) {
  const [weight, setWeight] = useState(initial?.weight_kg ? kgInput(initial.weight_kg) : '');
  const [day, setDay] = useState(initial?.measured_on ?? todayIso());
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const today = todayIso();
  const replacing = !initial?.id && takenDays?.has(day);

  const submit = async (e) => {
    e.preventDefault();
    const kg = parseKg(weight);
    if (kg === null || kg < 20 || kg > 400) return setError('Informe um peso entre 20 e 400 kg, ex.: 78,4.');
    if (!day) return setError('Escolha a data.');
    if (day > today) return setError('A data não pode ser no futuro.');
    setError('');
    setSaving(true);
    const problem = await onSubmit({ weight_kg: kg, measured_on: day, note: note.trim() || null });
    setSaving(false);
    if (problem) return setError(problem);
    if (!initial?.id) {
      setWeight('');
      setNote('');
      setDay(todayIso());
    }
  };

  const remove = async () => {
    setSaving(true);
    const ok = await onDelete();
    if (!ok) setSaving(false);
  };

  return (
    <form className={`${styles.form} ${compact ? '' : styles.card}`} onSubmit={submit} noValidate>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Peso</span>
          <span className={styles.weightWrap}>
            <input
              className={`${styles.input} ${styles.weight}`}
              value={weight}
              onChange={e => setWeight(cleanKgInput(e.target.value))}
              inputMode="decimal"
              placeholder="0,0"
              aria-label="Peso em kg"
            />
            <span className={styles.unit}>kg</span>
          </span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Data</span>
          <input
            type="date"
            className={styles.input}
            value={day}
            max={today}
            onChange={e => setDay(e.target.value)}
          />
        </label>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>Observação <small>opcional</small></span>
        <input
          className={styles.input}
          value={note}
          onChange={e => setNote(e.target.value.slice(0, 140))}
          placeholder="Ex.: em jejum, depois do treino"
        />
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        {onDelete && (
          <button type="button" className={styles.delete} onClick={remove} disabled={saving} aria-label="Excluir registro">
            <Trash2 size={18} />
          </button>
        )}
        <button type="submit" className={styles.save} disabled={saving}>
          <Check size={18} strokeWidth={2.8} />
          {saving ? 'Salvando…' : initial?.id ? 'Salvar' : replacing ? `Substituir peso de ${formatDay(day)}` : 'Registrar peso'}
        </button>
      </div>
    </form>
  );
}
