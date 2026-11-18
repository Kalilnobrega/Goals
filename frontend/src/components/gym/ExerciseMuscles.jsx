'use client';
import { useState } from 'react';
import { muscleName } from '../../lib/gym';
import BodyMap, { BodyTypeToggle, useBodyType } from './BodyMap';
import styles from './ExerciseMuscles.module.css';

export const ROLES = [
  { key: 'primary', label: 'Principal', plural: 'Principais', color: 'var(--gym-accent)' },
  { key: 'secondary', label: 'Secundário', plural: 'Secundários', color: 'color-mix(in srgb, var(--gym-accent) 62%, var(--gym-surface-3))' },
  { key: 'auxiliary', label: 'Auxiliar', plural: 'Auxiliares', color: 'color-mix(in srgb, var(--gym-accent) 32%, var(--gym-surface-3))' },
];

const ROLE = Object.fromEntries(ROLES.map(role => [role.key, role]));
const ORDER = { primary: 0, secondary: 1, auxiliary: 2 };
const NEXT = { primary: 'secondary', secondary: 'auxiliary', auxiliary: null };

export const roleColors = (muscles = []) => Object.fromEntries(muscles.map(m => [m.muscle, ROLE[m.role].color]));

const byRole = (a, b) => ORDER[a.role] - ORDER[b.role];

export function MuscleLegend() {
  return (
    <ul className={styles.legend} aria-hidden="true">
      {ROLES.map(role => (
        <li key={role.key}><span className={styles.swatch} style={{ background: role.color }} /> {role.label}</li>
      ))}
    </ul>
  );
}

export default function ExerciseMuscles({ muscles }) {
  const [bodyType, setBodyType] = useBodyType();
  const [selected, setSelected] = useState(null);
  const roles = new Map(muscles.map(m => [m.muscle, m.role]));

  if (!muscles.length) {
    return <p className={styles.empty}>Este exercício ainda não tem músculos marcados.</p>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <MuscleLegend />
        <BodyTypeToggle value={bodyType} onChange={setBodyType} />
      </div>
      <BodyMap
        colors={roleColors(muscles)}
        sex={bodyType}
        selected={selected}
        onSelect={key => setSelected(current => (current === key ? null : key))}
        describe={key => (roles.has(key) ? ROLE[roles.get(key)].label : 'não trabalhado')}
      />
      <p className={styles.selection} aria-live="polite">
        {selected
          ? <><strong>{muscleName(selected)}</strong> · {roles.has(selected) ? ROLE[roles.get(selected)].label.toLowerCase() : 'não trabalhado neste exercício'}</>
          : 'Toque num músculo para ver o nome'}
      </p>
      <div className={styles.lists}>
        {ROLES.map(role => {
          const items = muscles.filter(m => m.role === role.key);
          if (!items.length) return null;
          return (
            <div key={role.key}>
              <h3 className={styles.listTitle}>{role.plural}</h3>
              <ul className={styles.chips}>
                {items.map(m => (
                  <li key={m.muscle} className={`${styles.chip} ${role.key === 'primary' ? styles.chipPrimary : ''}`}>
                    <span className={styles.dot} style={{ background: role.color }} aria-hidden="true" />
                    {muscleName(m.muscle)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MusclePicker({ value, onChange }) {
  const [bodyType, setBodyType] = useBodyType();
  const roles = new Map(value.map(m => [m.muscle, m.role]));

  const cycle = (key) => {
    const role = roles.get(key);
    if (!role) return onChange([...value, { muscle: key, role: 'primary' }]);
    const next = NEXT[role];
    if (next) onChange(value.map(m => (m.muscle === key ? { ...m, role: next } : m)));
    else onChange(value.filter(m => m.muscle !== key));
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <MuscleLegend />
        <BodyTypeToggle value={bodyType} onChange={setBodyType} />
      </div>
      <p className={styles.hint}>Cada toque muda o nível: principal, secundário, auxiliar e, no quarto toque, tira o músculo.</p>
      <BodyMap
        colors={roleColors(value)}
        sex={bodyType}
        onSelect={cycle}
        describe={key => (roles.has(key) ? `${ROLE[roles.get(key)].label}, toque para mudar` : 'toque para marcar como principal')}
      />
      {value.length > 0 && (
        <ul className={styles.chips}>
          {[...value].sort(byRole).map(m => (
            <li key={m.muscle}>
              <button
                type="button"
                className={`${styles.chip} ${styles.chipButton} ${m.role === 'primary' ? styles.chipPrimary : ''}`}
                onClick={() => cycle(m.muscle)}
                aria-label={`${muscleName(m.muscle)}, ${ROLE[m.role].label.toLowerCase()}. Toque para mudar`}
              >
                <span className={styles.dot} style={{ background: ROLE[m.role].color }} aria-hidden="true" />
                {muscleName(m.muscle)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
