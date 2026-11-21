'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity, BarChart3, CalendarCheck, Dumbbell, Flame, Medal, TrendingDown, TrendingUp, Target, ChevronRight, Scale, CalendarDays, ListChecks, Timer,
} from 'lucide-react';
import { getFitnessStats, getPlans, peekCache } from '../../lib/api';
import {
  formatDay, formatDuration, formatKg, formatSeconds, formatVolume, muscleLabel, parseDay, plural,
} from '../../lib/gym';
import BarChart from './BarChart';
import Sparkline from './Sparkline';
import TrainingHeatmap from './TrainingHeatmap';
import LimitedList from './LimitedList';
import styles from '../../app/gym/progress/stats.module.css';

const PERIODS = [
  { key: '4w', label: '4 semanas', short: '4 semanas' },
  { key: '3m', label: '3 meses', short: '3 meses' },
  { key: '6m', label: '6 meses', short: '6 meses' },
  { key: '1y', label: '1 ano', short: '12 meses' },
  { key: 'all', label: 'Tudo', short: 'todo o período' },
];

const TIMELINE_METRICS = [
  { key: 'sessions', label: 'Treinos', format: v => plural(v, 'treino', 'treinos'), axis: v => String(v) },
  { key: 'sets', label: 'Séries', format: v => plural(v, 'série', 'séries'), axis: v => String(v) },
  { key: 'volume_kg', label: 'Volume', format: formatVolume, axis: v => (v >= 1000 ? `${formatKg(Math.round(v / 100) / 10)}t` : formatKg(v)) },
  { key: 'minutes', label: 'Tempo', format: v => formatDuration(v * 60000), axis: v => (v >= 60 ? `${Math.round(v / 60)}h` : `${v}m`) },
  { key: 'density_kg_min', label: 'Densidade', format: v => `${formatKg(v)} kg/min`, axis: v => formatKg(v) },
];

const WEEKDAY_LONG = ['segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados', 'domingos'];
const ratio = (value) => `${formatKg(value)}×`;

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DAY_PARTS = { dawn: 'Madrugada', morning: 'Manhã', afternoon: 'Tarde', night: 'Noite' };

const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const kg = (value) => `${formatKg(value)} kg`;

