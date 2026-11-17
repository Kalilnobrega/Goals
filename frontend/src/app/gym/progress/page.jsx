'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, TrendingUp, ChevronRight } from 'lucide-react';
import { getProgressExercises, peekCache } from '../../../lib/api';
import { formatKg, formatShortDate, muscleLabel, normalize, plural } from '../../../lib/gym';
import ProgressTabs from '../../../components/gym/ProgressTabs';
import styles from './progress.module.css';

export default function ProgressPage() {
  const [items, setItems] = useState(() => peekCache('fitnessProgress') ?? null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');

  const fetchItems = useCallback(() => {
    setLoadError(false);
    return getProgressExercises().then(setItems).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getProgressExercises().then(setItems).catch(() => setLoadError(true));
  }, []);

  const visible = useMemo(() => {
    if (!items) return [];
    const term = normalize(query.trim());
    return term ? items.filter(item => normalize(item.name).includes(term)) : items;
  }, [items, query]);

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Evolução</h1>
        <p className={styles.subtitle}>Como suas cargas e seu corpo mudam com o tempo</p>
      </header>

      <ProgressTabs />

      {loadError && !items && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Não foi possível carregar sua evolução.</p>
          <button type="button" className={styles.stateAction} onClick={fetchItems}>Tentar de novo</button>
        </div>
      )}

      {!items && !loadError && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando exercícios">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
      )}

      {items?.length === 0 && (
        <div className={styles.state}>
          <TrendingUp size={34} className={styles.stateIcon} aria-hidden="true" />
          <p className={styles.stateTitle}>Nada para comparar ainda.</p>
          <p className={styles.stateText}>Finalize um treino e cada exercício feito ganha aqui um gráfico com a evolução das cargas.</p>
          <Link href="/gym/workouts" className={styles.stateAction}>Começar um treino</Link>
        </div>
      )}

      {items?.length > 0 && (
        <>
          {items.length > 6 && (
            <label className={styles.searchWrap}>
              <Search size={18} className={styles.searchIcon} aria-hidden="true" />
              <input
                type="search"
                className={styles.search}
                placeholder="Buscar exercício"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Buscar exercício"
              />
            </label>
          )}

          {visible.length === 0 ? (
            <p className={styles.empty}>Nenhum exercício treinado com esse nome.</p>
          ) : (
            <ul className={styles.list}>
              {visible.map(item => (
                <li key={item.exercise_id}>
                  <Link href={`/gym/progress/exercises/${item.exercise_id}`} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{item.name}</span>
                      <span className={styles.rowMeta}>
                        {muscleLabel(item.muscle_group)} · {plural(item.sessions, 'treino', 'treinos')} · último {formatShortDate(item.last_at)}
                      </span>
                    </span>
                    <span className={styles.rowBest}>
                      {item.best_weight_kg > 0
                        ? <>{formatKg(item.best_weight_kg)}<small>kg</small></>
                        : <>{item.max_reps}<small>reps</small></>}
                    </span>
                    <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
