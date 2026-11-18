'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { MUSCLE_GROUPS, EQUIPMENT, MUSCLES } from '../../lib/gym';
import { MusclePicker } from './ExerciseMuscles';
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
  const [unilateral, setUnilateral] = useState(initial?.is_unilateral ?? false);
  const [muscles, setMuscles] = useState(initial?.muscles ?? []);

  const changeMuscles = (next) => {
    setMuscles(next);
    const firstPrimary = next.find(m => m.role === 'primary');
    if (!muscleGroup && firstPrimary) setMuscleGroup(MUSCLES[firstPrimary.muscle].group);
  };
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Dê um nome para o exercício.');
    if (!muscleGroup) return setError('Escolha o grupo muscular.');
    if (!equipment) return setError('Escolha o equipamento.');
    setError('');
    setSaving(true);
    const message = await onSubmit({ name: name.trim(), muscle_group: muscleGroup, equipment, is_unilateral: unilateral, muscles });
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

      <label className={styles.toggle}>
        <input type="checkbox" checked={unilateral} onChange={e => setUnilateral(e.target.checked)} />
        <span>
          Unilateral (um lado de cada vez)
          <small>No treino, cada série tem carga e reps da esquerda e da direita</small>
        </span>
      </label>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Músculos <small>opcional</small></legend>
        <MusclePicker value={muscles} onChange={changeMuscles} />
      </fieldset>

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
