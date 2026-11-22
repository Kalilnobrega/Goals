'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Link2, Timer } from 'lucide-react';
import { formatClock, formatKg, formatRest, perSide, seriesCount, setSummary, supersetTurn, SIDE_LABEL, SUPERSET_LETTERS } from '../../lib/gym';
import SessionExerciseCard from './SessionExerciseCard';
import styles from './SupersetGroup.module.css';

const shortSet = (item, entry) => {
  const tracking = item.tracking ?? 'reps';
  if (entry.kind === 'warmup') return 'Aq';
  if (tracking !== 'reps') return setSummary(entry, tracking, item.equipment === 'bodyweight');
  const side = entry.side ? `${SIDE_LABEL[entry.side]} ` : '';
  const weight = perSide(item) ? entry.weight_kg / 2 : entry.weight_kg;
  const load = item.equipment === 'bodyweight'
    ? (weight > 0 ? `PC+${formatKg(weight)}` : 'PC')
    : weight > 0 ? formatKg(weight) : 'PC';
  const stages = (entry.stages ?? []).map(stage => `+${formatKg(perSide(item) ? stage.weight_kg / 2 : stage.weight_kg)}×${stage.reps}`).join(' ');
  return `${side}${load}×${entry.reps}${stages ? ` ${stages}` : ''}`;
};

function CompactRow({ item, label, onOpen }) {
  const done = seriesCount(item.sets);
  const complete = item.target_sets && done >= item.target_sets;
  const summary = item.sets.length
    ? item.sets.map(entry => shortSet(item, entry)).join(' · ')
    : item.previous?.length
      ? `Última vez ${item.previous.map(entry => shortSet(item, entry)).join(' · ')}`
      : 'Nenhuma série ainda';
  return (
    <button type="button" className={`${styles.compact} ${complete ? styles.compactDone : ''}`} onClick={() => onOpen(item.id)} aria-label={`Abrir ${item.exercise_name}`} data-session-item={item.id}>
      <span className={styles.compactIndex}>{complete ? <Check size={15} strokeWidth={3} /> : label}</span>
      <span className={styles.compactText}>
        <span className={styles.compactName}>{item.exercise_name}</span>
        <span className={styles.compactSets}>{summary}</span>
      </span>
      {item.target_sets ? <span className={styles.compactCount}>{done}/{item.target_sets}</span> : null}
      <ChevronDown size={18} className={styles.compactChevron} aria-hidden="true" />
    </button>
  );
}

export default function SupersetGroup({ items, number, cardProps, onStartRest, onOpenRest }) {
  const turn = supersetTurn(items);
  const turnId = turn?.id ?? null;
  const counts = items.map(item => seriesCount(item.sets));
  const stage = `${turnId}:${items.map(item => item.sets.length).join(',')}`;
  const [choice, setChoice] = useState({ id: null, stage });
  const openId = choice.stage === stage && choice.id !== null ? choice.id : turnId;
  const rounds = Math.max(0, ...items.map(item => item.target_sets ?? 0));
  const done = Math.min(...counts);
  const roundEnded = done > 0 && counts.every(count => count === done);
  const round = rounds ? Math.min(done + 1, rounds) : done + 1;
  const last = items.at(-1);
  const groupRef = useRef(null);
  const previousOpen = useRef(openId);

  useEffect(() => {
    if (previousOpen.current === openId) return;
    previousOpen.current = openId;
    if (!openId) return;
    const card = groupRef.current?.querySelector(`[data-session-item="${openId}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [openId]);

  const open = (id) => setChoice({ id, stage });

  return (
    <section ref={groupRef} className={styles.group} aria-label={`Superset ${number}`}>
      <header className={styles.header}>
        <span className={styles.title}>
          <Link2 size={15} aria-hidden="true" />
          Superset
          <small>{turn ? (rounds ? `Rodada ${round} de ${rounds}` : `Rodada ${round}`) : 'Rodadas feitas'}</small>
        </span>
        <button
          type="button"
          className={styles.restChip}
          onClick={() => onOpenRest(last)}
          aria-label={`Descanso da rodada: ${last.rest_seconds ? formatRest(last.rest_seconds) : 'sem tempo definido'}`}
        >
          <Timer size={14} /> {last.rest_seconds ? formatRest(last.rest_seconds) : '—'}
        </button>
      </header>
      <div className={styles.cards}>
        {items.map((item, position) => {
          const label = `${number}${SUPERSET_LETTERS[position]}`;
          return item.id === openId ? (
            <SessionExerciseCard
              key={item.id}
              item={item}
              index={number - 1}
              label={label}
              turn={item.id === turnId}
              {...cardProps}
              onStartRest={undefined}
              onOpenRest={undefined}
            />
          ) : (
            <CompactRow key={item.id} item={item} label={label} onOpen={open} />
          );
        })}
      </div>
      <button
        type="button"
        className={`${styles.rest} ${roundEnded && turn ? styles.restReady : ''}`}
        onClick={() => onStartRest(items)}
      >
        <Timer size={18} />
        <span>
          {roundEnded && turn ? `Rodada ${done} feita · descansar` : 'Descansar no fim da rodada'}
        </span>
        <strong>{formatClock(last.rest_seconds ?? 0)}</strong>
      </button>
    </section>
  );
}
