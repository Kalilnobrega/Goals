'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Copy } from 'lucide-react';
import { copyPostWorkout, getPostWorkout } from '../../../../../../lib/api';
import { apiError } from '../../../../../../lib/gym';
import SessionSummary from '../../../../../../components/gym/SessionSummary';
import { useToast } from '../../../../../../components/Toast';
import styles from './workout.module.css';

export default function PostWorkoutPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [copying, setCopying] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const copy = async () => {
    setCopying(true);
    try {
      const result = await copyPostWorkout(id);
      toast(result.skipped
        ? `Ficha "${result.name}" criada. ${result.skipped === 1 ? '1 exercício personalizado ficou' : `${result.skipped} exercícios personalizados ficaram`} de fora.`
        : `Ficha "${result.name}" criada`);
      router.push(`/gym/workouts/${result.workout_id}`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível copiar a ficha.') });
      setCopying(false);
    }
  };

  useEffect(() => {
    getPostWorkout(id)
      .then(setData)
      .catch((err) => setError(err.response?.status === 404 ? 'Treino não encontrado.' : apiError(err, 'Não foi possível carregar o treino.')));
  }, [id]);

  return (
    <div className={styles.page}>
      <Link href={`/gym/social/post/${id}`} className={styles.back}><ChevronLeft size={18} /> Post</Link>
      {error && <p className={styles.error}>{error}</p>}
      {!data && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando treino" />}
      {data && (
        <>
          <header className={styles.top}>
            <p className={styles.kicker}>
              {data.is_mine ? 'Seu treino' : (
                <>Treino de {data.author.username ? <Link href={`/gym/u/${data.author.username}`}>{data.author.name}</Link> : data.author.name}</>
              )}
            </p>
            <h1 className={styles.title}>{data.session.name}</h1>
          </header>
          {!data.is_mine && (
            <button type="button" className={styles.copy} onClick={copy} disabled={copying}>
              <Copy size={17} /> {copying ? 'Copiando...' : 'Copiar para minhas fichas'}
            </button>
          )}
          <SessionSummary session={data.session} insights={{ records: data.records, muscle_sets: data.muscle_sets }} />
        </>
      )}
    </div>
  );
}
