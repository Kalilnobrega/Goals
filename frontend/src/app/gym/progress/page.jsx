'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity, BarChart3, CalendarCheck, Dumbbell, Flame, Medal, TrendingDown, TrendingUp, Trophy, ClipboardList, Target, ChevronRight,
} from 'lucide-react';
import { getFitnessStats, peekCache } from '../../../lib/api';
import {
  formatDay, formatDuration, formatKg, formatVolume, muscleLabel, parseDay, plural,
} from '../../../lib/gym';
import SegmentTabs, { PROGRESS_TABS } from '../../../components/gym/SegmentTabs';
import BarChart from '../../../components/gym/BarChart';
import Sparkline from '../../../components/gym/Sparkline';
import styles from './stats.module.css';

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
];

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
    { label: 'Dias treinados', value: summary.active_days, delta: change(summary.active_days, previous?.active_days) },
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
  const [mode, setMode] = useState('sets');
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
            {[{ key: 'sets', label: 'Séries' }, { key: 'volume', label: 'Volume' }].map(option => (
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
            ? <ul className={styles.rows}>{data.progressions.map(loadRow)}</ul>
            : <p className={styles.empty}>Nenhum exercício subiu de carga neste período.</p>}
          {data.declines.length > 0 && (
            <>
              <h3 className={styles.subTitle}><TrendingDown size={14} aria-hidden="true" /> Em queda</h3>
              <ul className={styles.rows}>{data.declines.map(loadRow)}</ul>
            </>
          )}
        </>
      )}

      {mode === 'reps' && (
        hasReps
          ? <ul className={styles.rows}>{data.rep_progressions.map(repRow)}</ul>
          : <p className={styles.empty}>Nenhum exercício aumentou as repetições neste período.</p>
      )}
    </Card>
  );
}

function Records({ data }) {
  return (
    <Card icon={Trophy} title="Recordes no período" hint={data.records.length ? plural(data.records.length, 'recorde', 'recordes') : null}>
      {data.records.length === 0 ? (
        <p className={styles.empty}>Nenhuma carga nova neste período. Recordes aparecem quando você supera a maior carga já feita num exercício.</p>
      ) : (
        <ul className={styles.rows}>
          {data.records.map(r => (
            <li key={`${r.session_id}-${r.name}`}>
              <Link href={`/gym/history/${r.session_id}`} className={styles.row}>
                <span className={styles.rowDate}>{formatDay(r.date)}</span>
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{r.name}</span>
                  <span className={styles.rowMeta}>{kg(r.weight_kg)} × {r.reps} · antes {kg(r.previous_kg)}</span>
                </span>
                <span className={`${styles.delta} ${styles.up}`}>+{formatKg(Math.round((r.weight_kg - r.previous_kg) * 100) / 100)} kg</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MostDone({ data }) {
  if (!data.most_done.length) return null;
  const max = Math.max(...data.most_done.map(e => e.sets), 1);
  return (
    <Card icon={Dumbbell} title="Exercícios mais feitos">
      <ul className={styles.muscles}>
        {data.most_done.map(e => (
          <li key={`${e.exercise_id}-${e.name}`} className={styles.muscle}>
            <div className={styles.muscleTop}>
              <span className={styles.muscleName}>{e.name}</span>
              <span className={styles.muscleValue}>{plural(e.sets, 'série', 'séries')}</span>
            </div>
            <span className={styles.track}><span className={styles.fill} style={{ width: `${(e.sets / max) * 100}%` }} /></span>
            <span className={styles.muscleMeta}>{muscleLabel(e.muscle_group)} · {plural(e.sessions, 'treino', 'treinos')} · {formatVolume(e.volume_kg)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Workouts({ data }) {
  if (!data.workouts.length) return null;
  return (
    <Card icon={ClipboardList} title="Fichas">
      <ul className={styles.rows}>
        {data.workouts.map(w => (
          <li key={`${w.workout_id}-${w.name}`} className={styles.workout}>
            <div className={styles.workoutTop}>
              <span className={styles.rowName}>{w.name}</span>
              <span className={styles.workoutCount}>{w.sessions}×</span>
            </div>
            <span className={styles.rowMeta}>
              {formatDuration(w.avg_minutes * 60000)} em média · {formatVolume(w.avg_volume_kg)} por treino · último {formatDay(w.last_done_on)}
            </span>
            {(w.progress_pct !== null || w.volume_change_pct !== null) && (
              <span className={styles.workoutChange}>
                {w.progress_pct !== null && <>Progressão média: <Delta value={w.progress_pct} /></>}
                {w.volume_change_pct !== null && <>Volume: <Delta value={Math.round(w.volume_change_pct)} /></>}
              </span>
            )}
          </li>
        ))}
      </ul>
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
      <p className={styles.lifetime}>
        Desde {formatDay(allTime.first_session_on)}: {plural(allTime.sessions, 'treino', 'treinos')} · {formatDuration(allTime.minutes * 60000)} · {formatVolume(allTime.volume_kg)}
      </p>
    </Card>
  );
}

export default function StatsPage() {
  const [period, setPeriod] = useState('3m');
  const [data, setData] = useState(() => peekCache('fitnessStats:3m') ?? null);
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
    setData(peekCache(`fitnessStats:${key}`) ?? null);
    setPeriod(key);
  };

  const retry = () => {
    setLoadError(false);
    getFitnessStats(period).then(setData).catch(() => setLoadError(true));
  };

  const ready = data?.period === period ? data : null;

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Evolução</h1>
        <p className={styles.subtitle}>Seus números de treino, do volume aos recordes</p>
      </header>

      <SegmentTabs tabs={PROGRESS_TABS} label="Evolução" />

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
          <p>Não foi possível carregar as estatísticas.</p>
          <button type="button" className={styles.stateAction} onClick={retry}>Tentar de novo</button>
        </div>
      )}

      {!ready && !loadError && (
        <div className={styles.skeletons} aria-busy="true" aria-label="Carregando estatísticas">
          <div className={styles.skeletonKpis} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      )}

      {ready && ready.all_time.sessions === 0 && (
        <div className={styles.state}>
          <BarChart3 size={34} className={styles.stateIcon} aria-hidden="true" />
          <p className={styles.stateTitle}>Suas estatísticas aparecem aqui.</p>
          <p className={styles.stateText}>Finalize o primeiro treino para ver volume, séries por grupo muscular, progressões e recordes.</p>
          <Link href="/gym/workouts" className={styles.stateLink}>Começar um treino</Link>
        </div>
      )}

      {ready && ready.all_time.sessions > 0 && (
        <>
          <Summary data={ready} />
          <Timeline data={ready} />
          <Muscles data={ready} />
          <Progressions data={ready} />
          <Records data={ready} />
          <Consistency data={ready} />
          <MostDone data={ready} />
          <Workouts data={ready} />
          <AllTime data={ready} />
        </>
      )}
    </div>
  );
}
