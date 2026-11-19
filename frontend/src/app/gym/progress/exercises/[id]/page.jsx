'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Trophy, Timer, TrendingUp, Repeat, CalendarDays, ArrowUpRight, AlertTriangle,
} from 'lucide-react';
import { getExerciseProgress, getExercises, saveExerciseGoal, deleteExerciseGoal, peekCache } from '../../../../../lib/api';
import {
  apiError, equipmentLabel, familySiblings, formatClock, formatDay, formatDelta, formatKg, formatSeconds, formatShortDate, formatVolume, muscleLabel, plural,
} from '../../../../../lib/gym';
import { useToast } from '../../../../../components/Toast';
import TargetGoal from '../../../../../components/gym/TargetGoal';
import ProgressChart from '../../../../../components/gym/ProgressChart';
import styles from '../../progress.module.css';

const kg = (value) => `${formatKg(value)} kg`;
const compactKg = (value) => (value >= 10000 ? `${formatKg(Math.round(value / 1000))}k` : formatKg(value));

const minutes = (seconds) => Math.round((seconds / 60) * 10) / 10;
const formatMinutes = (value) => `${formatKg(value)} min`;

const CARDIO_METRICS = [
  {
    key: 'duration',
    label: 'Duração',
    value: p => (p.duration_seconds ? minutes(p.duration_seconds) : null),
    has: points => points.some(p => p.duration_seconds > 0),
    format: formatMinutes,
    axis: v => formatKg(v),
    detail: p => [p.distance_km ? `${formatKg(p.distance_km)} km` : null, p.level ? `nível ${p.level}` : null].filter(Boolean).join(' · ') || 'Cardio',
    unit: 'min',
  },
  {
    key: 'distance',
    label: 'Distância',
    value: p => p.distance_km,
    has: points => points.some(p => p.distance_km > 0),
    format: v => `${formatKg(v)} km`,
    axis: v => formatKg(v),
    detail: p => formatMinutes(minutes(p.duration_seconds)),
    unit: 'km',
  },
  {
    key: 'speed',
    label: 'Velocidade',
    value: p => p.speed_kmh,
    has: points => points.some(p => p.speed_kmh > 0),
    format: v => `${formatKg(v)} km/h`,
    axis: v => formatKg(v),
    detail: p => formatMinutes(minutes(p.duration_seconds)),
    unit: 'km/h',
  },
  {
    key: 'level',
    label: 'Nível',
    value: p => p.level,
    has: points => points.some(p => p.level > 0),
    format: v => `nível ${v}`,
    axis: v => String(v),
    detail: p => formatMinutes(minutes(p.duration_seconds)),
    unit: '',
  },
];

const TIME_METRICS = [
  {
    key: 'best',
    label: 'Melhor tempo',
    value: p => p.best_duration_seconds || null,
    has: points => points.some(p => p.best_duration_seconds > 0),
    format: formatClock,
    axis: formatClock,
    detail: p => plural(p.sets, 'série', 'séries'),
    unit: 's',
  },
  {
    key: 'total',
    label: 'Tempo total',
    value: p => p.duration_seconds || null,
    has: points => points.some(p => p.duration_seconds > 0),
    format: formatClock,
    axis: formatClock,
    detail: p => plural(p.sets, 'série', 'séries'),
    unit: 's',
  },
];

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
    key: 'sides',
    label: 'Esquerda × direita',
    value: p => p.left_max_weight_kg,
    compare: p => p.right_max_weight_kg,
    has: points => points.some(p => p.left_max_weight_kg != null && p.right_max_weight_kg != null),
    format: kg,
    axis: formatKg,
    detail: p => (p.right_max_weight_kg != null ? `Esquerda · direita ${kg(p.right_max_weight_kg)}` : 'Esquerda'),
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

function Tiles({ tiles }) {
  return (
    <div className={styles.records}>
      {tiles.map(tile => (
        <div key={tile.label} className={styles.record}>
          <span className={styles.recordLabel}>{tile.label}</span>
          <span className={`${styles.recordValue} ${tile.tone ?? ''}`}>{tile.value}</span>
          {tile.note && <span className={styles.recordNote}>{tile.note}</span>}
        </div>
      ))}
    </div>
  );
}

function Group({ icon: Icon, title, children }) {
  return (
    <section className={styles.group} aria-label={title}>
      <h2 className={styles.groupTitle}><Icon size={17} aria-hidden="true" /> {title}</h2>
      {children}
    </section>
  );
}

const signedKg = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatKg(Math.abs(value))} kg`;
const daysLabel = (days) => (days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`);

