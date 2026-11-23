'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCloseBodyWeight, getCloseProgress, getCloseStats, getSocialProfile } from '../../../../../lib/api';
import { apiError, formatDay, formatKg, formatVolume } from '../../../../../lib/gym';
import Sparkline from '../../../../../components/gym/Sparkline';
import CloseHeader from '../../../../../components/gym/social/CloseHeader';
import styles from '../../../../../components/gym/social/close.module.css';

const PERIODS = [
  { key: '4w', label: '4 semanas' },
  { key: '3m', label: '3 meses' },
  { key: '6m', label: '6 meses' },
  { key: '1y', label: '1 ano' },
];

export default function CloseProgressPage() {
  const { username } = useParams();
  const [period, setPeriod] = useState('3m');
  const [stats, setStats] = useState(null);
  const [progress, setProgress] = useState(null);
  const [weights, setWeights] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getCloseStats(username, period).then(setStats).catch((err) => setError(apiError(err, 'Não foi possível carregar a evolução.')));
  }, [username, period]);

  useEffect(() => {
    getCloseProgress(username).then(setProgress).catch(() => setProgress([]));
    getSocialProfile(username)
      .then((profile) => (profile.weight_shared ? getCloseBodyWeight(username) : null))
      .then(setWeights)
      .catch(() => setWeights(null));
  }, [username]);

  const summary = stats?.summary;
  const recent = weights ? [...weights].reverse().slice(-30) : [];

  return (
    <div className={styles.page}>
      <CloseHeader username={username} title="Evolução" />
      <div className={styles.chips}>
        {PERIODS.map((item) => (
          <button key={item.key} type="button" className={`${styles.chip} ${period === item.key ? styles.chipActive : ''}`} onClick={() => setPeriod(item.key)}>
            {item.label}
          </button>
        ))}
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {!stats && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando evolução" />}
      {summary && (
        <div className={styles.tiles}>
          <div className={styles.tile}><span className={styles.tileValue}>{summary.sessions}</span><span className={styles.muted}>treinos</span></div>
          <div className={styles.tile}><span className={styles.tileValue}>{formatKg(summary.per_week)}</span><span className={styles.muted}>por semana</span></div>
          <div className={styles.tile}><span className={styles.tileValue}>{summary.avg_minutes} min</span><span className={styles.muted}>duração média</span></div>
          <div className={styles.tile}><span className={styles.tileValue}>{formatVolume(summary.volume_kg)}</span><span className={styles.muted}>volume</span></div>
        </div>
      )}
      {stats && stats.progressions.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Maiores progressões</h2>
          <ul className={styles.rows}>
            {stats.progressions.slice(0, 6).map((item) => (
              <li key={item.exercise_id ?? item.name} className={styles.rowItem}>
                <span className={styles.rowName}>{item.name}</span>
                <span className={styles.rowValue}>{formatKg(item.first_kg)} → {formatKg(item.last_kg)} kg</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {stats && stats.records.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Recordes no período</h2>
          <ul className={styles.rows}>
            {stats.records.slice(0, 8).map((record) => (
              <li key={`${record.name}-${record.date}`} className={styles.rowItem}>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{record.name}</span>
                  <span className={styles.muted}>{formatDay(record.date)}</span>
                </span>
                <span className={styles.rowValue}>{formatKg(record.weight_kg)} kg × {record.reps}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {progress && progress.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Melhor carga por exercício</h2>
          <ul className={styles.rows}>
            {progress.filter((item) => item.best_weight_kg > 0).slice(0, 20).map((item) => (
              <li key={item.exercise_id} className={styles.rowItem}>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{item.name}</span>
                  <span className={styles.muted}>{item.sessions} treinos</span>
                </span>
                <span className={styles.rowValue}>{formatKg(item.best_weight_kg)} kg</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {weights && weights.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Peso corporal</h2>
          <p className={styles.tileValue}>{formatKg(weights[0].weight_kg)} kg <span className={styles.muted}>em {formatDay(weights[0].measured_on)}</span></p>
          {recent.length > 1 && <Sparkline values={recent.map((entry) => entry.weight_kg)} relative className={styles.spark} />}
        </section>
      )}
    </div>
  );
}
