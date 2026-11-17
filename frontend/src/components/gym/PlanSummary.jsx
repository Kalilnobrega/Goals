import { muscleLabel, plural } from '../../lib/gym';
import styles from './PlanSummary.module.css';

const LOW = 10;
const HIGH = 20;

const BANDS = [
  { key: 'low', label: 'Volume baixo', short: 'Baixo' },
  { key: 'medium', label: 'Volume médio', short: 'Médio' },
  { key: 'high', label: 'Volume alto', short: 'Alto' },
];

const bandOf = (sets) => (sets < LOW ? BANDS[0] : sets <= HIGH ? BANDS[1] : BANDS[2]);

export function summarizePlan(week, byId) {
  const fichas = new Map();
  const muscles = new Map();
  let totalSets = 0;
  week.forEach(ids => ids.forEach(id => {
    const workout = byId.get(id);
    if (!workout) return;
    const setsPerSession = workout.exercises.reduce((sum, item) => sum + item.target_sets, 0);
    const entry = fichas.get(id) ?? { id, name: workout.name, times: 0, setsPerSession };
    entry.times += 1;
    fichas.set(id, entry);
    totalSets += setsPerSession;
    workout.exercises.forEach(item => {
      const group = item.exercise.muscle_group;
      muscles.set(group, (muscles.get(group) ?? 0) + item.target_sets);
    });
  }));
  return {
    days: week.filter(ids => ids.some(id => byId.has(id))).length,
    totalSets,
    fichas: [...fichas.values()].sort((a, b) => b.times * b.setsPerSession - a.times * a.setsPerSession),
    muscles: [...muscles.entries()].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets),
  };
}

export default function PlanSummary({ summary, bare = false }) {
  if (!summary.fichas.length) return null;
  const max = Math.max(...summary.muscles.map(m => m.sets), HIGH + 6);

  return (
    <section className={`${styles.summary} ${bare ? styles.bare : ''}`} aria-labelledby="plan-summary-title">
      <h2 id="plan-summary-title" className={styles.title}>Resumo da semana</h2>

      <div className={styles.totals}>
        <div className={styles.total}>
          <span className={styles.totalValue}>{summary.days}</span>
          <span className={styles.totalLabel}>{summary.days === 1 ? 'Dia de treino' : 'Dias de treino'}</span>
        </div>
        <div className={styles.total}>
          <span className={styles.totalValue}>{summary.totalSets}</span>
          <span className={styles.totalLabel}>Séries na semana</span>
        </div>
        <div className={styles.total}>
          <span className={styles.totalValue}>{summary.fichas.length}</span>
          <span className={styles.totalLabel}>{summary.fichas.length === 1 ? 'Ficha' : 'Fichas'}</span>
        </div>
      </div>

      <h3 className={styles.subTitle}>Séries por ficha</h3>
      <ul className={styles.fichas}>
        {summary.fichas.map(ficha => (
          <li key={ficha.id} className={styles.ficha}>
            <span className={styles.fichaMain}>
              <span className={styles.fichaName}>{ficha.name}</span>
              <span className={styles.fichaMeta}>
                {ficha.times}× na semana · {plural(ficha.setsPerSession, 'série', 'séries')} por treino
              </span>
            </span>
            <span className={styles.fichaTotal}>{ficha.times * ficha.setsPerSession}</span>
          </li>
        ))}
      </ul>

      <h3 className={styles.subTitle}>Séries por grupo muscular</h3>
      <ul className={styles.legend} aria-label="Faixas de volume semanal">
        {BANDS.map(band => (
          <li key={band.key} className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles[band.key]}`} aria-hidden="true" />
            <span>{band.label}</span>
          </li>
        ))}
      </ul>
      <ul className={styles.muscles}>
        {summary.muscles.map(({ group, sets }) => {
          const band = bandOf(sets);
          return (
            <li key={group} className={styles.muscle} aria-label={`${muscleLabel(group)}: ${plural(sets, 'série', 'séries')}, ${band.label.toLowerCase()}`}>
              <span className={styles.muscleTop} aria-hidden="true">
                <span className={styles.muscleName}>{muscleLabel(group)}</span>
                <span className={styles.muscleValue}>{sets}</span>
                <span className={`${styles.tag} ${styles[`tag_${band.key}`]}`}>{band.short}</span>
              </span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.zoneMedium} style={{ left: `${((LOW - 0.5) / max) * 100}%`, width: `${((HIGH - LOW + 1) / max) * 100}%` }} />
                <span className={`${styles.fill} ${styles[band.key]}`} style={{ width: `${(sets / max) * 100}%` }} />
                <span className={styles.rangeMark} style={{ left: `${((LOW - 0.5) / max) * 100}%` }} />
                <span className={styles.rangeMark} style={{ left: `${((HIGH + 0.5) / max) * 100}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
