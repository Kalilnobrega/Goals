'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Camera, CheckCircle2, ChevronRight, Clock, Dumbbell, MapPin } from 'lucide-react';
import { getChallengeActivity } from '../../../lib/api';
import { apiError, formatDay, formatVolume, plural } from '../../../lib/gym';
import Avatar from './Avatar';
import { PostPhotos } from './PostCard';
import { SocialActionButton, SocialActionFab } from './SocialAction';
import styles from './ChallengeActivity.module.css';

function ActivityCard({ item, challengeId, active }) {
  const isWorkout = item.kind === 'workout';
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <Avatar name={item.author.name} />
        <span className={styles.who}>
          <span className={styles.name}>{item.is_mine ? 'Você' : item.author.name}</span>
          <span className={styles.meta}>{formatDay(item.day)} · {isWorkout ? 'Treino no app' : 'Check-in manual'}</span>
        </span>
        {item.counts ? (
          <span className={styles.counts}><CheckCircle2 size={14} /> Conta</span>
        ) : (
          <span className={styles.notCounts}>Não conta</span>
        )}
      </header>

      <div className={styles.summary}>
        <span className={styles.icon}>{isWorkout ? <Dumbbell size={16} /> : <MapPin size={16} />}</span>
        <span className={styles.text}>
          <span className={styles.title}>{item.name}</span>
          <span className={styles.line}>
            <Clock size={12} />
            <span>
              {item.minutes} min
              {isWorkout ? ` · ${plural(item.exercises, 'exercício', 'exercícios')}` : ''}
              {isWorkout && item.volume_kg > 0 ? ` · ${formatVolume(item.volume_kg)}` : ''}
            </span>
          </span>
          {item.highlights.length > 0 && <span className={styles.highlights}>{item.highlights.join(' · ')}</span>}
        </span>
        {isWorkout && (
          <Link href={`/gym/social/desafios/${challengeId}/treino/${item.session_id}`} className={styles.link}>
            Ver treino <ChevronRight size={14} />
          </Link>
        )}
      </div>

      {item.caption && <p className={styles.caption}>{item.caption}</p>}
      {item.media.length > 0 && <PostPhotos media={item.media} />}

      {!item.counts && (
        <p className={styles.hint}>Não cumpriu o treino mínimo do desafio.</p>
      )}
      {isWorkout && item.is_mine && !item.post_id && active && (
        <Link href={`/gym/social/publicar?sessao=${item.session_id}&desafio=${challengeId}`} className={styles.addPhoto}>
          <Camera size={16} /> Adicionar foto
        </Link>
      )}
      {item.post_id && (
        <Link href={`/gym/social/post/${item.post_id}`} className={styles.comments}>Ver post e comentários</Link>
      )}
    </article>
  );
}

export default function ChallengeActivity({ challenge }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(() => {
    getChallengeActivity(challenge.id).then(setData).catch((err) => setError(apiError(err, 'Não foi possível carregar a atividade.')));
  }, [challenge.id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await getChallengeActivity(challenge.id, Number(data.next_before));
      setData((current) => ({ items: [...current.items, ...page.items], next_before: page.next_before }));
    } catch (err) {
      setError(apiError(err, 'Não foi possível carregar mais.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const canCheckin = challenge.allow_manual && challenge.status === 'active';

  return (
    <section className={styles.wrap}>
      {canCheckin && (
        <>
          <div className={styles.desktopAction}>
            <SocialActionButton href={`/gym/social/publicar?checkin=1&desafio=${challenge.id}`} label="Fazer check-in manual" icon={Camera} />
          </div>
          <SocialActionFab href={`/gym/social/publicar?checkin=1&desafio=${challenge.id}`} label="Fazer check-in manual" icon={Camera} />
        </>
      )}
      {error && <p className={styles.error}>{error}</p>}
      {!data && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando atividade" />}
      {data && data.items.length === 0 && (
        <p className={styles.empty}>
          {challenge.status === 'upcoming'
            ? 'O desafio ainda não começou. Os treinos aparecem aqui a partir do primeiro dia.'
            : 'Ninguém treinou ainda. Os treinos feitos no app aparecem aqui automaticamente.'}
        </p>
      )}
      {data && data.items.map((item) => (
        <ActivityCard
          key={item.id}
          item={item}
          challengeId={challenge.id}
          active={challenge.status !== 'finished'}
        />
      ))}
      {data?.next_before && (
        <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Carregando...' : 'Carregar mais'}
        </button>
      )}
    </section>
  );
}
