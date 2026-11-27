'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCloseHistory } from '../../../../../lib/api';
import { apiError } from '../../../../../lib/gym';
import HistoryList from '../../../../../components/gym/HistoryList';
import CloseHeader from '../../../../../components/gym/social/CloseHeader';
import styles from '../../../../../components/gym/social/close.module.css';

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
      {data && <HistoryList items={data.items} hrefOf={item => `/gym/u/${username}/treino/${item.id}`} />}
      {data?.has_more && (
        <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Carregando...' : 'Carregar mais'}
        </button>
      )}
    </div>
  );
}
