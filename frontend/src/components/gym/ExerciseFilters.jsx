'use client';
import { useMemo, useState } from 'react';
import { PersonStanding, X } from 'lucide-react';
import { EQUIPMENT, MUSCLE_GROUPS, muscleName, normalize } from '../../lib/gym';
import BodyMap, { BodyTypeToggle, useBodyType } from './BodyMap';
import styles from './ExerciseFilters.module.css';

const ROLE_ORDER = { primary: 0, secondary: 1, auxiliary: 2 };
export const ROLE_LABEL = { primary: 'Principal', secondary: 'Secundário', auxiliary: 'Auxiliar' };

const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');

export function useExerciseFilters(exercises) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [muscle, setMuscle] = useState(null);

  const roleOf = (exercise) => (muscle ? exercise.muscles?.find(m => m.muscle === muscle)?.role ?? null : null);

  const visible = useMemo(() => {
    if (!exercises) return [];
    const term = normalize(query);
    const role = (exercise) => exercise.muscles?.find(m => m.muscle === muscle)?.role;
    return exercises
      .filter(e => group === 'all' || (group === 'mine' ? e.is_custom : e.muscle_group === group))
      .filter(e => equipment === 'all' || e.equipment === equipment)
      .filter(e => !muscle || role(e))
      .filter(e => !term || normalize(e.name).includes(term))
      .sort((a, b) => (muscle ? ROLE_ORDER[role(a)] - ROLE_ORDER[role(b)] : 0) || byName(a, b));
  }, [exercises, query, group, equipment, muscle]);

  const active = group !== 'all' || equipment !== 'all' || !!muscle;
  const clear = () => {
    setGroup('all');
    setEquipment('all');
    setMuscle(null);
  };

  return { query, setQuery, group, setGroup, equipment, setEquipment, muscle, setMuscle, roleOf, visible, active, clear };
}

function Chips({ options, value, onChange, label }) {
  return (
    <div className={styles.row} role="tablist" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`${styles.chip} ${value === option.value ? styles.chipActive : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function ExerciseFilters({ filters, exercises, allowMine = false }) {
  const [bodyOpen, setBodyOpen] = useState(false);
  const [bodyType, setBodyType] = useBodyType();
  const { group, setGroup, equipment, setEquipment, muscle, setMuscle } = filters;

  const groupOptions = [
    { value: 'all', label: 'Todos' },
    ...(allowMine ? [{ value: 'mine', label: 'Meus' }] : []),
    ...MUSCLE_GROUPS,
  ];

  const equipmentOptions = useMemo(() => {
    const used = new Set((exercises ?? []).map(e => e.equipment));
    return [{ value: 'all', label: 'Qualquer equipamento' }, ...EQUIPMENT.filter(item => used.has(item.value))];
  }, [exercises]);

  const available = useMemo(() => {
    const keys = new Set();
    (exercises ?? []).forEach(e => e.muscles?.forEach(m => keys.add(m.muscle)));
    return keys;
  }, [exercises]);

  const colors = useMemo(() => {
    const result = {};
    available.forEach(key => {
      result[key] = 'color-mix(in srgb, var(--gym-accent) 22%, var(--gym-surface-3))';
    });
    if (muscle) result[muscle] = 'var(--gym-accent)';
    return result;
  }, [available, muscle]);

  const pickMuscle = (key) => {
    if (key === null) return;
    if (!available.has(key)) return;
    setMuscle(current => (current === key ? null : key));
    setGroup('all');
  };

  return (
    <div className={styles.filters}>
      <Chips options={groupOptions} value={group} onChange={setGroup} label="Filtrar por grupo muscular" />

      <div className={styles.row}>
        <button
          type="button"
          className={`${styles.chip} ${styles.bodyChip} ${muscle || bodyOpen ? styles.chipActive : ''}`}
          onClick={() => setBodyOpen(open => !open)}
          aria-expanded={bodyOpen}
        >
          <PersonStanding size={16} aria-hidden="true" />
          {muscle ? muscleName(muscle) : 'Escolher no boneco'}
        </button>
        {muscle && (
          <button type="button" className={styles.clearChip} onClick={() => setMuscle(null)} aria-label="Limpar músculo">
            <X size={14} />
          </button>
        )}
        <span className={styles.divider} aria-hidden="true" />
        {equipmentOptions.map(option => (
          <button
            key={option.value}
            type="button"
            className={`${styles.chip} ${equipment === option.value ? styles.chipActive : ''}`}
            aria-pressed={equipment === option.value}
            onClick={() => setEquipment(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {bodyOpen && (
        <div className={styles.body}>
          <div className={styles.bodyTop}>
            <p className={styles.bodyHint}>
              {muscle ? <>Mostrando exercícios para <strong>{muscleName(muscle)}</strong></> : 'Toque no músculo que você quer treinar'}
            </p>
            <BodyTypeToggle value={bodyType} onChange={setBodyType} />
          </div>
          <BodyMap
            colors={colors}
            sex={bodyType}
            compact
            selected={muscle}
            onSelect={pickMuscle}
            describe={key => (available.has(key) ? 'toque para filtrar' : 'sem exercícios')}
          />
        </div>
      )}
    </div>
  );
}
