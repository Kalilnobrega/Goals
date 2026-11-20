'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Trophy, Activity } from 'lucide-react';
import {
  setSummary,
  formatDay, formatDelta, formatDuration, formatKg, formatLongDate, formatSets, formatTime, formatVolume, muscleName, plural, seriesCount, seriesRows, SIDE_LABEL, formatSeconds, groupsLabel,
} from '../../lib/gym';
import BodyMap, { BodyTypeToggle, useBodyType } from './BodyMap';
import UnilateralTag from './UnilateralTag';
import styles from './SessionSummary.module.css';

const percent = (now, before) => (before > 0 ? ((now - before) / before) * 100 : null);

const formatPercent = (value) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatKg(Math.round(Math.abs(value) * 10) / 10)}%`;

function Delta({ value, base, unit = 'kg', minutes = false }) {
  if (value === null || value === undefined || Math.abs(value) < 0.05) return null;
  const text = minutes
    ? `${value > 0 ? '+' : '−'}${formatDuration(Math.abs(value) * 60000)}`
    : unit === 'series'
      ? `${value > 0 ? '+' : '−'}${Math.abs(value)}`
      : formatDelta(value, unit);
  const change = base ? percent(base + value, base) : null;
  return (
    <span className={`${styles.delta} ${value > 0 ? styles.up : styles.down}`}>
      {text}{change !== null && ` · ${formatPercent(change)}`}
    </span>
  );
}

function averageProgress(exercises) {
  const load = [];
  const reps = [];
  exercises.forEach(({ current, previous }) => {
    if (!previous) return;
    const bothEstimated = current.estimated_1rm_kg !== null && previous.estimated_1rm_kg !== null;
    const loadChange = bothEstimated
      ? percent(current.estimated_1rm_kg, previous.estimated_1rm_kg)
      : percent(current.weight_kg, previous.weight_kg);
    if (loadChange !== null) load.push(loadChange);
    const repsChange = percent(current.reps, previous.reps);
    if (repsChange !== null) reps.push(repsChange);
  });
  const avg = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);
  return { load: avg(load), reps: avg(reps), count: Math.max(load.length, reps.length) };
}

function AverageTile({ label, value }) {
  return (
    <div className={styles.average}>
      <span className={styles.averageLabel}>{label}</span>
      {value === null
        ? <span className={styles.averageValue}>—</span>
        : <span className={`${styles.averageValue} ${value > 0 ? styles.averageUp : value < 0 ? styles.averageDown : ''}`}>{formatPercent(value)}</span>}
    </div>
  );
}

const setLabel = (weight, reps, extra = false) => `${weight > 0 ? `${extra ? 'PC + ' : ''}${formatKg(weight)} kg` : 'Peso corporal'} × ${reps}`;

function MusclesWorked({ muscleSets }) {
  const [bodyType, setBodyType] = useBodyType();
  const [selected, setSelected] = useState(null);
  const sets = Object.fromEntries(muscleSets.map(m => [m.muscle, m.sets]));
  const max = Math.max(...muscleSets.map(m => m.sets), 1);
  const colors = Object.fromEntries(muscleSets.map(m => [m.muscle, `color-mix(in srgb, var(--gym-accent) ${Math.round(25 + (m.sets / max) * 75)}%, var(--gym-surface-3))`]));

  return (
    <section className={styles.card} aria-labelledby="worked-title">
      <div className={styles.cardHeader}>
        <Activity size={16} className={styles.cardIcon} aria-hidden="true" />
        <h2 id="worked-title" className={styles.cardTitle}>Músculos trabalhados</h2>
        <BodyTypeToggle value={bodyType} onChange={setBodyType} />
      </div>
      <BodyMap
        colors={colors}
        sex={bodyType}
        compact
        selected={selected}
        onSelect={key => setSelected(current => (current === key ? null : key))}
        describe={key => (sets[key] ? formatSets(sets[key]) : 'não trabalhado')}
      />
      <p className={styles.selection} aria-live="polite">
        {selected
          ? <><strong>{muscleName(selected)}</strong> · {sets[selected] ? formatSets(sets[selected]) : 'não trabalhado neste treino'}</>
          : 'Toque num músculo para ver as séries'}
      </p>
    </section>
  );
}

export default function SessionSummary({ session, insights }) {
  const done = session.exercises.filter(item => item.sets.length > 0);
  const duration = new Date(session.completed_at) - new Date(session.started_at);
  const previous = insights?.previous_session ?? null;
  const byItem = new Map((insights?.exercises ?? []).map(e => [e.item_id, e]));

  return (
    <div className={styles.summary}>
      <p className={styles.date}>
        {formatLongDate(session.started_at)} · {formatTime(session.started_at)}–{formatTime(session.completed_at)}
      </p>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatDuration(duration)}</span>
          <span className={styles.statLabel}>Duração</span>
          {previous && <Delta value={insights.minutes - previous.minutes} minutes />}
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{done.length}</span>
          <span className={styles.statLabel}>{done.length === 1 ? 'Exercício' : 'Exercícios'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{session.total_sets}</span>
          <span className={styles.statLabel}>{session.total_sets === 1 ? 'Série' : 'Séries'}</span>
          {previous && <Delta value={session.total_sets - previous.sets} unit="series" />}
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatVolume(session.volume_kg)}</span>
          <span className={styles.statLabel}>Volume</span>
          {previous && <Delta value={session.volume_kg - previous.volume_kg} />}
        </div>
      </div>

      {insights?.time && (
        <div className={styles.split} aria-label="Divisão do tempo do treino">
          {[
            { label: 'Preparação', value: insights.time.prep_seconds, hint: 'troca, espera e ajuste' },
            { label: 'Séries', value: insights.time.work_seconds, hint: insights.set_seconds ? `${formatSeconds(insights.set_seconds)} por série` : null },
            { label: 'Descanso', value: insights.time.rest_seconds, hint: insights.rest_seconds ? `${formatSeconds(insights.rest_seconds)} em média` : null },
          ].map(part => (
            <div key={part.label} className={styles.splitPart}>
              <span className={styles.splitValue}>{formatSeconds(part.value)}</span>
              <span className={styles.splitLabel}>{part.label}</span>
              {part.hint && <span className={styles.splitHint}>{part.hint}</span>}
            </div>
          ))}
        </div>
      )}

      {previous && (
        <p className={styles.compare}>
          Comparado com a última vez, em <Link href={`/gym/history/${previous.id}`}>{formatDay(previous.date)}</Link>
        </p>
      )}

      {insights?.records.length > 0 && (
        <section className={`${styles.card} ${styles.records}`} aria-labelledby="records-title">
          <div className={styles.cardHeader}>
            <Trophy size={16} className={styles.cardIcon} aria-hidden="true" />
            <h2 id="records-title" className={styles.cardTitle}>{insights.records.length === 1 ? 'Novo recorde' : `${insights.records.length} novos recordes`}</h2>
          </div>
          <ul className={styles.recordList}>
            {insights.records.map(record => (
              <li key={record.name} className={styles.record}>
                <span className={styles.recordName}>{record.name}</span>
                <span className={styles.recordValue}>
                  {formatKg(record.weight_kg)} kg × {record.reps}
                  <small>+{formatKg(Math.round((record.weight_kg - record.previous_kg) * 100) / 100)} kg</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights?.muscle_sets.length > 0 && <MusclesWorked muscleSets={insights.muscle_sets} />}

      <ul className={styles.list}>
        {done.map(item => {
          const timed = (item.tracking ?? 'reps') !== 'reps';
          const insight = timed ? null : byItem.get(item.id);
          const now = insight?.current;
          const before = insight?.previous;
          return (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemHeader}>
                <span className={styles.itemName}>{item.exercise_name}</span>
                <span className={styles.itemMeta}>
                  {groupsLabel(item)} · {plural(seriesCount(item.sets), 'série', 'séries')}
                  {insight?.seconds ? ` · ${formatSeconds(insight.seconds)}${insight.prep_seconds >= 60 ? ` (${formatSeconds(insight.prep_seconds)} de preparação)` : ''}` : ''}
                  {insight?.rest_seconds ? ` · descanso ${formatSeconds(insight.rest_seconds)}` : ''}
                  {item.unilateral && <>{' '}<UnilateralTag /></>}
                </span>
              </div>
              <div className={styles.sets}>
                {seriesRows(item.sets).map(row => (
                  <span key={row.key} className={styles.set}>
                    {timed
                      ? setSummary(row.entry ?? row.left ?? row.right, item.tracking, item.equipment === 'bodyweight')
                      : row.entry
                      ? setLabel(row.entry.weight_kg, row.entry.reps, item.equipment === 'bodyweight')
                      : ['left', 'right'].filter(side => row[side]).map(side => `${SIDE_LABEL[side]} ${setLabel(row[side].weight_kg, row[side].reps, item.equipment === 'bodyweight')}`).join(' · ')}
                  </span>
                ))}
              </div>
              {item.note && <p className={styles.note}>“{item.note}”</p>}
              {now && (
                <dl className={styles.perf}>
                  <div>
                    <dt>Melhor série</dt>
                    <dd>{setLabel(now.weight_kg, now.reps)} {before && <Delta value={now.weight_kg - before.weight_kg} />}</dd>
                  </div>
                  <div>
                    <dt>Volume</dt>
                    <dd>{formatVolume(now.volume_kg)} {before && <Delta value={now.volume_kg - before.volume_kg} />}</dd>
                  </div>
                  {now.estimated_1rm_kg !== null && (
                    <div>
                      <dt>1RM estimado</dt>
                      <dd>
                        {formatKg(now.estimated_1rm_kg)} kg{' '}
                        {before?.estimated_1rm_kg != null && <Delta value={now.estimated_1rm_kg - before.estimated_1rm_kg} />}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              {insight && (
                <p className={styles.perfNote}>
                  {before
                    ? <>Antes, em <Link href={`/gym/history/${before.session_id}`}>{formatDay(before.date)}</Link>: {setLabel(before.weight_kg, before.reps)} · {formatVolume(before.volume_kg)}</>
                    : 'Primeira vez registrando este exercício'}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
