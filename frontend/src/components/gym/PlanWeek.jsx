import Link from 'next/link';
import { Moon } from 'lucide-react';
import { WEEKDAY_NAMES } from '../../lib/gym';
import styles from './PlanWeek.module.css';

const LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export default function PlanWeek({ week, linkDays = false }) {
  return (
    <ol className={styles.week} aria-label="Semana do plano">
      {week.map((workouts, weekday) => {
        const rest = workouts.length === 0;
        const names = workouts.map(w => w.name).join(' + ');
        const label = `${WEEKDAY_NAMES[weekday]}: ${rest ? 'descanso' : names}`;
        const content = (
          <>
            <span className={styles.letter} aria-hidden="true">{LETTERS[weekday]}</span>
            <span className={`${styles.dot} ${rest ? styles.dotRest : styles.dotTraining}`} aria-hidden="true">
              {rest && <Moon size={14} />}
            </span>
            <span className={`${styles.name} ${rest ? styles.nameRest : ''}`} aria-hidden="true">
              {rest ? 'Descanso' : names}
            </span>
          </>
        );
        return (
          <li key={WEEKDAY_NAMES[weekday]} className={styles.day}>
            {linkDays && !rest && workouts.length === 1 ? (
              <Link href={`/gym/workouts/${workouts[0].id}`} className={`${styles.inner} ${styles.link}`} aria-label={`${label}. Abrir ficha`}>
                {content}
              </Link>
            ) : (
              <div className={styles.inner} role="img" aria-label={label}>{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
