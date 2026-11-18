'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { getProgressWorkouts, peekCache } from '../../../../lib/api';
import { formatDay, formatKg, formatVolume, plural } from '../../../../lib/gym';
import styles from '../progress.module.css';

const signedPct = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatKg(Math.abs(value))}%`;

export default function WorkoutsProgressPage() {
  const [items, setItems] = useState(() => peekCache('fitnessProgressWorkouts') ?? null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    return getProgressWorkouts().then(setItems).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getProgressWorkouts().then(setItems).catch(() => setLoadError(true));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/gym/progress" className={styles.back}><ChevronLeft size={18} /> Evolução</Link>
        <h1 className={styles.detailTitle}>Fichas</h1>
        <p className={styles.subtitle}>Como cada ficha evolui de um treino para o outro</p>
      </div>

      {loadError && !items && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Não foi possível carregar suas fichas.</p>
          <button type="button" className={styles.stateAction} onClick={load}>Tentar de novo</button>
        </div>
      )}

      {!items && !loadError && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando fichas">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
      )}

      {items?.length === 0 && (
        <div className={styles.state}>
          <ClipboardList size={34} className={styles.stateIcon} aria-hidden="true" />
          <p className={styles.stateTitle}>Nenhuma ficha treinada ainda.</p>
          <p className={styles.stateText}>Finalize um treino a partir de uma ficha e a evolução dela aparece aqui.</p>
        </div>
      )}

      {items?.length > 0 && (
        <ul className={styles.list}>
          {items.map(item => (
            <li key={item.workout_id}>
              <Link href={`/gym/progress/workouts/${item.workout_id}`} className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{item.name}</span>
                  <span className={styles.rowMeta}>
                    {plural(item.sessions, 'treino', 'treinos')} · último {formatDay(item.last_done_on)}
                  </span>
                  <span className={styles.rowMeta}>{formatVolume(item.avg_volume_kg)} por treino</span>
                </span>
                {item.progress_pct !== null && (
                  <span className={`${styles.rowDelta} ${item.progress_pct > 0 ? styles.up : item.progress_pct < 0 ? styles.down : ''}`}>
                    {signedPct(item.progress_pct)}
                  </span>
                )}
                <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
