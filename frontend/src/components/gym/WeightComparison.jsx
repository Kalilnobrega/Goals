'use client';
import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { getWeightComparison, peekCache } from '../../lib/api';
import { formatDay, formatDelta, formatKg, formatVolume, parseDay, plural } from '../../lib/gym';
import BarChart from './BarChart';
import ProgressChart from './ProgressChart';
import LimitedList from './LimitedList';
import styles from '../../app/gym/progress/stats.module.css';
import own from './WeightComparison.module.css';

const PERIODS = [
  { key: '3m', label: '3 meses' },
  { key: '6m', label: '6 meses' },
  { key: '1y', label: '1 ano' },
  { key: 'all', label: 'Tudo' },
];

const ACTIVITY = [
  { key: 'sessions', label: 'Treinos', format: v => plural(v, 'treino', 'treinos'), axis: v => String(v) },
  { key: 'sets', label: 'Séries', format: v => plural(v, 'série', 'séries'), axis: v => String(v) },
  { key: 'volume_kg', label: 'Volume', format: formatVolume, axis: v => (v >= 1000 ? `${formatKg(Math.round(v / 100) / 10)}t` : formatKg(v)) },
  { key: 'cardio_minutes', label: 'Cardio', format: v => `${v} min`, axis: v => String(v) },
  { key: 'cardio_calories', label: 'Calorias', format: v => `≈ ${v.toLocaleString('pt-BR')} kcal`, axis: v => String(v) },
];

const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const kg = (value) => `${formatKg(value)} kg`;

export default function WeightComparison({ refreshKey }) {
  const [period, setPeriod] = useState('3m');
  const [data, setData] = useState(() => peekCache('fitnessWeightComparison:3m') ?? null);
  const [metricKey, setMetricKey] = useState('sessions');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let current = true;
    getWeightComparison(period)
      .then(result => { if (current) { setData(result); setLoadError(false); } })
      .catch(() => { if (current) setLoadError(true); });
    return () => { current = false; };
  }, [period, refreshKey]);

  const ready = data?.period === period ? data : null;
  const weights = (ready?.weeks ?? []).filter(week => week.weight_kg !== null);
  const metrics = ACTIVITY.filter(m => m.key === 'sessions' || (ready?.weeks ?? []).some(week => week[m.key] > 0));
  const metric = metrics.find(m => m.key === metricKey) ?? metrics[0];

  return (
    <section className={styles.card} aria-labelledby="weight-comparison-title">
      <div className={styles.cardHeader}>
        <Scale size={16} className={styles.cardIcon} aria-hidden="true" />
        <h2 id="weight-comparison-title" className={styles.cardTitle}>Peso × treino</h2>
      </div>

      <div className={styles.chips} role="tablist" aria-label="Período">
        {PERIODS.map(p => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === period}
            className={`${styles.chip} ${p.key === period ? styles.chipActive : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!ready && !loadError && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando comparação" />}
      {!ready && loadError && <p className={styles.empty}>Não foi possível carregar a comparação.</p>}

      {ready && ready.weighings < 2 && (
        <p className={styles.empty}>Registre pelo menos duas pesagens neste período para comparar o peso com seus treinos.</p>
      )}

      {ready && ready.weighings >= 2 && (
        <>
          <div className={own.block}>
            <h3 className={own.blockTitle}>Peso médio por semana</h3>
            <ProgressChart
              key={`weight-${period}`}
              points={weights.map(week => ({
                key: week.start,
                time: parseDay(week.start).getTime(),
                value: week.weight_kg,
                detail: `Semana de ${formatDay(week.start)} · ${plural(week.sessions, 'treino', 'treinos')}${week.cardio_minutes ? ` · ${week.cardio_minutes} min de cardio` : ''}`,
              }))}
              format={kg}
              axisFormat={formatKg}
              label="Peso médio por semana"
            />
          </div>

          <div className={own.block}>
            <h3 className={own.blockTitle}>Atividade nas mesmas semanas</h3>
            {metrics.length > 1 && (
              <div className={styles.chips} role="tablist" aria-label="Atividade">
                {metrics.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={m === metric}
                    className={`${styles.chip} ${m === metric ? styles.chipActive : ''}`}
                    onClick={() => setMetricKey(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            <BarChart
              key={`${metric.key}-${period}`}
              bars={ready.weeks.map(week => ({
                key: week.start,
                label: formatDay(week.start),
                value: week[metric.key],
                detail: `Semana de ${formatDay(week.start)}${week.weight_kg !== null ? ` · peso ${kg(week.weight_kg)}` : ''}`,
              }))}
              format={metric.format}
              axisFormat={metric.axis}
              label={`${metric.label} por semana`}
            />
          </div>

          <div className={own.block}>
            <h3 className={own.blockTitle}>Mês a mês</h3>
            <LimitedList className={styles.rows} items={ready.months} render={month => (
              <li key={month.start} className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{monthLabel.format(parseDay(month.start)).replace(/^./, c => c.toUpperCase())}</span>
                  <span className={styles.rowMeta}>
                    {[
                      plural(month.sessions, 'treino', 'treinos'),
                      month.cardio_minutes ? `${month.cardio_minutes} min de cardio` : null,
                      month.cardio_calories ? `≈ ${month.cardio_calories.toLocaleString('pt-BR')} kcal` : null,
                      month.weighings ? plural(month.weighings, 'pesagem', 'pesagens') : 'sem pesagem',
                    ].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={own.change}>
                  {month.change_kg !== null ? formatDelta(month.change_kg) : month.last_kg !== null ? kg(month.last_kg) : '—'}
                </span>
              </li>
            )} />
          </div>

          <p className={own.note}>É uma comparação, não causa e efeito: o peso depende muito da alimentação, e as calorias do cardio são estimativas.</p>
        </>
      )}
    </section>
  );
}
