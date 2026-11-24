'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Dumbbell, Timer } from 'lucide-react';
import { sendCheer, watchLive } from '../../../../../lib/api';
import { CHEERS } from '../../../../../lib/cheers';
import { useToast } from '../../../../../components/Toast';
import { apiError, formatClock, setSummary } from '../../../../../lib/gym';
import styles from '../../../../../components/gym/social/close.module.css';
import live from './live.module.css';

const REFRESH_MS = 10000;

function currentExercise(session) {
  let latest = null;
  session.exercises.forEach((item) => {
    item.sets.forEach((entry) => {
      if (!latest || entry.created_at > latest.at) latest = { at: entry.created_at, id: item.id };
    });
  });
  return latest?.id ?? session.exercises[0]?.id ?? null;
}

export default function LiveWorkoutPage() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const [cheering, setCheering] = useState(false);
  const toast = useToast();

  const cheer = async ({ key, emoji }) => {
    setCheering(true);
    try {
      await sendCheer(username, key);
      toast(`${emoji} Incentivo enviado`);
      setTimeout(() => setCheering(false), 20000);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível enviar.') });
      setCheering(false);
    }
  };

  useEffect(() => {
    let active = true;
    const load = () => watchLive(username)
      .then((result) => { if (active) { setData(result); setError(''); } })
      .catch((err) => { if (active) setError(apiError(err, 'Não foi possível acompanhar o treino.')); });
    load();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [username]);

  const first = data?.author.name.split(' ')[0] ?? '';
  const session = data?.live ? data.session : null;
  const currentId = session ? currentExercise(session) : null;
  const seconds = (iso) => (now && iso ? (now - new Date(iso).getTime()) / 1000 : 0);
  const totalSets = session ? session.exercises.reduce((sum, item) => sum + item.sets.filter((entry) => entry.kind !== 'warmup').length, 0) : 0;

  return (
    <div className={styles.page}>
      <Link href={`/gym/u/${username}`} className={styles.back}><ChevronLeft size={18} /> Perfil</Link>
      <header className={styles.top}>
        <p className={`${styles.kicker} ${live.kicker}`}>
          {session && <span className={live.dot} aria-hidden="true" />}
          {session ? `${first} está treinando agora` : first ? `Treino de ${first}` : 'Treino ao vivo'}
        </p>
        <h1 className={styles.title}>{session ? session.name : 'Ao vivo'}</h1>
      </header>

      {error && <p className={styles.error}>{error}</p>}
      {!data && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando treino" />}

      {data && !session && (
        <section className={styles.card}>
          <p className={styles.muted}>{first} não está treinando agora. Quando começar um treino, ele aparece aqui.</p>
          <Link href={`/gym/u/${username}/historico`} className={styles.link}>Ver histórico</Link>
        </section>
      )}

      {session && (
        <>
          <div className={live.clocks}>
            <div className={live.clock}>
              <span className={live.clockLabel}>Treinando há</span>
              <span className={live.clockValue}>{formatClock(seconds(session.started_at))}</span>
            </div>
            <div className={live.clock}>
              <span className={live.clockLabel}><Timer size={13} aria-hidden="true" /> Desde a última série</span>
              <span className={live.clockValue}>{totalSets ? formatClock(seconds(data.last_activity_at)) : '—'}</span>
            </div>
          </div>

          <section className={live.cheers} aria-label="Mandar incentivo">
            <p className={styles.muted}>Mande um incentivo. Aparece na tela de {first} na hora.</p>
            <div className={live.cheerRow}>
              {CHEERS.map((item) => (
                <button key={item.key} type="button" className={live.cheer} onClick={() => cheer(item)} disabled={cheering}>
                  <span className={live.cheerEmoji} aria-hidden="true">{item.emoji}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          <ol className={live.list}>
            {session.exercises.map((item) => {
              const current = item.id === currentId;
              const tracking = item.tracking ?? 'reps';
              return (
                <li key={item.id} className={`${styles.card} ${current ? live.current : ''}`}>
                  <div className={live.exerciseHead}>
                    <span className={styles.cardTitle}>{item.exercise_name}</span>
                    {current && <span className={live.now}><Dumbbell size={12} aria-hidden="true" /> Agora</span>}
                  </div>
                  {item.sets.length ? (
                    <ul className={styles.rows}>
                      {item.sets.map((entry, index) => (
                        <li key={entry.id} className={styles.rowItem}>
                          <span className={styles.rowName}>{entry.kind === 'warmup' ? 'Aquecimento' : `Série ${index + 1}`}</span>
                          <span className={styles.rowValue}>{setSummary(entry, tracking, item.equipment === 'bodyweight')}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.muted}>Ainda não começou</p>
                  )}
                </li>
              );
            })}
          </ol>
          <p className={styles.muted}>Atualiza sozinho a cada 10 segundos.</p>
        </>
      )}
    </div>
  );
}
