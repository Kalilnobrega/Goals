'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { copyShare, deleteShare, getShare } from '../../../../../lib/api';
import { apiError } from '../../../../../lib/gym';
import { timeAgo } from '../../../../../lib/photos';
import { useToast } from '../../../../../components/Toast';
import Avatar from '../../../../../components/gym/social/Avatar';
import SharedCard from '../../../../../components/gym/social/SharedCard';
import styles from '../../../../../components/gym/social/close.module.css';

export default function ReceivedSharePage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getShare(id).then(setItem).catch((err) => setError(err.response?.status === 404 ? 'Não encontrado.' : apiError(err, 'Não foi possível carregar.')));
  }, [id]);

  const remove = async () => {
    try {
      await deleteShare(id);
      toast('Removido dos recebidos');
      router.replace('/gym/social/amigos');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível remover.') });
    }
  };

  return (
    <div className={styles.page}>
      <Link href="/gym/social/amigos" className={styles.back}><ChevronLeft size={18} /> Amigos</Link>
      {error && <p className={styles.error}>{error}</p>}
      {!item && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando" />}
      {item && (
        <>
          <section className={styles.card}>
            <div className={styles.rowItem} style={{ padding: 0 }}>
              <span className={styles.rowMain} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={item.sender.name} />
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{item.is_mine ? 'Você enviou' : `${item.sender.name} te enviou`}</span>
                  <span className={styles.muted}>{item.kind === 'plan' ? 'um plano' : 'uma ficha'} · {timeAgo(item.created_at)}</span>
                </span>
              </span>
            </div>
            {item.message && <p>“{item.message}”</p>}
          </section>
          <SharedCard kind={item.kind} snapshot={item.snapshot} mine={item.is_mine} onCopy={() => copyShare(item.id)} />
          {!item.is_mine && (
            <button type="button" className={styles.more} onClick={remove}><Trash2 size={15} /> Remover dos recebidos</button>
          )}
        </>
      )}
    </div>
  );
}
