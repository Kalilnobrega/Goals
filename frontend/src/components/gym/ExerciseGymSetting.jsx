'use client';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { getGyms, peekCache, setExerciseGymSetting } from '../../lib/api';
import { apiError } from '../../lib/gym';
import { useToast } from '../Toast';
import GymSwitch from './GymSwitch';
import styles from './ExerciseIntensity.module.css';

const GYM_EQUIPMENT = new Set(['machine', 'plate_loaded', 'cable', 'smith']);

const HINTS = {
  separate: 'Carga anterior, recordes e evolução contam só a academia do treino',
  same: 'A mesma máquina ou peso em todas as academias',
  custom: 'Marque as academias que têm o mesmo aparelho. As outras seguem separadas',
};

export default function ExerciseGymSetting({ exerciseId, name, equipment, gymSpecific: saved, sharedGymIds = [], onChange }) {
  const toast = useToast();
  const [gyms, setGyms] = useState(() => peekCache('fitnessGyms')?.gyms ?? []);
  const savedMode = sharedGymIds.length ? 'custom' : (saved ?? GYM_EQUIPMENT.has(equipment)) ? 'separate' : 'same';
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(sharedGymIds);
  const [saving, setSaving] = useState(false);
  const mode = picking ? 'custom' : savedMode;
  const canCustomize = gyms.length > 2;

  useEffect(() => {
    getGyms().then(result => setGyms(result.gyms)).catch(() => {});
  }, []);

  const save = async (payload, message) => {
    setSaving(true);
    try {
      const result = await setExerciseGymSetting(exerciseId, payload);
      onChange?.(result);
      setPicking(false);
      toast(message(result));
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível salvar.') });
    } finally {
      setSaving(false);
    }
  };

  const choose = (value) => {
    if (saving || value === mode) return;
    if (value === 'custom') {
      setDraft(sharedGymIds);
      setPicking(true);
      return;
    }
    setPicking(false);
    if (value === savedMode) return;
    save(
      { gym_specific: value === 'separate' },
      result => (result.gym_specific ? `${name}: carga separada por academia` : `${name}: mesma carga em todas as academias`),
    );
  };

  const toggle = (gymId) => setDraft(current => (current.includes(gymId) ? current.filter(id => id !== gymId) : [...current, gymId]));

  const saveGroup = () => save(
    { shared_gym_ids: draft },
    result => (result.shared_gym_ids.length ? `${name}: mesma carga nas academias marcadas` : `${name}: mesma carga em todas as academias`),
  );

  const options = [
    { value: 'separate', label: 'Separada' },
    { value: 'same', label: 'Igual' },
    ...(canCustomize || savedMode === 'custom' ? [{ value: 'custom', label: 'Personalizar' }] : []),
  ];
  const changed = draft.length !== sharedGymIds.length || draft.some(id => !sharedGymIds.includes(id));

  return (
    <div className={`${styles.row} ${options.length > 2 ? styles.rowStacked : ''}`}>
      <span className={styles.text}>
        <span className={styles.label}>Carga entre academias</span>
        <span className={styles.hint}>{HINTS[mode]}</span>
      </span>
      <GymSwitch options={options} value={mode} onChange={choose} label={`Carga de ${name} entre academias`} disabled={saving} cycle={false} />
      {mode === 'custom' && (
        <div className={styles.gymPicks} role="group" aria-label="Academias com o mesmo aparelho">
          {gyms.map(gym => {
            const on = draft.includes(gym.id);
            return (
              <button
                key={gym.id}
                type="button"
                className={`${styles.gymPick} ${on ? styles.gymPickOn : ''}`}
                onClick={() => toggle(gym.id)}
                aria-pressed={on}
                disabled={saving}
              >
                <span className={styles.gymPickBox} aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                <span>{gym.name}</span>
              </button>
            );
          })}
          {(changed || picking) && (
            <button type="button" className={styles.gymSave} onClick={saveGroup} disabled={saving || draft.length < 2}>
              {saving ? 'Salvando…' : draft.length < 2 ? 'Marque pelo menos duas' : 'Salvar academias'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
