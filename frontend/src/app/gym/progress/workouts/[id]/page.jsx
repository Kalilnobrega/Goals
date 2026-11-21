'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Timer, Trophy, ListChecks, Target, ChartBar, LayoutGrid, ArrowUpRight, HeartPulse,
} from 'lucide-react';
import { getWorkoutProgress, peekCache } from '../../../../../lib/api';
import {
  formatDay, formatDuration, formatKg, formatSeconds, formatShortDate, formatVolume, muscleLabel, plural,
} from '../../../../../lib/gym';
import ProgressChart from '../../../../../components/gym/ProgressChart';
import LimitedList from '../../../../../components/gym/LimitedList';
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

function Group({ icon: Icon, title, children }) {
  return (
    <section className={styles.group} aria-label={title}>
      <h2 className={styles.groupTitle}><Icon size={17} aria-hidden="true" /> {title}</h2>
      {children}
    </section>
  );
}

function Tiles({ tiles }) {
  return (
    <div className={styles.records}>
      {tiles.map(tile => (
        <div key={tile.label} className={styles.record}>
          <span className={styles.recordLabel}>{tile.label}</span>
          <span className={styles.recordValue}>{tile.value}</span>
          {tile.note && <span className={styles.recordNote}>{tile.note}</span>}
        </div>
      ))}
    </div>
  );
}

const PHASE_LABEL = { start: 'Cardio no início', end: 'Cardio no final' };

function CardioGroup({ data }) {
  if (!data) return null;
  return (
    <Group icon={HeartPulse} title="Cardio">
      <Tiles tiles={[
        { label: 'Planejado por treino', value: `${data.planned_minutes} min` },
        data.avg_done_minutes !== null && { label: 'Feito em média', value: `${data.avg_done_minutes} min`, note: plural(data.sessions, 'treino', 'treinos') },
        data.completion_pct !== null && { label: 'Do tempo planejado', value: `${formatKg(data.completion_pct)}%` },
        data.sessions > 0 && { label: 'Vezes pulado', value: data.skipped, note: `de ${plural(data.phases.reduce((sum, phase) => sum + phase.planned, 0), 'cardio planejado', 'cardios planejados')}` },
      ].filter(Boolean)} />
      {data.phases.length > 1 && (
        <ul className={styles.list}>
          {data.phases.map(phase => (
            <li key={phase.phase} className={`${styles.row} ${own.static}`}>
              <span className={styles.rowMain}>
                <span className={styles.rowName}>{PHASE_LABEL[phase.phase]}</span>
                <span className={styles.rowMeta}>pulado {plural(phase.skipped, 'vez', 'vezes')} de {phase.planned}</span>
              </span>
              <span className={styles.rowVolume}>{phase.minutes} min</span>
            </li>
          ))}
        </ul>
      )}
    </Group>
  );
}

function Ready({ items }) {
  if (!items.length) return null;
  return (
    <section className={own.ready} aria-label="Pronto para subir a carga">
      <h2 className={own.readyTitle}><ArrowUpRight size={18} aria-hidden="true" /> Pronto para subir a carga</h2>
      <LimitedList className={own.readyList} items={items} render={item => (
          <li key={item.exercise_id}>
            <Link href={`/gym/progress/exercises/${item.exercise_id}`} className={own.readyRow}>
              <span className={own.readyName}>{item.name}</span>
              <span className={own.readyMeta}>
                {item.sets} × {item.reps} com {formatKg(item.weight_kg)} kg · topo da faixa: {item.reps_max} reps
              </span>
            </Link>
          </li>
        )} />
    </section>
  );
}

