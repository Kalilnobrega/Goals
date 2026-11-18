'use client';
import { useCallback, useEffect, useState } from 'react';
import { getFitnessProfile, peekCache, updateFitnessProfile } from '../../lib/api';
import { muscleName } from '../../lib/gym';
import {
  ARM_ROTATION, BACK, FRONT, HAIR_BACK, HAIR_FRONT, NEUTRAL_BACK, NEUTRAL_FRONT, SEX_SHAPE, VIEW_HEIGHT, VIEW_WIDTH,
} from './bodyShapes';
import styles from './BodyMap.module.css';

const MIRROR = `translate(${VIEW_WIDTH},0) scale(-1,1)`;

export function useBodyType() {
  const [bodyType, setBodyType] = useState(() => peekCache('fitnessProfile')?.body_type ?? 'male');

  useEffect(() => {
    let active = true;
    getFitnessProfile().then(profile => { if (active) setBodyType(profile.body_type); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const change = useCallback((next) => {
    setBodyType(next);
    updateFitnessProfile({ body_type: next }).catch(() => {});
  }, []);

  return [bodyType, change];
}

export function BodyTypeToggle({ value, onChange }) {
  return (
    <div className={styles.toggle} role="radiogroup" aria-label="Boneco">
      {[{ key: 'male', label: 'Masculino' }, { key: 'female', label: 'Feminino' }].map(option => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={value === option.key}
          className={`${styles.toggleOption} ${value === option.key ? styles.toggleActive : ''}`}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function fillFor(value) {
  if (!value) return 'var(--gym-surface-3)';
  const strength = Math.round(30 + Math.min(value, 1) * 70);
  return `color-mix(in srgb, var(--gym-accent) ${strength}%, var(--gym-surface-3))`;
}

function Figure({ view, sex, values, colors, selected, onSelect, describe }) {
  const shape = SEX_SHAPE[sex] ?? SEX_SHAPE.male;
  const neutral = view === 'front' ? NEUTRAL_FRONT : NEUTRAL_BACK;
  const muscles = view === 'front' ? FRONT : BACK;
  const zoneTransform = (zone) => (zone ? `translate(${VIEW_WIDTH / 2},0) scale(${shape[zone]},1) translate(${-VIEW_WIDTH / 2},0)` : undefined);
  const placement = (item, mirrored) => [mirrored ? MIRROR : '', item.part === 'arm' ? ARM_ROTATION : ''].filter(Boolean).join(' ') || undefined;
  const firstIndex = new Map();
  muscles.forEach((item, index) => { if (!firstIndex.has(item.key)) firstIndex.set(item.key, index); });

  const muscle = (item, index, mirrored) => {
    const interactive = !!onSelect && !mirrored && firstIndex.get(item.key) === index;
    return (
      <path
        key={`${item.key}-${index}-${mirrored ? 'r' : 'l'}`}
        d={item.d}
        transform={placement(item, mirrored)}
        className={`${styles.muscle} ${selected === item.key ? styles.selected : ''} ${onSelect ? styles.clickable : ''}`}
        style={{ fill: colors?.[item.key] ?? fillFor(values[item.key] ?? 0) }}
        onClick={onSelect ? () => onSelect(item.key) : undefined}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `${muscleName(item.key)}${describe ? `: ${describe(item.key)}` : ''}` : undefined}
        aria-hidden={interactive ? undefined : true}
        onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(item.key); } } : undefined}
      />
    );
  };

  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className={styles.svg} role="group" aria-label={view === 'front' ? 'Corpo de frente' : 'Corpo de costas'}>
        {neutral.map((item, index) => (
          <g key={index} transform={zoneTransform(item.zone)} aria-hidden="true">
            <path d={item.d} className={styles.neutral} fillRule="evenodd" transform={placement(item, false)} />
            {item.mirror !== false && <path d={item.d} className={styles.neutral} fillRule="evenodd" transform={placement(item, true)} />}
          </g>
        ))}
        {shape.hair && <path d={view === 'front' ? HAIR_FRONT : HAIR_BACK} className={styles.hair} fillRule="evenodd" aria-hidden="true" />}
        {['upper', 'lower'].map(zone => (
          <g key={zone} transform={zoneTransform(zone)}>
            {muscles.map((item, index) => (item.zone === zone ? muscle(item, index, false) : null))}
            {muscles.map((item, index) => (item.zone === zone ? muscle(item, index, true) : null))}
          </g>
        ))}
      </svg>
      <figcaption className={styles.caption}>{view === 'front' ? 'Frente' : 'Costas'}</figcaption>
    </figure>
  );
}

export default function BodyMap({ values = {}, colors, sex = 'male', selected = null, onSelect, describe, compact = false, size }) {
  return (
    <div className={`${styles.body} ${compact ? styles.compact : ''} ${size === 'mini' ? styles.mini : ''}`}>
      <Figure view="front" sex={sex} values={values} colors={colors} selected={selected} onSelect={onSelect} describe={describe} />
      <Figure view="back" sex={sex} values={values} colors={colors} selected={selected} onSelect={onSelect} describe={describe} />
    </div>
  );
}
