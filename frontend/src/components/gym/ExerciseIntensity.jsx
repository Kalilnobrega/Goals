'use client';
import { useState } from 'react';
import { setExerciseIntensity } from '../../lib/api';
import { INTENSITY, apiError, intensityLabel, setEstimate } from '../../lib/gym';
import { useToast } from '../Toast';
import GymSelect from './GymSelect';
import styles from './ExerciseIntensity.module.css';

const RESET = '__default';

export default function ExerciseIntensity({ exerciseId, name, intensity, defaultIntensity, onChange }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  if (!intensity) return null;
  const adjusted = defaultIntensity && intensity !== defaultIntensity;
  const options = [
    ...(adjusted ? [{ value: RESET, label: `Voltar ao padrão (${intensityLabel(defaultIntensity)})` }] : []),
    ...INTENSITY.map(item => ({ value: item.value, short: item.label, label: `${item.label} · ~${setEstimate(item.value)} s por série de 10` })),
  ];

  const change = async (value) => {
    if (saving || value === intensity) return;
    setSaving(true);
    try {
      const updated = await setExerciseIntensity(exerciseId, value === RESET ? null : value);
      onChange?.(updated);
      toast(`Intensidade de ${name}: ${intensityLabel(updated.intensity)}`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível mudar a intensidade.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.row}>
      <span className={styles.text}>
        <span className={styles.label}>Intensidade</span>
        <span className={styles.hint}>
          ~{setEstimate(intensity)} s por série de 10 reps{adjusted ? ' · ajustada por você' : ''}
        </span>
      </span>
      <GymSelect
        value={intensity}
        options={options}
        onChange={change}
        title={`Intensidade · ${name}`}
        label={`Intensidade de ${name}`}
        hint="Usada para estimar quanto dura cada série e separar o tempo de séries, descanso e preparação. Vale só para você."
        className={styles.trigger}
      />
    </div>
  );
}
