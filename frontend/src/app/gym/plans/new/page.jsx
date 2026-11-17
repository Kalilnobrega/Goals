'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createPlan, getWorkouts, peekCache } from '../../../../lib/api';
import { apiError } from '../../../../lib/gym';
import { useToast } from '../../../../components/Toast';
import PlanEditor from '../../../../components/gym/PlanEditor';
import styles from '../../workouts/editor.module.css';

export default function NewPlanPage() {
  const router = useRouter();
  const toast = useToast();
  const [workouts, setWorkouts] = useState(() => peekCache('fitnessWorkouts') ?? null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    getWorkouts().then(setWorkouts).catch(() => setLoadError(true));
  }, []);

  const save = async (data) => {
    try {
      await createPlan(data);
      toast('Plano criado');
      router.push('/gym/plans');
      return null;
    } catch (err) {
      return apiError(err, 'Não foi possível criar o plano.');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/gym/plans" className={styles.back}><ChevronLeft size={18} /> Planos</Link>
        <h1 className={styles.title}>Novo plano</h1>
      </div>
      {loadError && !workouts && (
        <div className={styles.state}>
          <p>Não foi possível carregar suas fichas.</p>
          <button type="button" className={styles.stateAction} onClick={() => getWorkouts().then(setWorkouts).catch(() => {})}>
            Tentar de novo
          </button>
        </div>
      )}
      {!workouts && !loadError && <div className={styles.skeletonTall} aria-busy="true" aria-label="Carregando fichas" />}
      {workouts && <PlanEditor initial={null} workouts={workouts} onSubmit={save} />}
    </div>
  );
}
