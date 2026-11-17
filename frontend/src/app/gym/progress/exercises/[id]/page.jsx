'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { getExerciseProgress, peekCache } from '../../../../../lib/api';
import {
  equipmentLabel, formatDelta, formatKg, formatShortDate, formatVolume, muscleLabel, plural,
} from '../../../../../lib/gym';
import ProgressChart from '../../../../../components/gym/ProgressChart';
import styles from '../../progress.module.css';

const kg = (value) => `${formatKg(value)} kg`;
const compactKg = (value) => (value >= 10000 ? `${formatKg(Math.round(value / 1000))}k` : formatKg(value));

const METRICS = [
  {
    key: 'weight',
    label: 'Carga máxima',
    value: p => p.max_weight_kg,
    has: points => points.some(p => p.max_weight_kg > 0),
    format: kg,
    axis: formatKg,
    detail: p => `${plural(p.reps_at_max, 'repetição', 'repetições')}`,
    unit: 'kg',
  },
  {
    key: 'oneRm',
    label: '1RM estimado',
    value: p => p.estimated_1rm_kg,
    has: points => points.some(p => p.estimated_1rm_kg !== null),
    format: kg,
    axis: formatKg,
    detail: () => 'Fórmula de Epley',
    unit: 'kg',
  },
  {
    key: 'volume',
    label: 'Volume',
    value: p => p.volume_kg,
    has: points => points.some(p => p.volume_kg > 0),
    format: formatVolume,
    axis: compactKg,
    detail: p => plural(p.sets, 'série', 'séries'),
    unit: 'kg',
  },
  {
    key: 'reps',
    label: 'Repetições',
    value: p => p.max_reps,
    has: () => true,
    format: v => plural(v, 'rep', 'reps'),
    axis: v => String(v),
    detail: () => 'Máximo em uma série',
    unit: 'reps',
  },
];

function bestOf(points, pick) {
  return points.reduce((best, p) => {
    const value = pick(p);
    return value !== null && (!best || value > pick(best)) ? p : best;
  }, null);
}

const bestSet = (p) => (p.max_weight_kg > 0 ? `${kg(p.max_weight_kg)} × ${p.reps_at_max}` : `Peso corporal × ${p.max_reps}`);

export default function ExerciseProgressPage() {
  const { id } = useParams();
  const [data, setData] = useState(() => peekCache(`fitnessProgress:${id}`) ?? null);
  const [status, setStatus] = useState(data ? 'ready' : 'loading');
  const [metricKey, setMetricKey] = useState(null);

  const load = useCallback(() => {
    getExerciseProgress(id)
      .then(result => { setData(result); setStatus('ready'); })
      .catch(err => setStatus(err?.response?.status === 404 ? 'missing' : 'error'));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const back = <Link href="/gym/progress/exercises" className={styles.back}><ChevronLeft size={18} /> Exercícios</Link>;

  if (status === 'missing' || (status === 'error' && !data)) {
    return (
      <div className={styles.page}>
        {back}
        <div className={styles.state}>
          <p className={styles.stateTitle}>
            {status === 'missing' ? 'Esse exercício não existe ou foi excluído.' : 'Não foi possível carregar a evolução.'}
          </p>
          {status === 'error' && <button type="button" className={styles.stateAction} onClick={load}>Tentar de novo</button>}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Carregando evolução">
        {back}
        <div className={styles.skeleton} />
        <div className={styles.skeletonTall} />
      </div>
    );
  }

  const { points } = data;
  const metrics = METRICS.filter(m => m.has(points));
  const metric = metrics.find(m => m.key === metricKey) ?? metrics[0];
  const series = points
    .filter(p => metric.value(p) !== null)
    .map(p => ({
      key: p.session_id,
      time: new Date(p.completed_at).getTime(),
      value: metric.value(p),
      detail: metric.detail(p),
    }));
  const change = series.length > 1 ? series.at(-1).value - series[0].value : null;

  const heaviest = bestOf(points, p => (p.max_weight_kg > 0 ? p.max_weight_kg : null));
  const strongest = bestOf(points, p => p.estimated_1rm_kg);
  const biggest = bestOf(points, p => (p.volume_kg > 0 ? p.volume_kg : null));
  const mostReps = bestOf(points, p => p.max_reps);

  const records = [
    heaviest && { label: 'Melhor carga', value: kg(heaviest.max_weight_kg), note: `× ${heaviest.reps_at_max} · ${formatShortDate(heaviest.completed_at)}` },
    strongest && { label: '1RM estimado', value: kg(strongest.estimated_1rm_kg), note: formatShortDate(strongest.completed_at) },
    biggest && { label: 'Maior volume', value: formatVolume(biggest.volume_kg), note: formatShortDate(biggest.completed_at) },
    !heaviest && mostReps && { label: 'Mais repetições', value: plural(mostReps.max_reps, 'rep', 'reps'), note: formatShortDate(mostReps.completed_at) },
  ].filter(Boolean);

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        {back}
        <h1 className={styles.detailTitle}>{data.name}</h1>
        <p className={styles.subtitle}>
          {muscleLabel(data.muscle_group)} · {equipmentLabel(data.equipment)}
          {points.length ? ` · ${plural(points.length, 'treino', 'treinos')}` : ''}
        </p>
      </div>

      {points.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Você ainda não treinou esse exercício.</p>
          <p className={styles.stateText}>Quando finalizar um treino com ele, a evolução aparece aqui.</p>
        </div>
      ) : (
        <>
          <section className={styles.panel}>
            {metrics.length > 1 && (
              <div className={styles.metrics} role="tablist" aria-label="Métrica do gráfico">
                {metrics.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={m === metric}
                    className={`${styles.metric} ${m === metric ? styles.metricActive : ''}`}
                    onClick={() => setMetricKey(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.headline}>
              <span className={styles.headlineValue}>{metric.format(series.at(-1).value)}</span>
              <span className={styles.headlineLabel}>
                {metric.label} no último treino
                {change !== null && (
                  <span className={change > 0 ? styles.up : change < 0 ? styles.down : ''}>
                    {' · '}{formatDelta(change, metric.unit)} desde {formatShortDate(points.find(p => metric.value(p) !== null).completed_at)}
                  </span>
                )}
              </span>
            </div>

            <ProgressChart
              key={metric.key}
              points={series}
              format={metric.format}
              axisFormat={metric.axis}
              label={`${metric.label} de ${data.name} por treino`}
            />
          </section>

          <section className={styles.records} aria-label="Recordes">
            {records.map(record => (
              <div key={record.label} className={styles.record}>
                <span className={styles.recordLabel}><Trophy size={13} aria-hidden="true" /> {record.label}</span>
                <span className={styles.recordValue}>{record.value}</span>
                <span className={styles.recordNote}>{record.note}</span>
              </div>
            ))}
          </section>

          <section className={styles.sessions}>
            <h2 className={styles.sectionTitle}>Treinos</h2>
            <ul className={styles.list}>
              {[...points].reverse().map(p => (
                <li key={p.session_id}>
                  <Link href={`/gym/history/${p.session_id}`} className={styles.row}>
                    <span className={styles.rowDate}>{formatShortDate(p.completed_at)}</span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{bestSet(p)}</span>
                      <span className={styles.rowMeta}>{p.session_name} · {plural(p.sets, 'série', 'séries')}</span>
                    </span>
                    {p.volume_kg > 0 && <span className={styles.rowVolume}>{formatVolume(p.volume_kg)}</span>}
                    <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
