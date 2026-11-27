'use client';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { formatDuration, formatKg, formatMonthThisYear, formatVolume, formatWeekday, monthKey, muscleLabel, plural } from '../../lib/gym';
import styles from './HistoryList.module.css';

function groupByMonth(items) {
  const groups = [];
  items.forEach(item => {
    const key = monthKey(item.started_at);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: formatMonthThisYear(item.started_at), items: [item] });
  });
  return groups;
}

function HistoryCard({ item, href }) {
  const duration = new Date(item.completed_at) - new Date(item.started_at);
  const muscles = item.muscle_groups.slice(0, 3);
  const extra = item.muscle_groups.length - muscles.length;

  return (
    <li>
      <Link href={href} className={styles.card}>
        <span className={styles.day}>
          <span className={styles.dayNumber}>{new Date(item.started_at).getDate()}</span>
          <span className={styles.dayName}>{formatWeekday(item.started_at)}</span>
        </span>
        <span className={styles.cardMain}>
          <span className={styles.cardName}>{item.name}</span>
          {item.gym_name && (
            <span className={styles.cardGym}>
              <Building2 size={13} aria-hidden="true" />
              <span className={styles.cardGymName}>{item.gym_name}</span>
            </span>
          )}
          <span className={styles.cardMeta}>
            {formatDuration(duration)} · {plural(item.exercise_count, 'exercício', 'exercícios')} · {plural(item.total_sets, 'série', 'séries')}
            {item.cardio_seconds >= 60 ? ` · ${Math.round(item.cardio_seconds / 60)} min de cardio` : ''}
            {item.cardio_km > 0 ? ` · ${item.cardio_km_estimated ? '≈ ' : ''}${formatKg(Math.round(item.cardio_km * 10) / 10)} km` : ''}
            {item.cardio_calories ? ` · ${item.cardio_calories_estimated ? '≈ ' : ''}${item.cardio_calories} kcal` : ''}
          </span>
          <span className={styles.cardBottom}>
            <span className={styles.muscles}>
              {muscles.map(group => <span key={group} className={styles.muscle}>{muscleLabel(group)}</span>)}
              {extra > 0 && <span className={styles.muscle}>+{extra}</span>}
            </span>
            <span className={styles.volume}>{formatVolume(item.volume_kg)}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function HistoryList({ items, hrefOf }) {
  return groupByMonth(items).map(month => (
    <section key={month.key} className={styles.month}>
      <h2 className={styles.monthTitle}>
        {month.label}
        <span>{plural(month.items.length, 'treino', 'treinos')}</span>
      </h2>
      <ul className={styles.list}>
        {month.items.map(item => <HistoryCard key={item.id} item={item} href={hrefOf(item)} />)}
      </ul>
    </section>
  ));
}