function change(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Delta({ value, suffix = '%' }) {
  if (value === null || value === undefined) return null;
  const tone = value > 0 ? styles.up : value < 0 ? styles.down : styles.flat;
  return <span className={`${styles.delta} ${tone}`}>{value > 0 ? '+' : value < 0 ? '−' : ''}{formatKg(Math.abs(value))}{suffix}</span>;
}

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

function Summary({ data }) {
  const { summary, previous } = data;
  const tiles = [
    { label: 'Treinos', value: summary.sessions, delta: change(summary.sessions, previous?.sessions) },
    { label: 'Tempo treinando', value: formatDuration(summary.minutes * 60000), delta: change(summary.minutes, previous?.minutes) },
    { label: 'Séries', value: summary.sets, delta: change(summary.sets, previous?.sets) },
    { label: 'Volume', value: formatVolume(summary.volume_kg), delta: change(summary.volume_kg, previous?.volume_kg) },
    { label: 'Repetições', value: summary.reps.toLocaleString('pt-BR'), delta: change(summary.reps, previous?.reps) },
    { label: 'Treinos por semana', value: formatKg(summary.per_week), delta: change(summary.per_week, previous?.per_week) },
    { label: 'Duração média', value: summary.avg_minutes ? formatDuration(summary.avg_minutes * 60000) : '—', delta: change(summary.avg_minutes, previous?.avg_minutes) },
    { label: 'Densidade (kg/min)', value: summary.density_kg_min ? formatKg(summary.density_kg_min) : '—', delta: change(summary.density_kg_min, previous?.density_kg_min) },
  ];

  return (
    <section className={styles.kpis} aria-label="Resumo do período">
      {tiles.map(tile => (
        <div key={tile.label} className={styles.kpi}>
          <span className={styles.kpiValue}>{tile.value}</span>
          <span className={styles.kpiLabel}>{tile.label}</span>
          <Delta value={tile.delta} />
        </div>
      ))}
      {previous && <p className={styles.kpiNote}>Comparado com os {PERIODS.find(p => p.key === data.period).short} anteriores</p>}
    </section>
  );
}

function Timeline({ data }) {
  const [metricKey, setMetricKey] = useState('sessions');
  const metric = TIMELINE_METRICS.find(m => m.key === metricKey);
  const monthly = data.bucket === 'month';
  const bars = data.timeline.map(bucket => {
    const start = parseDay(bucket.start);
    return {
      key: bucket.start,
      label: monthly ? monthLabel.format(start).replace('.', '') : formatDay(bucket.start),
      value: bucket[metric.key],
      detail: monthly
        ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(start)
        : `Semana de ${formatDay(bucket.start)}`,
    };
  });

  return (
    <Card icon={BarChart3} title="Evolução dos treinos" hint={monthly ? 'por mês' : 'por semana'}>
      <div className={styles.chips} role="tablist" aria-label="Métrica">
        {TIMELINE_METRICS.map(m => (
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
      <BarChart key={metric.key} bars={bars} format={metric.format} axisFormat={metric.axis} label={`${metric.label} ${monthly ? 'por mês' : 'por semana'}`} />
    </Card>
  );
}

function Consistency({ data }) {
  const { consistency } = data;
  const maxDay = Math.max(...consistency.weekdays, 1);
  const totalParts = consistency.day_parts.reduce((sum, p) => sum + p.sessions, 0);
  const favorite = consistency.weekdays.indexOf(Math.max(...consistency.weekdays));

  return (
    <Card icon={CalendarCheck} title="Constância">
      <div className={styles.streaks}>
        <div className={styles.streak}>
          <Flame size={18} className={styles.streakIcon} aria-hidden="true" />
          <span className={styles.streakValue}>{plural(consistency.current_week_streak, 'semana', 'semanas')}</span>
          <span className={styles.streakLabel}>seguidas treinando</span>
        </div>
        <div className={styles.streak}>
          <Medal size={18} className={styles.streakIcon} aria-hidden="true" />
          <span className={styles.streakValue}>{plural(consistency.best_week_streak, 'semana', 'semanas')}</span>
          <span className={styles.streakLabel}>melhor sequência</span>
        </div>
      </div>

      {data.summary.sessions > 0 && (
        <>
          <h3 className={styles.subTitle}>Dias da semana {consistency.weekdays[favorite] > 0 && <span>· mais treina na {WEEKDAYS[favorite].toLowerCase()}</span>}</h3>
          <div className={styles.weekdays}>
            {consistency.weekdays.map((count, i) => (
              <div key={WEEKDAYS[i]} className={styles.weekday} aria-label={`${WEEKDAYS[i]}: ${plural(count, 'treino', 'treinos')}`}>
                <span className={styles.weekdayCount} aria-hidden="true">{count || ''}</span>
                <span className={styles.weekdayTrack} aria-hidden="true">
                  <span className={styles.weekdayFill} style={{ height: `${(count / maxDay) * 100}%` }} />
                </span>
                <span className={styles.weekdayLabel} aria-hidden="true">{WEEKDAYS[i].slice(0, 1)}</span>
              </div>
            ))}
          </div>

          <h3 className={styles.subTitle}>Horário</h3>
          <ul className={styles.parts}>
            {consistency.day_parts.map(part => {
              const share = totalParts ? part.sessions / totalParts : 0;
              return (
                <li key={part.part} className={styles.part}>
                  <span className={styles.partLabel}>{DAY_PARTS[part.part]}</span>
                  <span className={styles.track}><span className={styles.fill} style={{ width: `${share * 100}%` }} /></span>
                  <span className={styles.partValue}>{Math.round(share * 100)}%</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

function Muscles({ data }) {
  const [mode, setMode] = useState('volume');
  const trained = data.muscles.filter(m => m.sets > 0);
  const max = Math.max(...trained.map(m => (mode === 'sets' ? m.sets : m.volume_kg)), 1);
  const sorted = [...trained].sort((a, b) => (mode === 'sets' ? b.sets - a.sets : b.volume_kg - a.volume_kg));
  const neglected = data.muscles
    .filter(m => m.days_since !== null && m.days_since >= 7)
    .sort((a, b) => b.days_since - a.days_since);

  return (
    <Card icon={Target} title="Grupos musculares">
      {trained.length === 0 ? (
        <p className={styles.empty}>Nenhuma série registrada neste período.</p>
      ) : (
        <>
          <div className={styles.chips} role="tablist" aria-label="Medida">
            {[{ key: 'volume', label: 'Volume' }, { key: 'sets', label: 'Séries' }].map(option => (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={mode === option.key}
                className={`${styles.chip} ${mode === option.key ? styles.chipActive : ''}`}
                onClick={() => setMode(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <ul className={styles.muscles}>
            {sorted.map(m => {
              const value = mode === 'sets' ? m.sets : m.volume_kg;
              return (
                <li key={m.muscle_group} className={styles.muscle}>
                  <div className={styles.muscleTop}>
                    <span className={styles.muscleName}>{muscleLabel(m.muscle_group)}</span>
                    <span className={styles.muscleValue}>
                      {mode === 'sets' ? plural(m.sets, 'série', 'séries') : formatVolume(m.volume_kg)}
                      <span className={styles.muscleShare}>{Math.round(m.share * 100)}%</span>
                    </span>
                  </div>
                  <div className={styles.muscleBottom}>
                    <span className={styles.track}><span className={styles.fill} style={{ width: `${(value / max) * 100}%` }} /></span>
                    <Sparkline values={m.series} className={styles.spark} />
                  </div>
                  {data.previous && mode === 'sets' && (
                    <span className={styles.muscleMeta}>
                      {m.previous_sets ? <>antes {m.previous_sets} <Delta value={change(m.sets, m.previous_sets)} /></> : 'novo no período'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {neglected.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Sem treinar há um tempo</h3>
          <ul className={styles.neglected}>
            {neglected.map(m => (
              <li key={m.muscle_group} className={styles.neglectedItem}>
                <span>{muscleLabel(m.muscle_group)}</span>
                <span className={styles.neglectedDays}>há {plural(m.days_since, 'dia', 'dias')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Progressions({ data }) {
  const [mode, setMode] = useState('load');
  const average = data.progress_average;
  const hasLoad = data.progressions.length > 0 || data.declines.length > 0;
  const hasReps = data.rep_progressions.length > 0;

  if (!hasLoad && !hasReps && !average?.exercises) {
    return (
      <Card icon={TrendingUp} title="Progressão">
        <p className={styles.empty}>Faça o mesmo exercício em pelo menos dois treinos do período para comparar.</p>
      </Card>
    );
  }

  const loadRow = (p) => (
    <li key={`${p.exercise_id}-${p.name}`}>
      <Link href={p.exercise_id ? `/gym/progress/exercises/${p.exercise_id}` : '/gym/progress/exercises'} className={styles.row}>
        <span className={styles.rowMain}>
          <span className={styles.rowName}>{p.name}</span>
          <span className={styles.rowMeta}>
            {p.metric === 'e1rm' ? '1RM estimado' : 'Carga máxima'}: {kg(p.first_kg)} → {kg(p.last_kg)}
          </span>
        </span>
        <Delta value={p.change_pct} />
        <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
      </Link>
    </li>
  );

  const repRow = (p) => (
    <li key={`${p.exercise_id}-${p.name}`}>
      <Link href={p.exercise_id ? `/gym/progress/exercises/${p.exercise_id}` : '/gym/progress/exercises'} className={styles.row}>
        <span className={styles.rowMain}>
          <span className={styles.rowName}>{p.name}</span>
          <span className={styles.rowMeta}>Máximo numa série: {p.first_reps} → {plural(p.last_reps, 'rep', 'reps')}</span>
        </span>
        <Delta value={p.change_pct} />
        <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
      </Link>
    </li>
  );

  return (
    <Card icon={TrendingUp} title="Progressão" hint="início × fim do período">
      {average?.exercises > 0 && (
        <div className={styles.averages}>
          <div className={styles.average}>
            <span className={styles.averageLabel}>Média de carga</span>
            <span className={styles.averageValue}>{average.load_pct === null ? '—' : <Delta value={average.load_pct} />}</span>
          </div>
          <div className={styles.average}>
            <span className={styles.averageLabel}>Média de repetições</span>
            <span className={styles.averageValue}>{average.reps_pct === null ? '—' : <Delta value={average.reps_pct} />}</span>
          </div>
          <p className={styles.averageNote}>Média de {plural(average.exercises, 'exercício feito', 'exercícios feitos')} mais de uma vez no período</p>
        </div>
      )}

      <div className={styles.chips} role="tablist" aria-label="Tipo de progressão">
        {[{ key: 'load', label: 'Carga' }, { key: 'reps', label: 'Repetições' }].map(option => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={mode === option.key}
            className={`${styles.chip} ${mode === option.key ? styles.chipActive : ''}`}
            onClick={() => setMode(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === 'load' && (
        <>
          {data.progressions.length > 0
            ? <LimitedList className={styles.rows} items={data.progressions} render={loadRow} />
            : <p className={styles.empty}>Nenhum exercício subiu de carga neste período.</p>}
          {data.declines.length > 0 && (
            <>
              <h3 className={styles.subTitle}><TrendingDown size={14} aria-hidden="true" /> Em queda</h3>
              <LimitedList className={styles.rows} items={data.declines} render={loadRow} />
            </>
          )}
        </>
      )}

      {mode === 'reps' && (
        hasReps
          ? <LimitedList className={styles.rows} items={data.rep_progressions} render={repRow} />
          : <p className={styles.empty}>Nenhum exercício aumentou as repetições neste período.</p>
      )}
    </Card>
  );
}

function MostDone({ data }) {
  if (!data.most_done.length) return null;
  const max = Math.max(...data.most_done.map(e => e.sets), 1);
  return (
    <Card icon={Dumbbell} title="Exercícios mais feitos">
      <LimitedList className={styles.muscles} items={data.most_done} render={e => (
          <li key={`${e.exercise_id}-${e.name}`} className={styles.muscle}>
            <div className={styles.muscleTop}>
              <span className={styles.muscleName}>{e.name}</span>
              <span className={styles.muscleValue}>{plural(e.sets, 'série', 'séries')}</span>
            </div>
            <span className={styles.track}><span className={styles.fill} style={{ width: `${(e.sets / max) * 100}%` }} /></span>
            <span className={styles.muscleMeta}>{muscleLabel(e.muscle_group)} · {plural(e.sessions, 'treino', 'treinos')} · {formatVolume(e.volume_kg)}</span>
          </li>
        )} />
    </Card>
  );
}

function Adherence({ data }) {
  const adherence = data.adherence;
  if (!adherence) return null;
  if (!adherence.planned) {
    return (
      <Card icon={ListChecks} title="Aderência ao plano">
        <p className={styles.empty}>Ainda não teve nenhum dia planejado neste período.</p>
      </Card>
    );
  }
  const missed = adherence.weekdays
    .filter(w => w.planned > 0 && w.done < w.planned)
    .sort((a, b) => (a.done / a.planned) - (b.done / b.planned))[0];

  return (
    <Card icon={ListChecks} title="Aderência ao plano" hint={`desde ${formatDay(adherence.since)}`}>
      <div className={styles.adherenceTop}>
        <span className={styles.adherencePct}>{adherence.pct}%</span>
        <span className={styles.adherenceText}>
          {adherence.done} de {plural(adherence.planned, 'dia planejado', 'dias planejados')} treinados
          {adherence.extra_days > 0 && <> · {plural(adherence.extra_days, 'dia extra', 'dias extras')}</>}
        </span>
      </div>
      <span className={styles.track}><span className={styles.fill} style={{ width: `${adherence.pct}%` }} /></span>
      <ul className={styles.adherenceDays}>
        {adherence.weekdays.map(w => (
          <li key={w.weekday} className={styles.adherenceDay}>
            <span className={styles.adherenceLabel}>{WEEKDAYS[w.weekday]}</span>
            <span className={styles.track}>
              <span className={styles.fill} style={{ width: `${w.planned ? (w.done / w.planned) * 100 : 0}%` }} />
            </span>
            <span className={styles.adherenceCount}>{w.done}/{w.planned}</span>
          </li>
        ))}
      </ul>
      {missed && <p className={styles.adherenceNote}>Você mais falta nas {WEEKDAY_LONG[missed.weekday]}.</p>}
    </Card>
  );
}

function RelativeStrength({ data }) {
  const strength = data.relative_strength;
  if (!strength) return null;
  if (!strength.has_body_weight) {
    if (!data.progressions.length && !data.most_done.length) return null;
    return (
      <Card icon={Scale} title="Força relativa">
        <p className={styles.empty}>
          Registre seu peso para ver quantas vezes o seu peso corporal você levanta em cada exercício.{' '}
          <Link href="/gym/progress/body" className={styles.inlineLink}>Registrar peso</Link>
        </p>
      </Card>
    );
  }
  if (!strength.items.length) return null;

  return (
    <Card icon={Scale} title="Força relativa" hint="1RM estimado ÷ peso corporal">
      <LimitedList className={styles.rows} items={strength.items} render={item => {
          const diff = item.first_ratio !== null ? Math.round((item.ratio - item.first_ratio) * 100) / 100 : null;
          const content = (
            <>
              <span className={styles.rowMain}>
                <span className={styles.rowName}>{item.name}</span>
                <span className={styles.rowMeta}>{kg(item.e1rm_kg)} de 1RM · peso {kg(item.body_weight_kg)}</span>
              </span>
              <span className={styles.strengthValue}>
                {ratio(item.ratio)}
                {diff !== null && diff !== 0 && (
                  <span className={`${styles.delta} ${diff > 0 ? styles.up : styles.down}`}>{diff > 0 ? '+' : '−'}{formatKg(Math.abs(diff))}</span>
                )}
              </span>
            </>
          );
          return (
            <li key={`${item.exercise_id}-${item.name}`}>
              {item.exercise_id
                ? <Link href={`/gym/progress/exercises/${item.exercise_id}`} className={styles.row}>{content}</Link>
                : <div className={styles.row}>{content}</div>}
            </li>
          );
        }} />
    </Card>
  );
}

function BestPeriods({ best }) {
  if (!best) return null;
  const weekOf = (iso) => `semana de ${formatDay(iso)}`;
  const monthOf = (iso) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(parseDay(iso));
  const tiles = [
    { label: 'Semana com mais treinos', value: plural(best.week_sessions.sessions, 'treino', 'treinos'), note: weekOf(best.week_sessions.start) },
    { label: 'Semana com mais volume', value: formatVolume(best.week_volume.volume_kg), note: weekOf(best.week_volume.start) },
    { label: 'Mês com mais treinos', value: plural(best.month_sessions.sessions, 'treino', 'treinos'), note: monthOf(best.month_sessions.start) },
    { label: 'Mês com mais volume', value: formatVolume(best.month_volume.volume_kg), note: monthOf(best.month_volume.start) },
  ];
  return (
    <>
      <h3 className={styles.subTitle}>Melhores períodos</h3>
      <div className={styles.records}>
        {tiles.map(tile => (
          <div key={tile.label} className={`${styles.record} ${styles.recordStatic}`}>
            <span className={styles.recordLabel}>{tile.label}</span>
            <span className={styles.recordValue}>{tile.value}</span>
            <span className={styles.recordNote}>{tile.note}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function TimeCard({ data }) {
  const time = data.time;
  if (!time) return null;
  const tiles = [
    { label: 'Duração média do treino', value: formatSeconds(time.avg_session_seconds) },
    { label: 'Tempo médio por série', value: formatSeconds(time.avg_set_seconds), note: 'execução estimada' },
    { label: 'Preparação por exercício', value: formatSeconds(time.avg_prep_seconds), note: 'troca, espera e ajuste' },
    { label: 'Tempo médio por exercício', value: formatSeconds(time.avg_exercise_seconds), note: `${formatKg(time.exercises_per_session)} exercícios por treino` },
    { label: 'Descanso real entre séries', value: formatSeconds(time.avg_rest_seconds), note: 'medido pelo app' },
  ];
  return (
    <Card icon={Timer} title="Tempo">
      <div className={styles.records}>
        {tiles.map(tile => (
          <div key={tile.label} className={`${styles.record} ${styles.recordStatic}`}>
            <span className={styles.recordLabel}>{tile.label}</span>
            <span className={styles.recordValue}>{tile.value}</span>
            {tile.note && <span className={styles.recordNote}>{tile.note}</span>}
          </div>
        ))}
      </div>
      {time.longest_exercises.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Exercícios que mais tomam tempo</h3>
          <LimitedList className={styles.rows} items={time.longest_exercises} render={e => {
              const content = (
                <>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{e.name}</span>
                    <span className={styles.rowMeta}>
                      {plural(e.sessions, 'treino', 'treinos')}{e.prep_seconds >= 60 ? ` · ${formatSeconds(e.prep_seconds)} de preparação` : ''}{e.set_seconds ? ` · ${formatSeconds(e.set_seconds)} por série` : ''}
                    </span>
                  </span>
                  <span className={styles.strengthValue}>{formatSeconds(e.avg_seconds)}</span>
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
        </>
      )}
    </Card>
  );
}

function Frequency({ data }) {
  return (
    <Card icon={CalendarDays} title="Frequência" hint="séries por dia">
      <TrainingHeatmap activity={data.activity} today={data.end} />
    </Card>
  );
}

function AllTime({ data }) {
  const { all_time: allTime } = data;
  const records = allTime.records;
  if (!records) return null;
  const tiles = [
    { label: 'Maior volume', value: formatVolume(records.biggest_volume.value), ref: records.biggest_volume },
    { label: 'Treino mais longo', value: formatDuration(records.longest.value * 60000), ref: records.longest },
    { label: 'Mais séries', value: plural(records.most_sets.value, 'série', 'séries'), ref: records.most_sets },
    records.heaviest_set && {
      label: 'Série mais pesada',
      value: `${kg(records.heaviest_set.weight_kg)} × ${records.heaviest_set.reps}`,
      ref: records.heaviest_set,
    },
  ].filter(Boolean);

  return (
    <Card icon={Activity} title="Recordes de todos os tempos">
      <div className={styles.records}>
        {tiles.map(tile => (
          <Link key={tile.label} href={`/gym/history/${tile.ref.session_id}`} className={styles.record}>
            <span className={styles.recordLabel}>{tile.label}</span>
            <span className={styles.recordValue}>{tile.value}</span>
            <span className={styles.recordNote}>{tile.ref.name} · {formatDay(tile.ref.date)}</span>
          </Link>
        ))}
      </div>
      <BestPeriods best={allTime.best_periods} />
      <p className={styles.lifetime}>
        Desde {formatDay(allTime.first_session_on)}: {plural(allTime.sessions, 'treino', 'treinos')} · {formatDuration(allTime.minutes * 60000)} · {formatVolume(allTime.volume_kg)}
      </p>
    </Card>
  );
}

export const statsKey = (period, planId) => `fitnessStats:${period}:${planId ?? 'all'}`;

function useStats(planId, enabled = true) {
  const [period, setPeriod] = useState('3m');
  const [data, setData] = useState(() => peekCache(statsKey('3m', planId)) ?? null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let current = true;
    getFitnessStats(period, planId)
      .then(result => { if (current) setData(result); })
      .catch(() => { if (current) setLoadError(true); });
    return () => { current = false; };
  }, [period, planId, enabled]);

  const choose = (key) => {
    setLoadError(false);
    setData(peekCache(statsKey(key, planId)) ?? null);
    setPeriod(key);
  };

  const retry = () => {
    setLoadError(false);
    getFitnessStats(period, planId).then(setData).catch(() => setLoadError(true));
  };

  const ready = data?.period === period && (data?.plan_id ?? null) === (planId ?? null) ? data : null;
  return { period, choose, retry, ready, loadError, setData };
}

function Periods({ period, onChoose }) {
  return (
    <div className={styles.periods} role="tablist" aria-label="Período">
      {PERIODS.map(p => (
        <button
          key={p.key}
          type="button"
          role="tab"
          aria-selected={p.key === period}
          className={`${styles.chip} ${p.key === period ? styles.chipActive : ''}`}
          onClick={() => onChoose(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Loading({ loadError, onRetry, label }) {
  if (loadError) {
    return (
      <div className={styles.state}>
        <p>Não foi possível carregar as estatísticas.</p>
        <button type="button" className={styles.stateAction} onClick={onRetry}>Tentar de novo</button>
      </div>
    );
  }
  return (
    <div className={styles.skeletons} aria-busy="true" aria-label={label}>
      <div className={styles.skeletonKpis} />
      <div className={styles.skeleton} />
      <div className={styles.skeleton} />
    </div>
  );
}

function NoSessions() {
  return (
    <div className={styles.state}>
      <BarChart3 size={34} className={styles.stateIcon} aria-hidden="true" />
      <p className={styles.stateTitle}>Nenhum treino finalizado ainda.</p>
      <p className={styles.stateText}>Finalize o primeiro treino para ver volume, séries por grupo muscular, progressões e recordes.</p>
      <Link href="/gym/workouts" className={styles.stateLink}>Começar um treino</Link>
    </div>
  );
}

export function GeneralStats() {
  const { period, choose, retry, ready, loadError } = useStats(null);
  return (
    <>
      <Periods period={period} onChoose={choose} />
      {!ready && <Loading loadError={loadError} onRetry={retry} label="Carregando estatísticas" />}
      {ready && ready.all_time.sessions === 0 && <NoSessions />}
      {ready && ready.all_time.sessions > 0 && (
        <>
          <Summary data={ready} />
          <Frequency data={ready} />
          <Timeline data={ready} />
          <Muscles data={ready} />
          <Progressions data={ready} />
          <RelativeStrength data={ready} />
          <TimeCard data={ready} />
          <Consistency data={ready} />
          <MostDone data={ready} />
          <AllTime data={ready} />
        </>
      )}
    </>
  );
}

export function PlanStats() {
  const [plans, setPlans] = useState(() => peekCache('fitnessPlans') ?? null);
  const [chosen, setChosen] = useState(null);
  const planId = chosen ?? plans?.find(plan => plan.is_active)?.id ?? plans?.[0]?.id ?? null;
  const { period, choose, retry, ready, loadError } = useStats(planId, planId !== null);

  useEffect(() => {
    getPlans().then(setPlans).catch(() => setPlans(current => current ?? []));
  }, []);

  if (plans && !plans.length) {
    return (
      <div className={styles.state}>
        <ListChecks size={34} className={styles.stateIcon} aria-hidden="true" />
        <p className={styles.stateTitle}>Você ainda não tem um plano.</p>
        <p className={styles.stateText}>Monte um plano semanal com suas fichas para acompanhar a aderência aqui.</p>
        <Link href="/gym/plans" className={styles.stateLink}>Criar plano</Link>
      </div>
    );
  }

  return (
    <>
      {plans?.length > 1 && (
        <div className={styles.periods} role="tablist" aria-label="Plano">
          {plans.map(plan => (
            <button
              key={plan.id}
              type="button"
              role="tab"
              aria-selected={plan.id === planId}
              className={`${styles.chip} ${plan.id === planId ? styles.chipActive : ''}`}
              onClick={() => setChosen(plan.id)}
            >
              {plan.name}{plan.is_active ? ' · ativo' : ''}
            </button>
          ))}
        </div>
      )}
      <Periods period={period} onChoose={choose} />
      {!ready && <Loading loadError={loadError} onRetry={retry} label="Carregando plano" />}
      {ready && (
        <>
          <Adherence data={ready} />
          {ready.summary.sessions > 0 && (
            <>
              <Summary data={ready} />
              <Timeline data={ready} />
              <Consistency data={ready} />
            </>
          )}
        </>
      )}
    </>
  );
}
