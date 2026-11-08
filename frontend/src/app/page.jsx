'use client';
import { useState, useEffect, useSyncExternalStore, ViewTransition, startTransition, addTransitionType } from 'react';
import Link from 'next/link';
import HeroCalendar from '../components/HeroCalendar';
import {
  Target, CheckCircle2, Clock, TrendingUp,
  ArrowRight, Plus, Sparkles, RefreshCw, AlertTriangle, Trophy
} from 'lucide-react';
import { getGoals, getTodayTasks, toggleTask, getStreak, peekCache } from '../lib/api';
import { getUserName } from '../lib/auth';
import { useLateGoals } from '../lib/LateGoalsContext';
import { celebrateTask } from '../lib/celebrate';
import CheckMark from '../components/CheckMark';
import CountUp from '../components/CountUp';
import { formatProgressValue, hasTarget } from '../lib/numeric';
import styles from './page.module.css';

const TASK_SETTLE_MS = 450;

const fetchHome = () => Promise.all([
  getGoals(),
  getTodayTasks(),
  getStreak().catch(() => ({ current_streak: 0, longest_streak: 0 })),
]);

const subscribeToUserName = (onChange) => {
  window.addEventListener('username-changed', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('username-changed', onChange);
    window.removeEventListener('storage', onChange);
  };
};
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default function DashboardPage() {
  const [goals,   setGoals]   = useState(() => peekCache('goals') ?? []);
  const [loading, setLoading] = useState(() => !peekCache('goals') || !peekCache('today'));
  const userName = useSyncExternalStore(subscribeToUserName, getUserName, () => '');
  const [todayTasks, setTodayTasks] = useState(() => peekCache('today') ?? []);
  const [settling,   setSettling]   = useState({});
  const [popping,    setPopping]    = useState(null);
  const [longestStreak, setLongestStreak] = useState(() => peekCache('streak')?.longest_streak ?? 0);
  const { setLateCount, setStreak } = useLateGoals();

  useEffect(() => {
    fetchHome()
      .then(([gs, today, streakData]) => {
        setGoals(gs);
        setTodayTasks(today);
        setLateCount(gs.filter(g => g.status === 'late').length);
        setStreak(streakData.current_streak ?? 0);
        setLongestStreak(streakData.longest_streak ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setLateCount, setStreak]);
 
  const settle = (id) => startTransition(() => {
    addTransitionType('task-change');
    setSettling(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  });

  const handleToggle = async (item, e) => {
    if (item.id in settling) return;
    if (!item.status) {
      const rect = e.currentTarget.getBoundingClientRect();
      celebrateTask(rect.left + rect.width / 2, rect.top + rect.height / 2);
      setPopping(item.id);
    }
    const minimumDelay = wait(TASK_SETTLE_MS);
    setSettling(prev => ({ ...prev, [item.id]: item.status }));
    setTodayTasks(prev => prev.map(t => (t.id === item.id ? { ...t, status: !t.status } : t)));
    try {
      await toggleTask(item.id);
      getStreak()
        .then(s => {
          setStreak(s.current_streak ?? 0);
          setLongestStreak(s.longest_streak ?? 0);
        })
        .catch(() => {});
    } catch {
      setTodayTasks(prev => prev.map(t => (t.id === item.id ? { ...t, status: item.status } : t)));
    }
    await minimumDelay;
    settle(item.id);
  };

  const renderTodayItem = (item) => (
    <ViewTransition key={item.id} name={`today-${item.id}`} share="task-move" update={{ 'task-change': 'task-move', default: 'none' }} default="none">
      <div className={`${styles.todayItem} ${item.status ? styles.todayItemDone : ''}`}>
        <button
          className={`${styles.todayCheck} ${item.status ? styles.todayChecked : ''} ${popping === item.id ? styles.todayPop : ''}`}
          onClick={(e) => handleToggle(item, e)}
          onAnimationEnd={() => setPopping(null)}
          aria-label={item.status ? 'Desmarcar tarefa' : 'Concluir tarefa'}
        >
          <CheckMark checked={item.status} size={13} />
        </button>
        <div className={styles.todayInfo}>
          <span className={styles.todayTitle}><span className={styles.todayStrike}>{item.title}</span></span>
          <Link href={`/goals/${item.goal_id}`} className={styles.todayGoal}>
            {item.goal_title}
          </Link>
        </div>
        {item.is_recurring && !item.status && (
          <span className={styles.todayRecurring}>
            <RefreshCw size={11} />
            {item.recurrence_count}/{item.max_recurrences ?? '∞'}
          </span>
        )}
      </div>
    </ViewTransition>
  );

  const total     = goals.length;
  const completed = goals.filter(g => g.status === 'completed').length;
  const open      = goals.filter(g => g.status === 'open').length;
  const late    = goals.filter(g => g.status === 'late').length;
  const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;
  const habitCount = goals.reduce((acc, g) => acc + (g.tasks?.filter(t => t.recurrence_days)?.length ?? 0), 0);
  const firstName = userName.split(' ')[0];
  const lateGoals  = goals.filter(g => g.status === 'late');

  const recent = [...goals]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 4);

  const stats = [
    { label: 'Total de metas',  value: total,      icon: Target,       color: '#94a3b8' },
    { label: 'Concluídas',      value: completed,  icon: CheckCircle2, color: '#10b981' },
    { label: 'Em aberto',       value: open,       icon: Clock,        color: '#3b82f6' },
    { label: 'Atrasadas',        value: late,     icon: AlertTriangle,        color: '#ef4444' },
    { label: 'Taxa de sucesso', value: `${rate}%`, icon: TrendingUp,   color: '#8b5cf6' },
    { label: 'Recorde de streak', value: longestStreak, icon: Trophy,  color: '#f59e0b' },
  ];

  const placedStatus = (i) => (i.id in settling ? settling[i.id] : i.status);
  const todayPending = todayTasks.filter(i => placedStatus(i) === false);
  const todayDone    = todayTasks.filter(i => placedStatus(i) === true);

  return (
    <>
      <main className={styles.main}>

        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              <Sparkles size={14} />
              Bem-vindo de volta{firstName ? `, ${firstName}` : ''}! 👋
            </div>
            <h1 className={styles.heroTitle}>
              Suas metas,<br />
              <span className={styles.heroGradient}>seu progresso</span>
            </h1>
            <p className={styles.heroSub}>
              Acompanhe cada objetivo e celebre cada conquista.
            </p>
            <Link href="/goals" className={styles.heroBtn}>
              Ver todas as metas <ArrowRight size={16} />
            </Link>
          </div>
         
          {/* Calendário */}
          <div className={styles.heroCalendar}>
            <HeroCalendar goals={goals} />
          </div>
                
        </section>

        {/* Stats */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Resumo</h2>
            <Link href="/stats" className={styles.seeAll}>
              Ver estatísticas completas <ArrowRight size={14} />
            </Link>
          </div>
          <div className={styles.stats}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`${styles.statCard} glass ${styles.skeleton}`} />
              ))
            : stats.map((s, i) => (
              <div
                key={s.label}
                className={`${styles.statCard} glass`}
                style={{ animationDelay: `calc(var(--stagger) * ${i})` }}
              >
                <div className={styles.statIcon} style={{ '--icon-color': s.color }}>
                  <s.icon size={20} />
                </div>
                <div>
                  <div className={styles.statValue}><CountUp value={s.value} /></div>
                  <div className={styles.statLabel}>{s.label}</div>
                </div>
              </div>
            ))
          }
          </div>
        </section>
        {/* Banner metas atrasadas */}
        {!loading && lateGoals.length > 0 && (
          <div className={styles.lateBanner}>
            <div className={styles.lateBannerLeft}>
              <div className={styles.lateBannerIcon}>
                <AlertTriangle size={18} />
              </div>
              <div>
                <div className={styles.lateBannerTitle}>
                  {lateGoals.length} meta{lateGoals.length !== 1 ? 's' : ''} atrasada{lateGoals.length !== 1 ? 's' : ''}
                </div>
                <div className={styles.lateBannerSub}>
                  {lateGoals.map((g, i) => (
                    <span key={g.id}>
                      <Link href={`/goals/${g.id}`} className={styles.lateBannerLink}>
                        {g.title}
                      </Link>
                      {i < lateGoals.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <Link href="/goals?status=late" className={styles.lateBannerBtn}>
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* Hábitos ativos */}
        {!loading && habitCount > 0 && (
          <div className={`${styles.habitBanner} glass`}>
            <RefreshCw size={18} style={{ color: '#8b5cf6' }} />
            <div>
              <strong>{habitCount} hábito{habitCount !== 1 ? 's' : ''} recorrente{habitCount !== 1 ? 's' : ''} ativo{habitCount !== 1 ? 's' : ''}</strong>
              <span> — o motor de hábitos está gerenciando suas janelas de tempo automaticamente.</span>
            </div>
          </div>
        )}

        {/* ── Tarefas de hoje ──────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitleRow}>
              <h2 className={styles.sectionTitle}>Tarefas de hoje</h2>
              {!loading && (
                <span className={styles.todayBadge}>
                  {todayPending.length} pendente{todayPending.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
 
          {loading ? (
            <div className={`${styles.todayCard} glass`}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.todaySkeleton} />
              ))}
            </div>
          ) : todayTasks.length === 0 ? (
            <div className={`${styles.todayEmpty} glass`}>
              <CheckCircle2 size={32} style={{ color: 'var(--b300)' }} />
              <p>Nenhuma tarefa pendente nas suas metas abertas!</p>
            </div>
          ) : (
            <div className={`${styles.todayCard} glass`}>
              {/* Pendentes */}
              {todayPending.map(renderTodayItem)}
 
              {/* Divisor se tiver concluídas */}
              {todayDone.length > 0 && todayPending.length > 0 && (
                <div className={styles.todayDivider}>
                  <span>Concluídas hoje</span>
                </div>
              )}
 
              {/* Concluídas */}
              {todayDone.map(renderTodayItem)}
            </div>
          )}
        </section>

        {/* Metas recentes */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Metas recentes</h2>
            <Link href="/goals" className={styles.seeAll}>
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>

          {loading ? (
            <div className={styles.recentGrid}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`${styles.recentSkeleton} glass`} />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className={`${styles.empty} glass`}>
              <Target size={36} style={{ color: 'var(--b300)' }} />
              <p>Nenhuma meta ainda.</p>
              <Link href="/goals" className={styles.emptyBtn}>
                <Plus size={15} /> Criar primeira meta
              </Link>
            </div>
          ) : (
            <div className={styles.recentGrid}>
              {recent.map((g, i) => {
                const progress = typeof g.progress === 'number' ? Math.round(g.progress) : 0;
                const c = g.status === 'completed' ? '#10b981' :  g.status === 'late' ? '#ef4444' : '#3b82f6';
                return (
                  <Link
                    key={g.id}
                    href={`/goals/${g.id}`}
                    className={`${styles.recentCard} glass`}
                    style={{ animationDelay: `calc(var(--stagger) * ${i})` }}
                  >
                    <div className={styles.recentDot} style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                    <div className={styles.recentBody}>
                      <span className={styles.recentTitle}>{g.title}</span>
                      {g.is_numeric && !hasTarget(g) ? (
                        <span className={styles.recentPct}>{formatProgressValue(g)}</span>
                      ) : (
                        <>
                          <div className={styles.recentBar}>
                            <div className={`${styles.recentFill} ${progress >= 100 ? styles.recentFillComplete : ''}`} style={{ width: `${progress}%` }} />
                          </div>
                          <span className={`${styles.recentPct} ${progress >= 100 ? styles.recentPctComplete : ''}`}>{progress}%</span>
                        </>
                      )}
                    </div>
                    <ArrowRight size={14} className={styles.recentArrow} />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}