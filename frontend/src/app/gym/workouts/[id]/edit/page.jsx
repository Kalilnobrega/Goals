'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getWorkout, updateWorkout, deleteWorkout, peekCache } from '../../../../../lib/api';
import { apiError } from '../../../../../lib/gym';
import { useToast } from '../../../../../components/Toast';
import { useConfirm } from '../../../../../components/ConfirmDialog';
import WorkoutEditor from '../../../../../components/gym/WorkoutEditor';
import styles from '../../editor.module.css';

export default function EditWorkoutPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const confirmAction = useConfirm();
  const [workout, setWorkout] = useState(() => peekCache(`fitnessWorkout:${id}`) ?? null);
  const [status, setStatus] = useState('loading');

  const fetchWorkout = useCallback(() => {
    setStatus('loading');
    return getWorkout(id)
      .then(data => { setWorkout(data); setStatus('ready'); })
      .catch(err => setStatus(err?.response?.status === 404 ? 'missing' : 'error'));
  }, [id]);

  useEffect(() => {
    getWorkout(id)
      .then(data => { setWorkout(data); setStatus('ready'); })
      .catch(err => setStatus(err?.response?.status === 404 ? 'missing' : 'error'));
  }, [id]);

  const save = async (data) => {
    try {
      await updateWorkout(id, data);
      toast('Ficha salva');
      router.push(`/gym/workouts/${id}`);
      return null;
    } catch (err) {
      return apiError(err, 'Não foi possível salvar a ficha.');
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: 'Excluir ficha',
      message: [<><strong>{workout.name}</strong> será excluída e sai dos planos em que estiver. Treinos já registrados com ela continuam no histórico.</>],
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteWorkout(id);
      toast('Ficha excluída');
      router.push('/gym/workouts');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível excluir a ficha.') });
    }
  };

  const ready = workout && status !== 'missing';

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href={`/gym/workouts/${id}`} className={styles.back}><ChevronLeft size={18} /> {workout?.name ?? 'Ficha'}</Link>
        <h1 className={styles.title}>Editar ficha</h1>
      </div>

      {status === 'missing' && (
        <div className={styles.state}>
          <p>Essa ficha não existe ou foi excluída.</p>
          <Link href="/gym/workouts" className={styles.stateAction}>Ver suas fichas</Link>
        </div>
      )}

      {status === 'error' && !workout && (
        <div className={styles.state}>
          <p>Não foi possível carregar a ficha.</p>
          <button type="button" className={styles.stateAction} onClick={fetchWorkout}>Tentar de novo</button>
        </div>
      )}

      {status === 'loading' && !workout && (
        <div className={styles.top} aria-busy="true" aria-label="Carregando ficha">
          <div className={styles.skeleton} />
          <div className={styles.skeletonTall} />
        </div>
      )}

      {ready && (
        <WorkoutEditor key={workout.id} initial={workout} onSubmit={save} onDelete={remove} />
      )}
    </div>
  );
}
