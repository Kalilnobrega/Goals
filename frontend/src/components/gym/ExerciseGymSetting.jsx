'use client';
import { useState } from 'react';
import { setExerciseGymSetting } from '../../lib/api';
import { apiError } from '../../lib/gym';
import { useToast } from '../Toast';
import GymSwitch from './GymSwitch';
import styles from './ExerciseIntensity.module.css';

const OPTIONS = [
  { value: true, label: 'Separada' },
  { value: false, label: 'Igual' },
];

const GYM_EQUIPMENT = new Set(['machine', 'plate_loaded', 'cable', 'smith']);

export default function ExerciseGymSetting({ exerciseId, name, equipment, gymSpecific: saved, onChange }) {
  const toast = useToast();
  const gymSpecific = saved ?? GYM_EQUIPMENT.has(equipment);
  const [saving, setSaving] = useState(false);

  const change = async (value) => {
    if (saving || value === gymSpecific) return;
    setSaving(true);
    try {
      const result = await setExerciseGymSetting(exerciseId, value);
      onChange?.(result.gym_specific);
      toast(result.gym_specific ? `${name}: carga separada por academia` : `${name}: mesma carga em todas as academias`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível salvar.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.row}>
      <span className={styles.text}>
        <span className={styles.label}>Carga entre academias</span>
        <span className={styles.hint}>
          {gymSpecific
            ? 'Carga anterior, recordes e evolução contam só a academia do treino'
            : 'A mesma máquina ou peso em todas as academias'}
        </span>
      </span>
      <GymSwitch options={OPTIONS} value={!!gymSpecific} onChange={change} label={`Carga de ${name} entre academias`} disabled={saving} />
    </div>
  );
}
