'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getPlan, getWorkouts, updatePlan, deletePlan, peekCache } from '../../../../lib/api';
import { apiError } from '../../../../lib/gym';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import PlanEditor from '../../../../components/gym/PlanEditor';
import styles from '../../workouts/editor.module.css';

export default function PlanPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const confirmAction = useConfirm();
  const [plan, setPlan] = useState(() => peekCache(`fitnessPlan:${id}`) ?? null);
  const [workouts, setWorkouts] = useState(() => peekCache('fitnessWorkouts') ?? null);
  const [status, setStatus] = useState('loading');

  const load = useCallback(() => {
    setStatus('loading');
    Promise.all([getPlan(id), getWorkouts()])
      .then(([planData, workoutData]) => {
        setPlan(planData);
        setWorkouts(workoutData);
        setStatus('ready');
      })
      .catch(err => setStatus(err?.response?.status === 404 ? 'missing' : 'error'));
  }, [id]);

  useEffect(() => {
    Promise.all([getPlan(id), getWorkouts()])
      .then(([planData, workoutData]) => {
        setPlan(planData);
        setWorkouts(workoutData);
        setStatus('ready');
      })
      .catch(err => setStatus(err?.response?.status === 404 ? 'missing' : 'error'));
  }, [id]);

  const save = async (data) => {
    try {
      await updatePlan(id, data);
      toast('Plano salvo');
      router.push('/gym/plans');
      return null;
    } catch (err) {
      return apiError(err, 'Não foi possível salvar o plano.');
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: 'Excluir plano',
      message: [<><strong>{plan.name}</strong> será excluído. As fichas e os treinos já registrados continuam.</>],
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deletePlan(id);
      toast('Plano excluído');
      router.push('/gym/plans');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível excluir o plano.') });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/gym/plans" className={styles.back}><ChevronLeft size={18} /> Planos</Link>
        <h1 className={styles.title}>{plan && status !== 'missing' ? 'Editar plano' : 'Plano'}</h1>
      </div>

      {status === 'missing' && (
        <div className={styles.state}>
          <p>Esse plano não existe ou foi excluído.</p>
          <Link href="/gym/plans" className={styles.stateAction}>Ver seus planos</Link>
        </div>
      )}

      {status === 'error' && !plan && (
        <div className={styles.state}>
          <p>Não foi possível carregar o plano.</p>
          <button type="button" className={styles.stateAction} onClick={load}>Tentar de novo</button>
        </div>
      )}

      {status === 'loading' && !(plan && workouts) && (
        <div className={styles.top} aria-busy="true" aria-label="Carregando plano">
          <div className={styles.skeleton} />
          <div className={styles.skeletonTall} />
        </div>
      )}

      {plan && workouts && status !== 'missing' && (
        <PlanEditor key={plan.id} initial={plan} workouts={workouts} onSubmit={save} onDelete={remove} />
      )}
    </div>
  );
}
