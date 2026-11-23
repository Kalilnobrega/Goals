'use client';
import { useState } from 'react';
import { Activity } from 'lucide-react';
import { formatSets, muscleName, muscleSets, VOLUME_BANDS, volumeBand } from '../../lib/gym';
import BodyMap, { useBodyType } from './BodyMap';
import styles from './PlanBodyMap.module.css';

export function planMuscleSets(week, byId) {
  const entries = [];
  week.forEach(ids => ids.forEach(id => {
    const workout = byId.get(id);
    workout?.exercises.forEach(item => entries.push({ muscles: item.exercise.muscles, sets: item.target_sets }));
  }));
  return muscleSets(entries);
}

export default function PlanBodyMap({ sets }) {
  const [bodyType] = useBodyType();
  const [selected, setSelected] = useState(null);
  const colors = Object.fromEntries(Object.entries(sets).filter(([, value]) => value > 0).map(([key, value]) => [key, volumeBand(value).color]));
  const value = selected ? sets[selected] ?? 0 : 0;

  return (
    <section className={styles.card} aria-labelledby="plan-body-title">
      <div className={styles.header}>
        <Activity size={16} className={styles.icon} aria-hidden="true" />
        <h2 id="plan-body-title" className={styles.title}>Mapa muscular</h2>
      </div>
      <ul className={styles.legend} aria-label="Faixas de volume semanal">
        {VOLUME_BANDS.map(band => (
          <li key={band.key}><span className={styles.swatch} style={{ background: band.color }} aria-hidden="true" />{band.label}</li>
        ))}
      </ul>
      <BodyMap
        colors={colors}
        sex={bodyType}
        selected={selected}
        onSelect={key => setSelected(current => (current === key ? null : key))}
        describe={key => (sets[key] ? `${formatSets(sets[key])} por semana, ${volumeBand(sets[key]).label.toLowerCase()}` : 'sem séries no plano')}
      />
      <p className={styles.selection} aria-live="polite">
        {selected
          ? value
            ? <><strong>{muscleName(selected)}</strong> · {formatSets(value)} por semana · {volumeBand(value).label.toLowerCase()}</>
            : <><strong>{muscleName(selected)}</strong> · sem séries no plano</>
          : 'Toque num músculo para ver as séries semanais'}
      </p>
      <p className={styles.note}>Principal conta 1 série; secundário, meia; auxiliar, um quarto.</p>
    </section>
  );
}
