'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Play, Trash2 } from 'lucide-react';
import { getSession, getSessionInsights, deleteSession } from '../../../../lib/api';
import { apiError } from '../../../../lib/gym';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import SessionSummary from '../../../../components/gym/SessionSummary';
import useStartSession from '../../../../components/gym/useStartSession';
import s from '../../../../components/gym/sheet.module.css';
import styles from '../../workouts/editor.module.css';

export default function HistoryDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const confirmAction = useConfirm();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading');
  const [insights, setInsights] = useState(null);
  const { begin, starting, sheet } = useStartSession();

  const loaded = useCallback((data) => {
    if (data.status !== 'completed') return router.replace(`/gym/session/${data.id}`);
    setSession(data);
    setStatus('ready');
  }, [router]);

  const failed = (err) => setStatus(err?.response?.status === 404 ? 'missing' : 'error');

  const fetchSession = () => {
    setStatus('loading');
    getSession(id).then(loaded).catch(failed);
  };

  useEffect(() => {
    getSession(id).then(loaded).catch(failed);
  }, [id, loaded]);

  useEffect(() => {
    if (status !== 'ready' || !session) return;
    let active = true;
    getSessionInsights(session.id).then(result => { if (active) setInsights(result); }).catch(() => {});
    return () => { active = false; };
  }, [status, session]);

  const remove = async () => {
    const ok = await confirmAction({
      title: 'Excluir treino',
      message: [<><strong>{session.name}</strong> e todas as séries dele saem do histórico.</>],
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteSession(session.id);
      toast('Treino excluído');
      router.push('/gym/history');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível excluir o treino.') });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/gym/history" className={styles.back}><ChevronLeft size={18} /> Histórico</Link>
        {session && <h1 className={styles.title}>{session.name}</h1>}
      </div>

      {status === 'missing' && (
        <div className={styles.state}>
          <p>Esse treino não existe ou foi excluído.</p>
          <Link href="/gym/history" className={styles.stateAction}>Ver histórico</Link>
        </div>
      )}

      {status === 'error' && (
        <div className={styles.state}>
          <p>Não foi possível carregar o treino.</p>
          <button type="button" className={styles.stateAction} onClick={fetchSession}>Tentar de novo</button>
        </div>
      )}

      {status === 'loading' && (
        <div className={styles.top} aria-busy="true" aria-label="Carregando treino">
          <div className={styles.skeleton} />
          <div className={styles.skeletonTall} />
        </div>
      )}

      {status === 'ready' && (
        <>
          <SessionSummary session={session} insights={insights} />
          <div className={s.actions}>
            {session.workout_id && (
              <button type="button" className={s.primary} onClick={() => begin(session.workout_id)} disabled={starting}>
                <Play size={18} fill="currentColor" /> {starting ? 'Iniciando…' : 'Treinar de novo'}
              </button>
            )}
            <button type="button" className={s.danger} onClick={remove}>
              <Trash2 size={18} /> Excluir do histórico
            </button>
          </div>
        </>
      )}
      {sheet}
    </div>
  );
}
