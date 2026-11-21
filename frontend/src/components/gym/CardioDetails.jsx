'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, CalendarCheck, HeartPulse, Medal, Repeat } from 'lucide-react';
import { getFitnessStats, peekCache } from '../../lib/api';
import { formatDay, formatKg, parseDay, plural } from '../../lib/gym';
import BarChart from './BarChart';
import LimitedList from './LimitedList';
import styles from '../../app/gym/progress/stats.module.css';
import own from './CardioDetails.module.css';

const PERIODS = [
  { key: '4w', label: '4 semanas' },
  { key: '3m', label: '3 meses' },
  { key: '6m', label: '6 meses' },
  { key: '1y', label: '1 ano' },
  { key: 'all', label: 'Tudo' },
];

const PHASE_LABEL = { start: 'Cardio no início', end: 'Cardio no final' };
const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const minutesLabel = (value) => `${value.toLocaleString('pt-BR')} min`;
const kmLabel = (value) => `${formatKg(Math.round(value * 10) / 10)} km`;
const kcalLabel = (value) => `${value.toLocaleString('pt-BR')} kcal`;
const paceLabel = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} /km`;

const TIMELINE_METRICS = [
  { key: 'minutes', label: 'Minutos', format: minutesLabel, axis: v => `${v}` },
  { key: 'km', label: 'Km', format: kmLabel, axis: v => formatKg(v) },
  { key: 'calories', label: 'Calorias', format: kcalLabel, axis: v => `${v}` },
];

function Card({ icon: Icon, title, hint, children }) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <Icon size={16} className={styles.cardIcon} aria-hidden="true" />
        <h2 className={styles.cardTitle}>{title}</h2>
        {hint && <span className={styles.cardHint}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function change(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Delta({ value }) {
  if (value === null || value === undefined) return null;
  const tone = value > 0 ? styles.up : value < 0 ? styles.down : styles.flat;
  return <span className={`${styles.delta} ${tone}`}>{value > 0 ? '+' : value < 0 ? '−' : ''}{Math.abs(value)}%</span>;
}

function Summary({ cardio }) {
  const tiles = [
    { label: 'Tempo de cardio', value: minutesLabel(cardio.minutes), delta: change(cardio.minutes, cardio.previous_minutes) },
    { label: 'Treinos com cardio', value: cardio.sessions },
    { label: 'Média por treino', value: cardio.sessions ? minutesLabel(cardio.avg_minutes) : '—' },
    cardio.distance_km > 0 && { label: cardio.km_estimated ? 'Distância (estimada)' : 'Distância', value: `${cardio.km_estimated ? '≈ ' : ''}${kmLabel(cardio.distance_km)}` },
    cardio.calories !== null && { label: cardio.calories_estimated ? 'Calorias (estimativa)' : 'Calorias', value: `${cardio.calories_estimated ? '≈ ' : ''}${kcalLabel(cardio.calories)}` },
    cardio.avg_calories !== null && { label: 'Calorias por treino', value: `${cardio.calories_estimated ? '≈ ' : ''}${kcalLabel(cardio.avg_calories)}` },
    cardio.avg_speed_kmh && { label: 'Velocidade média', value: `${formatKg(cardio.avg_speed_kmh)} km/h` },
    cardio.pace_seconds_per_km && { label: 'Ritmo médio', value: paceLabel(cardio.pace_seconds_per_km) },
  ].filter(Boolean);
  return (
    <section className={styles.kpis} aria-label="Resumo do cardio">
      {tiles.map(tile => (
        <div key={tile.label} className={styles.kpi}>
          <span className={styles.kpiValue}>{tile.value}</span>
          <span className={styles.kpiLabel}>{tile.label}</span>
          <Delta value={tile.delta} />
        </div>
      ))}
    </section>
  );
}

function Timeline({ cardio, monthly }) {
  const [metricKey, setMetricKey] = useState('minutes');
  if (!cardio.timeline.length) return null;
  const metrics = TIMELINE_METRICS.filter(m => m.key === 'minutes' || cardio.timeline.some(bucket => bucket[m.key] > 0));
  const metric = metrics.find(m => m.key === metricKey) ?? metrics[0];
  const bars = cardio.timeline.map(bucket => {
    const start = parseDay(bucket.start);
    return {
      key: bucket.start,
      label: monthly ? monthLabel.format(start).replace('.', '') : formatDay(bucket.start),
      value: bucket[metric.key] ?? 0,
      detail: `${monthly ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(start) : `Semana de ${formatDay(bucket.start)}`} · ${plural(bucket.sessions, 'treino', 'treinos')}`,
    };
  });
  return (
    <Card icon={BarChart3} title="Evolução do cardio" hint={monthly ? 'por mês' : 'por semana'}>
      {metrics.length > 1 && (
        <div className={styles.chips} role="tablist" aria-label="Métrica">
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
      <BarChart key={metric.key} bars={bars} format={metric.format} axisFormat={metric.axis} label={`${metric.label} de cardio ${monthly ? 'por mês' : 'por semana'}`} />
      {metric.key === 'calories' && cardio.calories_estimated && <p className={styles.empty}>Calorias estimadas pelo tempo, aparelho e seu peso, ou o valor do aparelho quando você registra.</p>}
    </Card>
  );
}

function Plan({ plan }) {
  if (!plan) return null;
  const pct = plan.completion_pct ?? 0;
  const lines = [
    { label: 'Feitos', value: `${plan.done} de ${plan.planned}` },
    { label: 'Pulados', value: plan.skipped, tone: plan.skipped ? own.bad : null },
    { label: 'Abaixo da meta', value: plan.short },
    { label: 'Acima da meta', value: plan.over },
  ];
  return (
    <Card icon={CalendarCheck} title="Planejado × feito" hint="cardios das fichas">
      <div className={own.completion}>
        <span className={own.completionValue}>{formatKg(pct)}%</span>
        <span className={own.completionLabel}>do tempo planejado · {plan.done_minutes} de {plan.planned_minutes} min</span>
        <span className={own.track} aria-hidden="true"><span className={own.fill} style={{ width: `${Math.min(pct, 100)}%` }} /></span>
      </div>
      <div className={own.lines}>
        {lines.map(line => (
          <div key={line.label} className={own.line}>
            <span className={`${own.lineValue} ${line.tone ?? ''}`}>{line.value}</span>
            <span className={own.lineLabel}>{line.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Phases({ phases }) {
  if (!phases.length) return null;
  return (
    <Card icon={Repeat} title="Início × final">
      <ul className={styles.rows}>
        {phases.map(phase => (
          <li key={phase.phase} className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowName}>{PHASE_LABEL[phase.phase]}</span>
              <span className={styles.rowMeta}>
                {plural(phase.sessions, 'treino', 'treinos')}
                {phase.planned ? ` · pulado ${plural(phase.skipped, 'vez', 'vezes')} de ${phase.planned}` : ''}
              </span>
            </span>
            <span className={styles.strengthValue}>{minutesLabel(phase.minutes)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Devices({ cardio }) {
  const exercises = cardio.exercises;
  if (!exercises.length) return null;
  return (
    <Card icon={HeartPulse} title="Aparelhos">
      <LimitedList className={styles.rows} items={exercises} render={e => {
          const content = (
            <>
              <span className={styles.rowMain}>
                <span className={styles.rowName}>{e.name}</span>
                <span className={styles.rowMeta}>
                  {[
                    plural(e.sessions, 'treino', 'treinos'),
                    e.distance_km > 0 ? kmLabel(e.distance_km) : null,
                    e.avg_speed_kmh ? `${formatKg(e.avg_speed_kmh)} km/h` : null,
                    e.calories ? `${e.calories_estimated ? '≈ ' : ''}${kcalLabel(e.calories)}` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={styles.strengthValue}>{minutesLabel(e.minutes)}</span>
            </>
          );
          return (
            <li key={`${e.exercise_id}-${e.name}`}>
              {e.exercise_id
                ? <Link href={`/gym/progress/exercises/${e.exercise_id}`} className={styles.row}>{content}</Link>
                : <div className={styles.row}>{content}</div>}
            </li>
          );
        }} />
    </Card>
  );
}

function Records({ cardio }) {
  if (!cardio.longest && !cardio.best_week && !cardio.farthest && !cardio.fastest) return null;
  return (
    <Card icon={Medal} title="Recordes de cardio">
      <div className={styles.records}>
        {cardio.longest && (
          <Link href={`/gym/history/${cardio.longest.session_id}`} className={styles.record}>
            <span className={styles.recordLabel}>Mais cardio num treino</span>
            <span className={styles.recordValue}>{minutesLabel(cardio.longest.minutes)}</span>
            <span className={styles.recordNote}>{cardio.longest.name} · {formatDay(cardio.longest.date)}</span>
          </Link>
        )}
        {cardio.farthest && (
          <Link href={`/gym/history/${cardio.farthest.session_id}`} className={styles.record}>
            <span className={styles.recordLabel}>Maior distância</span>
            <span className={styles.recordValue}>{kmLabel(cardio.farthest.km)}</span>
            <span className={styles.recordNote}>{cardio.farthest.name} · {formatDay(cardio.farthest.date)}</span>
          </Link>
        )}
        {cardio.fastest && (
          <Link href={`/gym/history/${cardio.fastest.session_id}`} className={styles.record}>
            <span className={styles.recordLabel}>Maior velocidade</span>
            <span className={styles.recordValue}>{formatKg(cardio.fastest.kmh)} km/h</span>
            <span className={styles.recordNote}>{cardio.fastest.name} · {formatDay(cardio.fastest.date)}</span>
          </Link>
        )}
        {cardio.best_week && (
          <div className={`${styles.record} ${styles.recordStatic}`}>
            <span className={styles.recordLabel}>Melhor semana</span>
            <span className={styles.recordValue}>{minutesLabel(cardio.best_week.minutes)}</span>
            <span className={styles.recordNote}>Semana de {formatDay(cardio.best_week.date)}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function CardioDetails() {
  const [period, setPeriod] = useState('3m');
  const [data, setData] = useState(() => peekCache('fitnessStats:3m:all') ?? null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let current = true;
    getFitnessStats(period)
      .then(result => { if (current) setData(result); })
      .catch(() => { if (current) setLoadError(true); });
    return () => { current = false; };
  }, [period]);

  const choose = (key) => {
    setLoadError(false);
    setData(peekCache(`fitnessStats:${key}:all`) ?? null);
    setPeriod(key);
  };

  const retry = () => {
    setLoadError(false);
    getFitnessStats(period).then(setData).catch(() => setLoadError(true));
  };

  const ready = data?.period === period && !data?.plan_id ? data : null;
  const cardio = ready?.cardio;

  return (
    <div className={own.details}>
      <div className={styles.periods} role="tablist" aria-label="Período">
        {PERIODS.map(p => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === period}
            className={`${styles.chip} ${p.key === period ? styles.chipActive : ''}`}
            onClick={() => choose(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loadError && !ready && (
        <div className={styles.state}>
          <p>Não foi possível carregar o cardio.</p>
          <button type="button" className={styles.stateAction} onClick={retry}>Tentar de novo</button>
        </div>
      )}

      {!ready && !loadError && (
        <div className={styles.skeletons} aria-busy="true" aria-label="Carregando cardio">
          <div className={styles.skeletonKpis} />
          <div className={styles.skeleton} />
        </div>
      )}

      {ready && !cardio && (
        <div className={styles.state}>
          <HeartPulse size={34} className={styles.stateIcon} aria-hidden="true" />
          <p>Nenhum cardio neste período.</p>
        </div>
      )}

      {cardio && (
        <>
          <Summary cardio={cardio} />
          <Timeline cardio={cardio} monthly={ready.bucket === 'month'} />
          <Plan plan={cardio.plan} />
          <Phases phases={cardio.phases} />
          <Devices cardio={cardio} />
          <Records cardio={cardio} />
        </>
      )}
    </div>
  );
}
