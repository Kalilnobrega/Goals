'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { X, Square } from 'lucide-react';
import { getRestTimer, adjustRestTimer, stopRestTimer, subscribeRestTimer } from '../../lib/restTimer';
import { formatClock } from '../../lib/gym';
import useNow from './useNow';
import styles from './RestTimer.module.css';

function Stopwatch({ timer, now }) {
  const elapsed = Math.max(0, Math.floor((now - timer.startedAt) / 1000));

  return (
    <div className={styles.timer} role="timer" aria-live="off">
      <div className={styles.content}>
        <span className={styles.text}>
          <span className={styles.label}>Descanso</span>
          <span className={styles.exercise}>{timer.label}</span>
        </span>
        <span className={styles.clock}>{formatClock(elapsed)}</span>
        <button type="button" className={styles.stop} onClick={stopRestTimer} aria-label="Parar cronômetro">
          <Square size={16} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

export default function RestTimer() {
  const timer = useSyncExternalStore(subscribeRestTimer, getRestTimer, () => null);
  const now = useNow();
  const countdown = !!timer?.endsAt;
  const remaining = countdown && now ? (timer.endsAt - now) / 1000 : null;
  const done = remaining !== null && remaining <= 0;

  useEffect(() => {
    if (!done || !timer) return;
    if (Date.now() - timer.endsAt < 3000) {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {}
    }
    const id = setTimeout(stopRestTimer, 6000);
    return () => clearTimeout(id);
  }, [done, timer]);

  if (!timer || !now) return null;
  if (!countdown) return <Stopwatch timer={timer} now={now} />;

  const progress = done ? 1 : 1 - remaining / timer.total;

  return (
    <div className={`${styles.timer} ${done ? styles.done : ''}`} role="timer" aria-live={done ? 'assertive' : 'off'}>
      <div className={styles.bar} style={{ transform: `scaleX(${progress})` }} />
      <div className={styles.content}>
        <span className={styles.text}>
          <span className={styles.label}>{done ? 'Descanso concluído' : 'Descanso'}</span>
          <span className={styles.exercise}>{timer.label}</span>
        </span>
        {!done && (
          <button type="button" className={styles.adjust} onClick={() => adjustRestTimer(-15)} aria-label="Menos 15 segundos">−15</button>
        )}
        <span className={styles.clock}>{done ? 'Bora!' : formatClock(Math.ceil(remaining))}</span>
        {!done && (
          <button type="button" className={styles.adjust} onClick={() => adjustRestTimer(15)} aria-label="Mais 15 segundos">+15</button>
        )}
        <button type="button" className={styles.close} onClick={stopRestTimer} aria-label="Fechar cronômetro">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
