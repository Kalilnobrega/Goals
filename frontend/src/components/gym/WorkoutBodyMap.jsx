'use client';
import { useState } from 'react';
import { Activity } from 'lucide-react';
import { formatSets, muscleName, muscleSets } from '../../lib/gym';
import BodyMap, { BodyTypeToggle, useBodyType } from './BodyMap';
import styles from './WorkoutBodyMap.module.css';

export function workoutEntries(exercises) {
  return exercises.map(item => ({ muscles: item.exercise?.muscles, sets: item.target_sets }));
}

function intensityColors(sets) {
  const max = Math.max(...Object.values(sets), 0);
  if (!max) return {};
  return Object.fromEntries(
    Object.entries(sets)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => [key, `color-mix(in srgb, var(--gym-accent) ${Math.round(25 + (value / max) * 75)}%, var(--gym-surface-3))`]),
  );
}

export function WorkoutBodyMini({ exercises, sex }) {
  const sets = muscleSets(workoutEntries(exercises));
  const top = Object.entries(sets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => muscleName(key));
  if (!top.length) return null;
  return (
    <span className={styles.mini} role="img" aria-label={`Trabalha principalmente: ${top.join(', ')}`}>
      <BodyMap colors={intensityColors(sets)} sex={sex} size="mini" />
    </span>
  );
}

export default function WorkoutBodyMap({ exercises }) {
  const [bodyType, setBodyType] = useBodyType();
  const [selected, setSelected] = useState(null);
  const sets = muscleSets(workoutEntries(exercises));
  if (!Object.keys(sets).length) return null;
  const value = selected ? sets[selected] ?? 0 : 0;

  return (
    <section className={styles.card} aria-labelledby="workout-body-title">
      <div className={styles.header}>
        <Activity size={16} className={styles.icon} aria-hidden="true" />
        <h2 id="workout-body-title" className={styles.title}>O que esta ficha treina</h2>
        <BodyTypeToggle value={bodyType} onChange={setBodyType} />
      </div>
      <p className={styles.hint}>Mais forte = mais séries por treino. Principal conta 1 série; secundário, meia; auxiliar, um quarto.</p>
      <BodyMap
        colors={intensityColors(sets)}
        sex={bodyType}
        compact
        selected={selected}
        onSelect={key => setSelected(current => (current === key ? null : key))}
        describe={key => (sets[key] ? `${formatSets(sets[key])} por treino` : 'não trabalhado nesta ficha')}
      />
      <p className={styles.selection} aria-live="polite">
        {selected
          ? <><strong>{muscleName(selected)}</strong> · {value ? `${formatSets(value)} por treino` : 'não trabalhado nesta ficha'}</>
          : 'Toque num músculo para ver as séries'}
      </p>
    </section>
  );
}
