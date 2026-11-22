'use client';
import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { getGymStreak, peekCache } from '../../lib/api';
import { plural } from '../../lib/gym';
import styles from './GymStreak.module.css';

function describe(streak) {
  const run = streak.current > 1
    ? `${streak.current} semanas seguidas batendo a meta`
    : streak.current === 1 ? '1 semana batendo a meta' : 'Nenhuma semana seguida batendo a meta ainda';
  const week = streak.week_done
    ? 'meta desta semana batida'
    : `${streak.trained_days} de ${plural(streak.target, 'treino', 'treinos')} nesta semana`;
  return `${run} · ${week}`;
}

export default function GymStreak({ pathname, onBump }) {
  const [streak, setStreak] = useState(() => peekCache('gymStreak') ?? null);
  const [seen, setSeen] = useState(streak);
  const [bump, setBump] = useState(0);

  if (streak !== seen) {
    setSeen(streak);
    if (seen && streak && streak.current > seen.current) setBump(b => b + 1);
  }

  useEffect(() => {
    let alive = true;
    getGymStreak()
      .then(data => { if (alive) setStreak(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  useEffect(() => {
    if (bump) onBump?.();
  }, [bump, onBump]);

  if (!streak) return null;
  const label = describe(streak);

  return (
    <div
      className={`${styles.chip} ${streak.week_done ? styles.lit : ''}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <span key={`fire-${bump}`} className={`${styles.fire} ${bump ? styles.pop : ''}`}>
        <Flame size={18} strokeWidth={2.2} fill={streak.week_done ? 'currentColor' : 'none'} aria-hidden="true" />
      </span>
      <span className={styles.number}>
        <span key={`n-${bump}`} className={bump ? styles.numberIn : ''}>{streak.current}</span>
      </span>
    </div>
  );
}
