'use client';
import { useState } from 'react';
import { Check, Target } from 'lucide-react';
import { muscleLabel, plural } from '../../lib/gym';
import styles from './MusclesWeek.module.css';

const VISIBLE = 6;

function since(days) {
  if (days === null) return 'nunca';
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

export default function MusclesWeek({ muscles, hasPlan }) {
  const [expanded, setExpanded] = useState(false);
  if (!muscles.length) return null;

  const maxDone = Math.max(...muscles.map(m => m.done_sets), 1);
  const visible = expanded ? muscles : muscles.slice(0, VISIBLE);
  const planned = muscles.filter(m => m.planned_sets);
  const completed = planned.filter(m => m.done_sets >= m.planned_sets).length;

  return (
    <section className={styles.card} aria-labelledby="muscles-week-title">
      <div className={styles.header}>
        <Target size={16} className={styles.icon} aria-hidden="true" />
        <h2 id="muscles-week-title" className={styles.title}>Músculos da semana</h2>
        {hasPlan && planned.length > 0 && (
          <span className={styles.hint}>{completed} de {planned.length} no alvo</span>
        )}
      </div>

      <ul className={styles.list}>
        {visible.map(m => {
          const target = m.planned_sets;
          const done = m.done_sets;
          const complete = !!target && done >= target;
          const width = target ? Math.min(done / target, 1) : done / maxDone;
          const stale = m.days_since === null || m.days_since >= 7;
          return (
            <li
              key={m.muscle_group}
              className={styles.row}
              aria-label={`${muscleLabel(m.muscle_group)}: ${target ? `${done} de ${target} séries planejadas` : plural(done, 'série', 'séries')} nesta semana, treinado ${since(m.days_since)}`}
            >
              <div className={styles.top} aria-hidden="true">
                <span className={styles.name}>{muscleLabel(m.muscle_group)}</span>
                <span className={`${styles.count} ${complete ? styles.countDone : ''}`}>
                  {complete && <Check size={13} strokeWidth={3} />}
                  {target ? `${done}/${target}` : done ? plural(done, 'série', 'séries') : '—'}
                </span>
                <span className={`${styles.since} ${stale ? styles.sinceStale : ''}`}>{since(m.days_since)}</span>
              </div>
              <span className={styles.track} aria-hidden="true">
                <span className={`${styles.fill} ${complete ? styles.fillDone : ''} ${!target ? styles.fillFree : ''}`} style={{ width: `${width * 100}%` }} />
              </span>
              {hasPlan && !target && done > 0 && <span className={styles.note} aria-hidden="true">fora do plano</span>}
            </li>
          );
        })}
      </ul>

      {muscles.length > VISIBLE && (
        <button type="button" className={styles.more} onClick={() => setExpanded(open => !open)} aria-expanded={expanded}>
          {expanded ? 'Mostrar menos' : `Ver todos os ${muscles.length} grupos`}
        </button>
      )}
    </section>
  );
}