function Insights({ data }) {
  const { ready, stagnation, pace, rep_records: repRecords = [], frequency } = data;
  return (
    <>
      {ready && (
        <section className={styles.callout} aria-label="Pronto para subir a carga">
          <span className={styles.calloutTitle}><ArrowUpRight size={18} aria-hidden="true" /> Pronto para subir a carga</span>
          <span className={styles.calloutText}>
            No último treino: {ready.sets} × {ready.reps} com {formatKg(ready.weight_kg)} kg, no topo da faixa ({ready.reps_max} reps) da ficha {ready.workout_name}.
            Tente {formatKg(ready.weight_kg + 2.5)} kg na próxima.
          </span>
        </section>
      )}

      {stagnation && (
        <section className={`${styles.callout} ${styles.calloutWarn}`} aria-label="Estagnação">
          <span className={styles.calloutTitle}><AlertTriangle size={18} aria-hidden="true" /> Sem novo recorde há {stagnation.sessions} treinos</span>
          <span className={styles.calloutText}>
            O melhor foi {formatKg(stagnation.best_kg)} kg em {formatDay(stagnation.since)}. Vale mudar o estímulo: outra faixa de reps, uma variação do exercício ou mais séries por algumas semanas.
          </span>
        </section>
      )}

      {pace && (
        <Group icon={TrendingUp} title="Ritmo de progressão">
          <Tiles tiles={[
            { label: 'Por mês', value: signedKg(pace.kg_per_month), note: pace.metric === 'e1rm' ? 'no 1RM estimado' : 'na carga máxima', tone: pace.kg_per_month > 0 ? styles.up : '' },
            { label: 'Em %', value: pace.pct_per_month !== null ? `${pace.pct_per_month > 0 ? '+' : ''}${formatKg(pace.pct_per_month)}%` : '—', note: 'por mês' },
            { label: 'Em 3 meses', value: `${formatKg(Math.max(pace.projected_kg, 0))} kg`, note: `hoje ${formatKg(pace.current_kg)} kg` },
          ]} />
          <p className={styles.panelNote}>Calculado em {plural(pace.sessions, 'treino', 'treinos')} desde {formatDay(pace.since)}, mantendo o ritmo atual.</p>
        </Group>
      )}

      {repRecords.length > 0 && (
        <Group icon={Repeat} title="Recorde por repetições">
          <ul
            className={`${styles.repRecords} ${repRecords.length > 3 ? styles.repCarousel : ''}`}
            style={{ '--count': Math.min(repRecords.length, 3) }}
          >
            {repRecords.map(record => (
              <li key={record.reps}>
                <Link href={`/gym/history/${record.session_id}`} className={styles.repRecord}>
                  <span className={styles.repTarget}>{record.reps} {record.reps === 1 ? 'rep' : 'reps'}</span>
                  <span className={styles.repWeight}>{data.equipment === 'bodyweight' ? '+' : ''}{formatKg(record.weight_kg)} kg</span>
                  <span className={styles.repNote}>
                    {record.actual_reps > record.reps ? `feito com ${record.actual_reps} · ` : ''}{formatShortDate(record.date)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {frequency && (
        <Group icon={CalendarDays} title="Frequência">
          <Tiles tiles={[
            { label: 'Por semana', value: `${formatKg(frequency.per_week)}×`, note: frequency.weeks >= 8 ? 'nas últimas 8 semanas' : 'desde a primeira vez' },
            { label: 'Intervalo médio', value: frequency.avg_interval_days !== null ? `${formatKg(frequency.avg_interval_days)} ${frequency.avg_interval_days === 1 ? 'dia' : 'dias'}` : '—', note: 'entre os treinos' },
            { label: 'Última vez', value: daysLabel(frequency.days_since_last), note: formatDay(frequency.last_on) },
          ]} />
        </Group>
      )}
    </>
  );
}

function sideStrength(point) {
  const useOneRm = point.left_estimated_1rm_kg != null && point.right_estimated_1rm_kg != null;
  return useOneRm
    ? { left: point.left_estimated_1rm_kg, right: point.right_estimated_1rm_kg, metric: '1RM estimado' }
    : { left: point.left_max_weight_kg, right: point.right_max_weight_kg, metric: 'carga máxima' };
}

function Balance({ points }) {
  const paired = points.filter(p => p.left_max_weight_kg != null && p.right_max_weight_kg != null);
  if (!paired.length) return null;
  const now = sideStrength(paired.at(-1));
  const strong = Math.max(now.left, now.right);
  const gap = strong ? Math.round((Math.abs(now.left - now.right) / strong) * 100) : 0;
  const weaker = now.left < now.right ? 'Esquerda' : 'Direita';
  const before = paired.length > 1 ? sideStrength(paired[0]) : null;
  const gapBefore = before && Math.max(before.left, before.right)
    ? Math.round((Math.abs(before.left - before.right) / Math.max(before.left, before.right)) * 100)
    : null;

  return (
    <section className={styles.balance} aria-label="Equilíbrio entre os lados">
      <span className={styles.balanceTitle}>Esquerda × direita</span>
      <span className={styles.balanceValue}>
        {gap < 3 ? 'Lados equilibrados' : `${weaker} ${gap}% mais fraca`}
      </span>
      <span className={styles.balanceNote}>
        E {kg(now.left)} · D {kg(now.right)} de {now.metric} no último treino
        {gapBefore !== null && gapBefore !== gap && ` · diferença era ${gapBefore}% no primeiro`}
      </span>
    </section>
  );
}

function bestOf(points, pick) {
  return points.reduce((best, p) => {
    const value = pick(p);
    return value !== null && (!best || value > pick(best)) ? p : best;
  }, null);
}

const bestSet = (p) => (p.max_weight_kg > 0 ? `${kg(p.max_weight_kg)} × ${p.reps_at_max}` : `Peso corporal × ${p.max_reps}`);

function timedRow(p, tracking) {
  if (tracking === 'cardio') {
    return [formatMinutes(minutes(p.duration_seconds)), p.distance_km ? `${formatKg(p.distance_km)} km` : null, p.speed_kmh ? `${formatKg(p.speed_kmh)} km/h` : null, p.level ? `nível ${p.level}` : null]
      .filter(Boolean).join(' · ');
  }
  return `Melhor ${formatClock(p.best_duration_seconds)} · total ${formatClock(p.duration_seconds)}`;
}

export default function ExerciseProgressPage() {
  const { id } = useParams();
  const [data, setData] = useState(() => peekCache(`fitnessProgress:${id}`) ?? null);
  const [library, setLibrary] = useState(() => peekCache('fitnessExercises') ?? null);

  useEffect(() => {
    getExercises().then(setLibrary).catch(() => {});
  }, []);
  const [status, setStatus] = useState(data ? 'ready' : 'loading');
  const [metricKey, setMetricKey] = useState(null);
  const toast = useToast();

  const load = useCallback(() => {
    getExerciseProgress(id)
      .then(result => { setData(result); setStatus('ready'); })
      .catch(err => setStatus(err?.response?.status === 404 ? 'missing' : 'error'));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveGoal = async (goalData) => {
    try {
      const goal = await saveExerciseGoal(id, goalData);
      setData(current => ({ ...current, goal }));
      toast(data.goal ? 'Meta atualizada' : 'Meta definida');
      return null;
    } catch (err) {
      return apiError(err, 'Não foi possível salvar a meta.');
    }
  };

  const removeGoal = async () => {
    try {
      await deleteExerciseGoal(id);
      setData(current => ({ ...current, goal: null }));
      toast('Meta removida');
      return true;
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível remover a meta.') });
      return false;
    }
  };

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
  const siblings = familySiblings(library?.find(exercise => exercise.id === data.exercise_id), library);
  const extra = data.equipment === 'bodyweight';
  const tracking = data.tracking ?? 'reps';
  const timed = tracking !== 'reps';
  const plusKg = (value) => `+${formatKg(value)} kg`;
  const metrics = (tracking === 'cardio' ? CARDIO_METRICS : tracking === 'time' ? [...TIME_METRICS, ...METRICS.filter(m => m.key === 'weight')] : METRICS)
    .map(m => (extra && m.key === 'weight' ? { ...m, label: 'Carga extra', format: plusKg, axis: v => `+${formatKg(v)}` } : m))
    .filter(m => m.has(points));
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

  const longest = bestOf(points, p => p.best_duration_seconds || null);
  const records = tracking === 'cardio' ? [
    longest && { label: 'Mais longo', value: formatMinutes(minutes(bestOf(points, p => p.duration_seconds || null).duration_seconds)), note: formatShortDate(bestOf(points, p => p.duration_seconds || null).completed_at) },
    bestOf(points, p => p.distance_km) && { label: 'Maior distância', value: `${formatKg(bestOf(points, p => p.distance_km).distance_km)} km`, note: formatShortDate(bestOf(points, p => p.distance_km).completed_at) },
    bestOf(points, p => p.speed_kmh) && { label: 'Maior velocidade', value: `${formatKg(bestOf(points, p => p.speed_kmh).speed_kmh)} km/h`, note: formatShortDate(bestOf(points, p => p.speed_kmh).completed_at) },
    bestOf(points, p => p.level) && { label: 'Maior nível', value: `nível ${bestOf(points, p => p.level).level}`, note: formatShortDate(bestOf(points, p => p.level).completed_at) },
  ].filter(Boolean) : tracking === 'time' ? [
    longest && { label: 'Melhor tempo', value: formatClock(longest.best_duration_seconds), note: formatShortDate(longest.completed_at) },
    heaviest && { label: extra ? 'Maior carga extra' : 'Maior carga', value: extra ? plusKg(heaviest.max_weight_kg) : kg(heaviest.max_weight_kg), note: formatShortDate(heaviest.completed_at) },
  ].filter(Boolean) : [
    heaviest && { label: extra ? 'Maior carga extra' : 'Melhor carga', value: extra ? plusKg(heaviest.max_weight_kg) : kg(heaviest.max_weight_kg), note: `× ${heaviest.reps_at_max} · ${formatShortDate(heaviest.completed_at)}` },
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
        {data.equipment === 'bodyweight' && !timed && (
          <p className={styles.panelNote}>
            Carga mostrada como extra, além do peso corporal. Volume e 1RM somam {Math.round((library?.find(exercise => exercise.id === data.exercise_id)?.bodyweight_factor ?? 1) * 100)}% do seu peso da última pesagem.
          </p>
        )}
        {siblings.length > 1 && (
          <nav className={styles.variants} aria-label="Outros equipamentos">
            {siblings.map(variant => (
              <Link
                key={variant.id}
                href={`/gym/progress/exercises/${variant.id}`}
                replace
                className={`${styles.variant} ${variant.id === data.exercise_id ? styles.variantActive : ''}`}
                aria-current={variant.id === data.exercise_id ? 'page' : undefined}
              >
                {equipmentLabel(variant.equipment)}
              </Link>
            ))}
          </nav>
        )}
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
              target={metric.key === 'weight' ? data.goal?.target_kg ?? null : null}
              compare={metric.compare ? {
                mainLabel: 'Esquerda',
                label: 'Direita',
                points: points
                  .filter(p => metric.compare(p) != null)
                  .map(p => ({ key: p.session_id, time: new Date(p.completed_at).getTime(), value: metric.compare(p) })),
              } : null}
            />
          </section>

          {!timed && <Balance points={points} />}

          {!timed && <Insights data={data} />}

          {!timed && <TargetGoal
            goal={data.goal}
            title="Meta de carga"
            addLabel="Definir meta de carga"
            addText="A carga máxima que você quer levantar neste exercício, com prazo opcional."
            dataWord="treinos"
            suggestion={heaviest ? heaviest.max_weight_kg + 2.5 : null}
            unitHint="80"
            onSave={saveGoal}
            onDelete={removeGoal}
          />}

          {data.time && tracking !== 'cardio' && (
            <section className={styles.group} aria-labelledby="exercise-time-title">
              <h2 id="exercise-time-title" className={styles.groupTitle}><Timer size={17} aria-hidden="true" /> Tempo</h2>
              <div className={styles.records}>
                {[
                  { label: 'Tempo no exercício', value: formatSeconds(data.time.avg_seconds), note: `média de ${plural(data.time.sessions, 'treino', 'treinos')}` },
                  { label: 'Tempo por série', value: formatSeconds(data.time.avg_set_seconds), note: 'incluindo descanso' },
                  { label: 'Descanso real', value: formatSeconds(data.time.avg_rest_seconds), note: 'entre séries' },
                ].map(tile => (
                  <div key={tile.label} className={styles.record}>
                    <span className={styles.recordLabel}>{tile.label}</span>
                    <span className={styles.recordValue}>{tile.value}</span>
                    <span className={styles.recordNote}>{tile.note}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={styles.group} aria-labelledby="exercise-records-title">
            <h2 id="exercise-records-title" className={styles.groupTitle}><Trophy size={17} aria-hidden="true" /> Recordes</h2>
            <div className={styles.records}>
              {records.map(record => (
                <div key={record.label} className={styles.record}>
                  <span className={styles.recordLabel}>{record.label}</span>
                  <span className={styles.recordValue}>{record.value}</span>
                  <span className={styles.recordNote}>{record.note}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.sessions}>
            <h2 className={styles.sectionTitle}>Treinos</h2>
            <ul className={styles.list}>
              {[...points].reverse().map(p => (
                <li key={p.session_id}>
                  <Link href={`/gym/history/${p.session_id}`} className={styles.row}>
                    <span className={styles.rowDate}>{formatShortDate(p.completed_at)}</span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{timed ? timedRow(p, tracking) : bestSet(p)}</span>
                      <span className={styles.rowMeta}>{p.session_name}{tracking === 'cardio' ? '' : ` · ${plural(p.sets, 'série', 'séries')}`}</span>
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
