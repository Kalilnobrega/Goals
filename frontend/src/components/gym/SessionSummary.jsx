import { formatDuration, formatKg, formatLongDate, formatTime, formatVolume, muscleLabel, plural } from '../../lib/gym';
import styles from './SessionSummary.module.css';

export default function SessionSummary({ session }) {
  const done = session.exercises.filter(item => item.sets.length > 0);
  const duration = new Date(session.completed_at) - new Date(session.started_at);

  return (
    <div className={styles.summary}>
      <p className={styles.date}>
        {formatLongDate(session.started_at)} · {formatTime(session.started_at)}–{formatTime(session.completed_at)}
      </p>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatDuration(duration)}</span>
          <span className={styles.statLabel}>Duração</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{done.length}</span>
          <span className={styles.statLabel}>{done.length === 1 ? 'Exercício' : 'Exercícios'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{session.total_sets}</span>
          <span className={styles.statLabel}>{session.total_sets === 1 ? 'Série' : 'Séries'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatVolume(session.volume_kg)}</span>
          <span className={styles.statLabel}>Volume</span>
        </div>
      </div>

      <ul className={styles.list}>
        {done.map(item => (
          <li key={item.id} className={styles.item}>
            <div className={styles.itemHeader}>
              <span className={styles.itemName}>{item.exercise_name}</span>
              <span className={styles.itemMeta}>{muscleLabel(item.muscle_group)} · {plural(item.sets.length, 'série', 'séries')}</span>
            </div>
            <div className={styles.sets}>
              {item.sets.map(entry => (
                <span key={entry.id} className={styles.set}>
                  {entry.weight_kg > 0 ? `${formatKg(entry.weight_kg)} kg` : 'Peso corporal'} × {entry.reps}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
