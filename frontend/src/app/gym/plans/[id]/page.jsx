'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Pencil, Check, Share2 } from 'lucide-react';
import ShareSheet from '../../../../components/gym/social/ShareSheet';
import { getPlan, getWorkouts, activatePlan, deactivatePlan, peekCache } from '../../../../lib/api';
import { apiError, plural } from '../../../../lib/gym';
import { useToast } from '../../../../components/Toast';
import PlanWeek from '../../../../components/gym/PlanWeek';
import PlanSummary, { summarizePlan } from '../../../../components/gym/PlanSummary';
import PlanBodyMap, { planMuscleSets } from '../../../../components/gym/PlanBodyMap';
import styles from './plan.module.css';

export default function PlanDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const [plan, setPlan] = useState(() => peekCache(`fitnessPlan:${id}`) ?? null);
  const [workouts, setWorkouts] = useState(() => peekCache('fitnessWorkouts') ?? null);
  const [status, setStatus] = useState(plan && workouts ? 'ready' : 'loading');
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const closeShare = useCallback(() => setSharing(false), []);

  const load = useCallback(() => (
    Promise.all([getPlan(id), getWorkouts()])
      .then(([planData, workoutData]) => {
        setPlan(planData);
        setWorkouts(workoutData);
        setStatus('ready');
      })
      .catch(err => setStatus(err?.response?.status === 404 ? 'missing' : 'error'))
  ), [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async () => {
    setBusy(true);
    try {
      const updated = plan.is_active ? await deactivatePlan(plan.id) : await activatePlan(plan.id);
      setPlan(updated);
      toast(updated.is_active ? `${updated.name} agora é o plano ativo` : `${updated.name} não está mais ativo`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível mudar o plano ativo.') });
    }
    setBusy(false);
  };

  const back = <Link href="/gym/plans" className={styles.back}><ChevronLeft size={18} /> Planos</Link>;

  if (status === 'missing' || (status === 'error' && !plan)) {
    return (
      <div className={styles.page}>
        {back}
        <div className={styles.state}>
          <p>{status === 'missing' ? 'Esse plano não existe ou foi excluído.' : 'Não foi possível carregar o plano.'}</p>
          {status === 'error' && <button type="button" className={styles.stateAction} onClick={load}>Tentar de novo</button>}
        </div>
      </div>
    );
  }

  if (!plan || !workouts) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Carregando plano">
        {back}
        <div className={styles.skeleton} />
        <div className={styles.skeletonTall} />
      </div>
    );
  }

  const byId = new Map(workouts.map(w => [w.id, w]));
  const weekIds = Array.from({ length: 7 }, (_, weekday) => plan.days.filter(d => d.weekday === weekday).map(d => d.workout_id));
  const week = Array.from({ length: 7 }, (_, weekday) => plan.days
    .filter(d => d.weekday === weekday)
    .map(d => ({ id: d.workout_id, name: d.workout_name })));
  const summary = summarizePlan(weekIds, byId);
  const trainingDays = week.filter(day => day.length).length;

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        {back}
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{plan.name}</h1>
          {plan.is_active && <span className={styles.badge}><Check size={13} strokeWidth={3} /> Ativo</span>}
        </div>
        <p className={styles.subtitle}>
          {plural(trainingDays, 'dia de treino', 'dias de treino')} · {plural(7 - trainingDays, 'dia de descanso', 'dias de descanso')}
        </p>
      </div>

      <div className={styles.actions}>
        <Link href={`/gym/plans/${plan.id}/edit`} className={styles.edit}><Pencil size={18} /> Editar</Link>
        <button
          type="button"
          className={plan.is_active ? styles.secondary : styles.primary}
          onClick={toggleActive}
          disabled={busy}
        >
          {plan.is_active ? 'Desativar' : 'Usar este plano'}
        </button>
        <button type="button" className={`${styles.edit} ${styles.share}`} onClick={() => setSharing(true)} aria-label="Compartilhar" title="Compartilhar"><Share2 size={18} /></button>
      </div>

      <section className={styles.card} aria-labelledby="plan-week-title">
        <h2 id="plan-week-title" className={styles.cardTitle}>Semana</h2>
        <PlanWeek week={week} linkDays />
      </section>

      {summary.fichas.length > 0 && <PlanBodyMap sets={planMuscleSets(weekIds, byId)} />}

      {summary.fichas.length > 0 ? (
        <PlanSummary summary={summary} />
      ) : (
        <div className={styles.state}>
          <p>Nenhuma ficha nos dias deste plano ainda.</p>
          <Link href={`/gym/plans/${plan.id}/edit`} className={styles.stateAction}>Adicionar fichas</Link>
        </div>
      )}
      <ShareSheet open={sharing} onClose={closeShare} kind="plan" itemId={plan.id} />
    </div>
  );
}
