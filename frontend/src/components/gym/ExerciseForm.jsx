'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { MUSCLE_GROUPS, EQUIPMENT } from '../../lib/gym';
import styles from './ExerciseForm.module.css';

function ChoiceGroup({ label, options, value, onChange }) {
  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.choices}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            className={`${styles.choice} ${value === option.value ? styles.choiceActive : ''}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function ExerciseForm({ initial, onSubmit, onDelete }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [muscleGroup, setMuscleGroup] = useState(initial?.muscle_group ?? null);
  const [equipment, setEquipment] = useState(initial?.equipment ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Dê um nome para o exercício.');
    if (!muscleGroup) return setError('Escolha o grupo muscular.');
    if (!equipment) return setError('Escolha o equipamento.');
    setError('');
    setSaving(true);
    const message = await onSubmit({ name: name.trim(), muscle_group: muscleGroup, equipment });
    setSaving(false);
    if (message) setError(message);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label className={styles.field}>
        <span className={styles.label}>Nome</span>
        <input
          className={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={60}
          placeholder="Ex.: Remada articulada"
          autoComplete="off"
          enterKeyHint="done"
        />
      </label>

      <ChoiceGroup label="Grupo muscular" options={MUSCLE_GROUPS} value={muscleGroup} onChange={setMuscleGroup} />
      <ChoiceGroup label="Equipamento" options={EQUIPMENT} value={equipment} onChange={setEquipment} />

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        {onDelete && (
          <button type="button" className={styles.delete} onClick={onDelete} aria-label="Excluir exercício">
            <Trash2 size={20} />
          </button>
        )}
        <button type="submit" className={styles.submit} disabled={saving}>
          {saving ? 'Salvando…' : onDelete ? 'Salvar alterações' : 'Criar exercício'}
        </button>
      </div>
    </form>
  );
}
