'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { getHistory, peekCache, HISTORY_PAGE } from '../../../lib/api';
import {
  formatDuration, formatMonth, formatVolume, formatWeekday, monthKey, muscleLabel, plural,
} from '../../../lib/gym';
import ActiveSessionBanner from '../../../components/gym/ActiveSessionBanner';
import styles from './page.module.css';

function groupByMonth(items) {
  const groups = [];
  items.forEach(item => {
    const key = monthKey(item.started_at);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: formatMonth(item.started_at), items: [item] });
  });
  return groups;
}

function HistoryCard({ item }) {
  const duration = new Date(item.completed_at) - new Date(item.started_at);
  const muscles = item.muscle_groups.slice(0, 3);
  const extra = item.muscle_groups.length - muscles.length;

  return (
    <li>
      <Link href={`/gym/history/${item.id}`} className={styles.card}>
        <span className={styles.day}>
          <span className={styles.dayNumber}>{new Date(item.started_at).getDate()}</span>
          <span className={styles.dayName}>{formatWeekday(item.started_at)}</span>
        </span>
        <span className={styles.cardMain}>
          <span className={styles.cardName}>{item.name}</span>
          <span className={styles.cardMeta}>
            {formatDuration(duration)} · {plural(item.exercise_count, 'exercício', 'exercícios')} · {plural(item.total_sets, 'série', 'séries')}
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

export default function HistoryPage() {
  const [data, setData] = useState(() => peekCache('fitnessHistory') ?? null);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  const fetchFirst = useCallback(() => {
    setLoadError(false);
    return getHistory().then(setData).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getHistory().then(setData).catch(() => setLoadError(true));
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await getHistory(data.items.length);
      setData(current => {
        const seen = new Set(current.items.map(item => item.id));
        return { ...page, items: [...current.items, ...page.items.filter(item => !seen.has(item.id))] };
      });
    } catch {
      setMoreError(true);
    }
    setLoadingMore(false);
  };

  const groups = data ? groupByMonth(data.items) : [];

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Histórico</h1>
        <p className={styles.subtitle}>
          {data?.total ? plural(data.total, 'treino concluído', 'treinos concluídos') : 'Seus treinos concluídos'}
        </p>
      </header>

      <ActiveSessionBanner />

      {loadError && !data && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Não foi possível carregar o histórico.</p>
          <button type="button" className={styles.stateAction} onClick={fetchFirst}>Tentar de novo</button>
        </div>
      )}

      {!data && !loadError && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando histórico">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
      )}

      {data?.items.length === 0 && (
        <div className={styles.state}>
          <History size={34} className={styles.stateIcon} aria-hidden="true" />
          <p className={styles.stateTitle}>Nenhum treino concluído ainda.</p>
          <p className={styles.stateText}>Quando você finalizar um treino, ele aparece aqui com as séries, cargas e o volume.</p>
          <Link href="/gym/workouts" className={styles.stateAction}>Começar um treino</Link>
        </div>
      )}

      {groups.map(group => (
        <section key={group.key} className={styles.month}>
          <h2 className={styles.monthTitle}>
            {group.label}
            <span>{plural(group.items.length, 'treino', 'treinos')}</span>
          </h2>
          <ul className={styles.list}>
            {group.items.map(item => <HistoryCard key={item.id} item={item} />)}
          </ul>
        </section>
      ))}

      {data?.has_more && (
        <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Carregando…' : moreError ? 'Tentar de novo' : `Ver mais ${Math.min(HISTORY_PAGE, data.total - data.items.length)}`}
        </button>
      )}
    </div>
  );
}
