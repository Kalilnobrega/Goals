'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { MUSCLE_GROUPS, EQUIPMENT, MUSCLES, TRACKING, INTENSITY, guessIntensity } from '../../lib/gym';
import { MusclePicker } from './ExerciseMuscles';
import GymSwitch from './GymSwitch';
import styles from './ExerciseForm.module.css';

const SIDE_OPTIONS = [{ value: false, label: 'Bilateral' }, { value: true, label: 'Unilateral' }];

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
  const [tracking, setTracking] = useState(initial?.tracking ?? 'reps');
  const [factor, setFactor] = useState(String(Math.round((initial?.bodyweight_factor ?? 1) * 100)));
  const [muscles, setMuscles] = useState(initial?.muscles ?? []);
  const [intensity, setIntensity] = useState(initial?.intensity ?? null);
  const shownIntensity = intensity ?? guessIntensity(muscleGroup, muscles);

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
    const share = Math.min(100, Math.max(0, Number(factor) || 0)) / 100;
    const message = await onSubmit({
      name: name.trim(),
      muscle_group: muscleGroup,
      equipment,
      is_unilateral: unilateral,
      bodyweight_factor: equipment === 'bodyweight' ? share : null,
      tracking,
      intensity: tracking === 'reps' ? shownIntensity : null,
      muscles,
    });
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
      <ChoiceGroup
        label="Equipamento"
        options={EQUIPMENT}
        value={equipment}
        onChange={value => {
          setEquipment(value);
          if (value === 'cardio') setTracking('cardio');
          else if (tracking === 'cardio') setTracking('reps');
        }}
      />

      <div className={styles.field}>
        <span className={styles.label}>Como registrar</span>
        <div className={styles.trackingRow} role="radiogroup" aria-label="Como registrar">
          {TRACKING.map(option => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={tracking === option.value}
              className={`${styles.trackingChip} ${tracking === option.value ? styles.trackingActive : ''}`}
              onClick={() => setTracking(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {tracking === 'reps' && (
        <div className={styles.field}>
          <ChoiceGroup label="Intensidade" options={INTENSITY} value={shownIntensity} onChange={setIntensity} />
          <small className={styles.hint}>
            {intensity ? 'Usada para estimar quanto dura cada série.' : 'Sugestão pelos músculos. Usada para estimar quanto dura cada série.'}
            {' '}Baixo: rosca, tríceps. Moderado: extensora, pulldown. Alto: supino, remada. Muito alto: agachamento, terra.
          </small>
        </div>
      )}

      {equipment === 'bodyweight' && (
        <label className={styles.field}>
          <span className={styles.label}>Quanto do peso corporal é levantado</span>
          <span className={styles.percent}>
            <input
              className={styles.input}
              value={factor}
              onChange={e => setFactor(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              aria-label="Porcentagem do peso corporal"
            />
            <span>%</span>
          </span>
          <small className={styles.hint}>Barra fixa e paralela ~95%, flexão ~65%, banco romano ~50%, prancha 0%. Usado no volume e no 1RM.</small>
        </label>
      )}

      <div className={styles.field}>
        <span className={styles.label}>Execução</span>
        <GymSwitch label="Execução" value={unilateral} options={SIDE_OPTIONS} onChange={setUnilateral} />
        <small className={styles.hint}>
          {unilateral ? 'Um lado de cada vez: no treino, cada série tem carga e reps da esquerda e da direita.' : 'Os dois lados juntos: cada série tem uma carga e um número de reps.'}
        </small>
      </div>

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
