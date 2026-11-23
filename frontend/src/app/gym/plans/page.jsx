'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, CalendarRange, Check } from 'lucide-react';
import { getPlans, activatePlan, peekCache } from '../../../lib/api';
import { apiError, plural, WEEKDAY_SHORT } from '../../../lib/gym';
import { useToast } from '../../../components/Toast';
import SegmentTabs, { WORKOUT_TABS } from '../../../components/gym/SegmentTabs';
import Floating from '../../../components/Floating';
import styles from './plans.module.css';

function WeekPreview({ plan }) {
  const byDay = WEEKDAY_SHORT.map((_, weekday) => plan.days.filter(day => day.weekday === weekday));
  return (
    <ol className={styles.week}>
      {byDay.map((days, weekday) => (
        <li key={WEEKDAY_SHORT[weekday]} className={`${styles.weekDay} ${days.length ? styles.weekDayOn : ''}`}>
          <span className={styles.weekLabel}>{WEEKDAY_SHORT[weekday]}</span>
          <span className={styles.weekNames}>
            {days.length ? days.map(day => <span key={day.workout_id}>{day.workout_name}</span>) : <span className={styles.weekRest}>—</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function PlansPage() {
  const toast = useToast();
  const [plans, setPlans] = useState(() => peekCache('fitnessPlans') ?? null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const fetchPlans = useCallback(() => {
    setLoadError(false);
    return getPlans().then(setPlans).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getPlans().then(setPlans).catch(() => setLoadError(true));
  }, []);

  const activate = async (plan) => {
    setBusyId(plan.id);
    try {
      await activatePlan(plan.id);
      setPlans(await getPlans());
      toast(`${plan.name} agora é o plano ativo`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível ativar o plano.') });
    }
    setBusyId(null);
  };

  return (
    <div className={styles.page}>
      <h1 className="visually-hidden">Treinos: planos</h1>
      <div className={styles.toolbar}>
        <div className={styles.toolbarTabs}><SegmentTabs tabs={WORKOUT_TABS} label="Treinos" /></div>
        <Link href="/gym/plans/new" className={styles.newDesktop}><Plus size={18} strokeWidth={2.4} /> Novo plano</Link>
      </div>

      {loadError && !plans && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Não foi possível carregar os planos.</p>
          <button type="button" className={styles.stateLink} onClick={fetchPlans}>Tentar de novo</button>
        </div>
      )}

      {!plans && !loadError && (
        <div className={styles.skeletons} aria-busy="true" aria-label="Carregando planos">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      )}

      {plans?.length === 0 && (
        <div className={styles.state}>
          <CalendarRange size={34} className={styles.stateIcon} aria-hidden="true" />
          <p className={styles.stateTitle}>Monte sua semana</p>
          <p className={styles.stateText}>
            Crie um plano, como &quot;Treino 1&quot;, e diga qual ficha você faz em cada dia: Upper A na segunda, Lower A na terça…
            A ficha do dia aparece no início.
          </p>
          <Link href="/gym/plans/new" className={styles.stateLink}>Criar plano</Link>
        </div>
      )}

      {plans?.length > 0 && (
        <ul className={styles.list}>
          {plans.map(plan => (
            <li key={plan.id} className={`${styles.card} ${plan.is_active ? styles.cardActive : ''}`}>
              <Link href={`/gym/plans/${plan.id}`} className={styles.cardLink}>
                <span className={styles.cardTop}>
                  <span className={styles.cardName}>{plan.name}</span>
                  {plan.is_active && <span className={styles.badge}><Check size={13} strokeWidth={3} /> Ativo</span>}
                </span>
                <span className={styles.cardMeta}>
                  {plural(new Set(plan.days.map(d => d.weekday)).size, 'dia de treino', 'dias de treino')} · {plural(plan.days.reduce((sum, d) => sum + d.total_sets, 0), 'série', 'séries')} por semana
                </span>
                <WeekPreview plan={plan} />
              </Link>
              {!plan.is_active && (
                <button type="button" className={styles.activate} onClick={() => activate(plan)} disabled={busyId === plan.id}>
                  {busyId === plan.id ? 'Ativando…' : 'Usar este plano'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Floating>
        <Link href="/gym/plans/new" className={styles.fab} aria-label="Novo plano">
          <Plus size={26} strokeWidth={2.4} />
        </Link>
      </Floating>
    </div>
  );
}
