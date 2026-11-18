'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, TrendingUp, Repeat, Timer, Weight } from 'lucide-react';
import { getWorkoutProgress, peekCache } from '../../../../../lib/api';
import {
  formatDuration, formatKg, formatShortDate, formatVolume, muscleLabel, plural,
} from '../../../../../lib/gym';
import ProgressChart from '../../../../../components/gym/ProgressChart';
import styles from '../../progress.module.css';
import own from './workoutProgress.module.css';

const compactKg = (value) => (value >= 10000 ? `${formatKg(Math.round(value / 1000))}k` : formatKg(value));
const minutes = (value) => formatDuration(value * 60000);
const signedPct = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatKg(Math.abs(value))}%`;

const METRICS = [
  { key: 'volume', label: 'Volume', value: s => s.volume_kg, format: formatVolume, axis: compactKg, unit: 'kg', detail: s => plural(s.sets, 'série', 'séries') },
  { key: 'sets', label: 'Séries', value: s => s.sets, format: v => plural(v, 'série', 'séries'), axis: v => String(v), unit: 'séries', detail: s => formatVolume(s.volume_kg) },
  { key: 'minutes', label: 'Duração', value: s => s.minutes, format: minutes, axis: v => `${v}`, unit: 'min', detail: s => plural(s.sets, 'série', 'séries') },
];

function Delta({ value }) {
  if (value === null || value === undefined) return null;
  const tone = value > 0 ? styles.up : value < 0 ? styles.down : '';
  return <span className={`${styles.rowDelta} ${tone}`}>{signedPct(value)}</span>;
}

function lastSet(e) {
  return e.last_weight_kg > 0 ? `${formatKg(e.last_weight_kg)} kg × ${e.last_reps_at_weight}` : `Peso corporal × ${e.last_reps}`;
}

function change(e) {
  if (e.load_change_pct !== null) return e.load_change_pct;
  return e.reps_change_pct;
}

function changeNote(e) {
  if (e.sessions < 2) return 'Primeira vez';
  if (e.load_change_pct !== null) {
    const label = e.metric === 'e1rm' ? '1RM est.' : 'carga';
    return `${label} ${formatKg(e.first_kg)} → ${formatKg(e.last_kg)} kg`;
  }
  return `reps ${e.first_reps} → ${e.last_reps}`;
}

export default function WorkoutProgressPage() {
  const { id } = useParams();
  const [data, setData] = useState(() => peekCache(`fitnessWorkoutProgress:${id}`) ?? null);
  const [status, setStatus] = useState(data ? 'ready' : 'loading');
  const [metricKey, setMetricKey] = useState('volume');

  const load = useCallback(() => {
    getWorkoutProgress(id)
      .then(result => { setData(result); setStatus('ready'); })
      .catch(err => setStatus(err?.response?.status === 404 ? 'missing' : 'error'));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const back = <Link href="/gym/progress/workouts" className={styles.back}><ChevronLeft size={18} /> Fichas</Link>;

  if (status === 'missing' || (status === 'error' && !data)) {
    return (
      <div className={styles.page}>
        {back}
        <div className={styles.state}>
          <p className={styles.stateTitle}>
            {status === 'missing' ? 'Essa ficha não existe ou foi excluída.' : 'Não foi possível carregar a evolução.'}
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

  const { sessions, exercises } = data;
  const metric = METRICS.find(m => m.key === metricKey) ?? METRICS[0];
  const series = sessions.map(s => ({
    key: s.session_id,
    time: new Date(s.completed_at).getTime(),
    value: metric.value(s),
    detail: metric.detail(s),
  }));
  const diff = series.length > 1 ? series.at(-1).value - series[0].value : null;

  const tiles = [
    data.load_pct !== null && { icon: TrendingUp, label: 'Progressão de carga', value: signedPct(data.load_pct), note: 'média dos exercícios' },
    data.reps_pct !== null && { icon: Repeat, label: 'Progressão de reps', value: signedPct(data.reps_pct), note: 'média dos exercícios' },
    data.avg_volume_kg !== null && { icon: Weight, label: 'Volume médio', value: formatVolume(data.avg_volume_kg), note: 'por treino' },
    data.avg_minutes !== null && { icon: Timer, label: 'Duração média', value: minutes(data.avg_minutes), note: 'por treino' },
  ].filter(Boolean);

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        {back}
        <h1 className={styles.detailTitle}>{data.name}</h1>
        <p className={styles.subtitle}>
          {sessions.length ? `${plural(sessions.length, 'treino', 'treinos')} desde ${formatShortDate(sessions[0].completed_at)}` : 'Evolução da ficha'}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Você ainda não treinou essa ficha.</p>
          <p className={styles.stateText}>Quando finalizar um treino com ela, a evolução aparece aqui.</p>
        </div>
      ) : (
        <>
          <section className={styles.panel}>
            <div className={styles.metrics} role="tablist" aria-label="Métrica do gráfico">
              {METRICS.map(m => (
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

            <div className={styles.headline}>
              <span className={styles.headlineValue}>{metric.format(series.at(-1).value)}</span>
              <span className={styles.headlineLabel}>
                {metric.label} no último treino
                {diff !== null && series[0].value > 0 && (
                  <span className={diff > 0 ? styles.up : diff < 0 ? styles.down : ''}>
                    {' · '}{signedPct(Math.round((diff / series[0].value) * 1000) / 10)} desde {formatShortDate(sessions[0].completed_at)}
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

          {tiles.length > 0 && (
            <section className={styles.records} aria-label="Resumo">
              {tiles.map(({ icon: Icon, label, value, note }) => (
                <div key={label} className={styles.record}>
                  <span className={styles.recordLabel}><Icon size={13} aria-hidden="true" /> {label}</span>
                  <span className={styles.recordValue}>{value}</span>
                  <span className={styles.recordNote}>{note}</span>
                </div>
              ))}
            </section>
          )}

          {exercises.length > 0 && (
            <section className={styles.sessions}>
              <h2 className={styles.sectionTitle}>Exercícios</h2>
              <ul className={styles.list}>
                {exercises.map(e => {
                  const content = (
                    <>
                      <span className={styles.rowMain}>
                        <span className={styles.rowName}>{e.name}</span>
                        <span className={styles.rowMeta}>
                          {lastSet(e)} · {changeNote(e)}
                        </span>
                        <span className={styles.rowMeta}>
                          {muscleLabel(e.muscle_group)} · {plural(e.sessions, 'treino', 'treinos')}
                          {!e.in_workout && ' · fora da ficha'}
                        </span>
                      </span>
                      <Delta value={change(e)} />
                      {e.exercise_id && <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />}
                    </>
                  );
                  return (
                    <li key={`${e.exercise_id}-${e.name}`}>
                      {e.exercise_id
                        ? <Link href={`/gym/progress/exercises/${e.exercise_id}`} className={styles.row}>{content}</Link>
                        : <div className={`${styles.row} ${own.static}`}>{content}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className={styles.sessions}>
            <h2 className={styles.sectionTitle}>Treinos</h2>
            <ul className={styles.list}>
              {[...sessions].reverse().map(s => (
                <li key={s.session_id}>
                  <Link href={`/gym/history/${s.session_id}`} className={styles.row}>
                    <span className={styles.rowDate}>{formatShortDate(s.completed_at)}</span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{plural(s.sets, 'série', 'séries')}</span>
                      <span className={styles.rowMeta}>{minutes(s.minutes)}</span>
                    </span>
                    {s.volume_kg > 0 && <span className={styles.rowVolume}>{formatVolume(s.volume_kg)}</span>}
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
