'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { getNotifications, readAllNotifications } from '../../../lib/api';
import { apiError } from '../../../lib/gym';
import { timeAgo } from '../../../lib/photos';
import Avatar from '../../../components/gym/social/Avatar';
import { REACTIONS } from '../../../components/gym/social/PostCard';
import styles from './notifications.module.css';

function describe(item) {
  const name = <strong>{item.actor.name}</strong>;
  switch (item.kind) {
    case 'friend_request':
      return { text: <>{name} te enviou um pedido de amizade</>, href: '/gym/social/amigos' };
    case 'friend_accepted':
      return { text: <>{name} aceitou seu pedido de amizade</>, href: item.actor.username ? `/gym/u/${item.actor.username}` : '/gym/social/amigos' };
    case 'challenge_invite':
      return { text: <>{name} te convidou para o desafio <strong>{item.challenge_name}</strong></>, href: '/gym/social/desafios' };
    case 'challenge_joined':
      return { text: <>{name} entrou no seu desafio <strong>{item.challenge_name}</strong></>, href: `/gym/social/desafios/${item.challenge_id}` };
    case 'post_reaction': {
      const emoji = REACTIONS.find((reaction) => reaction.key === item.detail)?.emoji ?? '';
      return { text: <>{name} reagiu {emoji} ao seu post</>, href: `/gym/social/post/${item.post_id}` };
    }
    case 'shared_item':
      return {
        text: <>{name} te enviou {{ plan: 'um plano', exercise: 'um exercício' }[item.detail] ?? 'uma ficha'}</>,
        href: item.share_id ? `/gym/social/recebidos/${item.share_id}` : '/gym/social/amigos',
      };
    case 'post_comment':
      return { text: <>{name} comentou no seu post</>, href: `/gym/social/post/${item.post_id}`, preview: item.preview };
    default:
      return { text: name, href: '/gym/social' };
  }
}

export default function NotificationsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    getNotifications()
      .then((result) => {
        if (!active) return;
        setData(result);
        if (result.unread > 0) {
          readAllNotifications()
            .then(() => window.dispatchEvent(new Event('gym-notifications-read')))
            .catch(() => {});
        }
      })
      .catch((err) => setError(apiError(err, 'Não foi possível carregar as notificações.')));
    return () => { active = false; };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await getNotifications(data.next_before);
      setData((current) => ({ ...current, notifications: [...current.notifications, ...page.notifications], next_before: page.next_before }));
    } catch (err) {
      setError(apiError(err, 'Não foi possível carregar mais.'));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Notificações</h1>
      {error && <p className={styles.error}>{error}</p>}
      {!data && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando notificações" />}

      {data && data.notifications.length === 0 && (
        <section className={styles.empty}>
          <Bell size={26} />
          <p className={styles.emptyTitle}>Nada por aqui ainda</p>
          <p className={styles.emptyText}>Pedidos de amizade, convites para desafios, reações e comentários nos seus posts aparecem aqui.</p>
        </section>
      )}

      {data && data.notifications.length > 0 && (
        <ul className={styles.list}>
          {data.notifications.map((item) => {
            const { text, href, preview } = describe(item);
            return (
              <li key={item.id}>
                <Link href={href} className={`${styles.item} ${item.read ? '' : styles.unread}`}>
                  <Avatar name={item.actor.name} />
                  <span className={styles.text}>
                    <span className={styles.message}>{text}</span>
                    {preview && <span className={styles.preview}>“{preview}”</span>}
                    <span className={styles.time}>{timeAgo(item.created_at)}</span>
                  </span>
                  {!item.read && <span className={styles.dot} aria-label="Não lida" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {data?.next_before && (
        <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Carregando...' : 'Carregar mais'}
        </button>
      )}
    </div>
  );
}
