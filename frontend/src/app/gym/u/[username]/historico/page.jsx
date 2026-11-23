'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getCloseHistory } from '../../../../../lib/api';
import { apiError, formatVolume, plural } from '../../../../../lib/gym';
import CloseHeader from '../../../../../components/gym/social/CloseHeader';
import styles from '../../../../../components/gym/social/close.module.css';

const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric' });
const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', month: 'short' });

export default function CloseHistoryPage() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    getCloseHistory(username).then(setData).catch((err) => setError(apiError(err, 'Não foi possível carregar o histórico.')));
  }, [username]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await getCloseHistory(username, data.items.length);
      setData((current) => ({ ...page, items: [...current.items, ...page.items] }));
    } catch (err) {
      setError(apiError(err, 'Não foi possível carregar mais.'));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className={styles.page}>
      <CloseHeader username={username} title="Histórico" />
      {error && <p className={styles.error}>{error}</p>}
      {!data && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando histórico" />}
      {data && data.items.length === 0 && <p className={styles.muted}>Nenhum treino concluído ainda.</p>}
      {data && data.items.map((item) => {
        const when = new Date(item.started_at);
        return (
          <Link key={item.id} href={`/gym/u/${username}/treino/${item.id}`} className={styles.link}>
            <span className={styles.date}>{dayFormat.format(when)}<small>{weekdayFormat.format(when).replace('.', '')}</small></span>
            <span className={styles.rowMain}>
              <span className={styles.rowName}>{item.name}</span>
              <span className={styles.muted}>
                {plural(item.exercise_count, 'exercício', 'exercícios')} · {plural(item.total_sets, 'série', 'séries')}
                {item.volume_kg > 0 ? ` · ${formatVolume(item.volume_kg)}` : ''}
              </span>
            </span>
            <ChevronRight size={18} className={styles.muted} style={{ marginLeft: 'auto' }} />
          </Link>
        );
      })}
      {data?.has_more && (
        <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Carregando...' : 'Carregar mais'}
        </button>
      )}
    </div>
  );
}
