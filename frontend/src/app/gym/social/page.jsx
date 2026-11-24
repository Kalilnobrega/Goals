'use client';
import { useCallback, useEffect, useState } from 'react';
import { Newspaper, Plus } from 'lucide-react';
import { getFeed, getFitnessProfile, peekCache } from '../../../lib/api';
import { apiError } from '../../../lib/gym';
import SocialTabs from '../../../components/gym/social/SocialTabs';
import UsernameSetup from '../../../components/gym/social/UsernameSetup';
import PostCard from '../../../components/gym/social/PostCard';
import { SocialActionButton, SocialActionFab } from '../../../components/gym/social/SocialAction';
import LiveNow from '../../../components/gym/social/LiveNow';
import social from '../../../components/gym/social/social.module.css';
import styles from './feed.module.css';

export default function FeedPage() {
  const [profile, setProfile] = useState(() => peekCache('fitnessProfile'));
  const [feed, setFeed] = useState(() => peekCache('fitnessFeed'));
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(() => {
    getFeed().then(setFeed).catch((err) => setError(apiError(err, 'Não foi possível carregar o feed.')));
  }, []);

  useEffect(() => {
    getFitnessProfile()
      .then((data) => {
        setProfile(data);
        if (data.username) load();
      })
      .catch(() => setError('Não foi possível carregar o Social.'));
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await getFeed(feed.next_before);
      setFeed((current) => ({ posts: [...current.posts, ...page.posts], next_before: page.next_before }));
    } catch (err) {
      setError(apiError(err, 'Não foi possível carregar mais posts.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const replace = (post) => setFeed((current) => ({ ...current, posts: current.posts.map((p) => (p.id === post.id ? post : p)) }));
  const drop = (post) => setFeed((current) => ({ ...current, posts: current.posts.filter((p) => p.id !== post.id) }));

  return (
    <div className={styles.page}>
      <h1 className="visually-hidden">Social: feed</h1>

      <div className={social.toolbar}>
        <SocialTabs />
        {profile?.username && <SocialActionButton href="/gym/social/publicar" label="Publicar" icon={Plus} />}
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {!profile && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando" />}
      {profile && !profile.username && <UsernameSetup />}

      {profile?.username && (
        <>
          <SocialActionFab href="/gym/social/publicar" label="Publicar" icon={Plus} />
          <LiveNow />

          {!feed && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando feed" />}

          {feed && feed.posts.length === 0 && (
            <section className={styles.empty}>
              <Newspaper size={26} />
              <p className={styles.emptyTitle}>Nada por aqui ainda</p>
              <p className={styles.emptyText}>
                Publique seu treino com uma foto. Os posts dos seus amigos e de quem está nos seus desafios aparecem aqui.
              </p>
            </section>
          )}

          {feed && feed.posts.length > 0 && (
            <div className={styles.list}>
              {feed.posts.map((post) => (
                <PostCard key={post.id} post={post} onChange={replace} onDeleted={drop} />
              ))}
              {feed.next_before && (
                <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Carregando...' : 'Carregar mais'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