function Completion({ data }) {
  if (!data) return null;
  return (
    <Group icon={ListChecks} title="Cumprimento da ficha">
      <Tiles tiles={[
        { label: 'Séries feitas', value: data.pct !== null ? `${data.pct}%` : '—', note: `${data.done_sets} de ${data.planned_sets} planejadas` },
        { label: 'Séries extras', value: String(data.extra_sets), note: data.extra_sets ? 'além do planejado' : 'nenhuma' },
      ]} />
      {data.exercises.length > 0 && (
        <LimitedList className={styles.list} items={data.exercises} render={e => (
            <li key={e.exercise_id} className={own.line}>
              <span className={styles.rowMain}>
                <span className={styles.rowName}>{e.name}</span>
                <span className={styles.rowMeta}>
                  {[e.skipped && `pulado ${e.skipped}×`, e.incomplete && `incompleto ${e.incomplete}×`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={own.lineValue}>{formatKg(e.avg_sets)}<small>/{e.target_sets}</small></span>
            </li>
          )} />
      )}
    </Group>
  );
}

function RepRange({ data }) {
  if (!data) return null;
  const total = data.in_range + data.below + data.above;
  const parts = [
    { key: 'below', label: 'Abaixo', value: data.below, className: own.below },
    { key: 'in_range', label: 'Dentro', value: data.in_range, className: own.inside },
    { key: 'above', label: 'Acima', value: data.above, className: own.above },
  ];
  return (
    <Group icon={Target} title="Faixa de repetições">
      <div className={own.stack} role="img" aria-label={parts.map(p => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(', ')}>
        {parts.filter(p => p.value).map(p => (
          <span key={p.key} className={`${own.stackPart} ${p.className}`} style={{ flexGrow: p.value }} />
        ))}
      </div>
      <div className={own.legend}>
        {parts.map(p => (
          <span key={p.key}><i className={p.className} /> {p.label} <strong>{Math.round((p.value / total) * 100)}%</strong></span>
        ))}
      </div>
      <p className={own.hint}>Das {plural(total, 'série', 'séries')} feitas com esta ficha, comparadas com a faixa de reps de cada exercício.</p>
    </Group>
  );
}

function TimeGroup({ time }) {
  if (!time) return null;
  const longest = time.longest_exercises[0];
  return (
    <Group icon={Timer} title="Tempo">
      <Tiles tiles={[
        { label: 'Por série', value: formatSeconds(time.avg_set_seconds), note: 'execução estimada' },
        { label: 'Preparação', value: formatSeconds(time.avg_prep_seconds), note: 'por exercício' },
        { label: 'Por exercício', value: formatSeconds(time.avg_exercise_seconds), note: 'em média' },
        { label: 'Descanso real', value: formatSeconds(time.avg_rest_seconds), note: 'entre séries' },
      ]} />
      {longest && (
        <p className={own.hint}>Exercício que mais toma tempo: <strong>{longest.name}</strong>, {formatSeconds(longest.avg_seconds)} em média.</p>
      )}
    </Group>
  );
}

function VolumeShare({ items }) {
  if (items.length < 2) return null;
  return (
    <Group icon={ChartBar} title="Volume por exercício">
      <LimitedList className={own.shares} items={items} render={item => (
          <li key={`${item.exercise_id}-${item.name}`} className={own.share}>
            <span className={own.shareTop}>
              <span className={own.shareName}>{item.name}</span>
              <span className={own.shareValue}>{Math.round(item.share * 100)}%</span>
            </span>
            <span className={own.track}><span className={own.fill} style={{ width: `${item.share * 100}%` }} /></span>
            <span className={styles.rowMeta}>{formatVolume(item.volume_kg)} no total</span>
          </li>
        )} />
    </Group>
  );
}

function Records({ items }) {
  if (!items.length) return null;
  return (
    <Group icon={Trophy} title={`Recordes com esta ficha · ${items.length}`}>
      <LimitedList className={styles.list} items={items} render={r => (
          <li key={`${r.session_id}-${r.name}`}>
            <Link href={`/gym/history/${r.session_id}`} className={styles.row}>
              <span className={styles.rowDate}>{formatDay(r.date)}</span>
              <span className={styles.rowMain}>
                <span className={styles.rowName}>{r.name}</span>
                <span className={styles.rowMeta}>{formatKg(r.weight_kg)} kg × {r.reps} · antes {formatKg(r.previous_kg)} kg</span>
              </span>
              <span className={`${styles.rowDelta} ${styles.up}`}>+{formatKg(Math.round((r.weight_kg - r.previous_kg) * 100) / 100)}</span>
            </Link>
          </li>
        )} />
    </Group>
  );
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
    data.load_pct !== null && { label: 'Progressão de carga', value: signedPct(data.load_pct), note: 'média dos exercícios' },
    data.reps_pct !== null && { label: 'Progressão de reps', value: signedPct(data.reps_pct), note: 'média dos exercícios' },
    data.avg_volume_kg !== null && { label: 'Volume médio', value: formatVolume(data.avg_volume_kg), note: 'por treino' },
    data.avg_minutes !== null && { label: 'Duração média', value: minutes(data.avg_minutes), note: 'por treino' },
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
            <Group icon={LayoutGrid} title="Resumo">
              <Tiles tiles={tiles} />
            </Group>
          )}

          <Ready items={data.ready_to_progress ?? []} />
          <Completion data={data.completion} />
          <RepRange data={data.rep_range} />
          <TimeGroup time={data.time} />
          <CardioGroup data={data.cardio} />
          <VolumeShare items={data.volume_share ?? []} />
          <Records items={data.records ?? []} />

          {exercises.length > 0 && (
            <section className={styles.sessions}>
              <h2 className={styles.sectionTitle}>Exercícios</h2>
              <LimitedList className={styles.list} items={exercises} render={e => {
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
                }} />
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
