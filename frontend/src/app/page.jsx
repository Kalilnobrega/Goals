'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import {
  Target, CheckCircle2, Clock, Pause, TrendingUp,
  ArrowRight, Plus, Sparkles, RefreshCw, Check, AlertTriangle
} from 'lucide-react';
import { getGoals, getTodayTasks, toggleTask, getStreak } from '../lib/api';
import { getUserName } from '../lib/auth';
import { useLateGoals } from '../lib/LateGoalsContext';
import styles from './page.module.css';

export default function DashboardPage() {
  const [goals,   setGoals]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [todayTasks, setTodayTasks] = useState([]);
  const [toggling,   setToggling]   = useState({});
  const { setLateCount, setStreak } = useLateGoals();

  const loadAll = async () => {
    const [gs, today, streakData] = await Promise.all([getGoals(), getTodayTasks(),  getStreak().catch(() => ({ current_streak: 0}))]);
    setGoals(gs);
    setTodayTasks(today);
    setLateCount(gs.filter(g => g.status === 'late').length);
    setStreak(streakData.current_streak ?? 0);
  };
 
  useEffect(() => {
    setUserName(getUserName());
    setLoading(true);
    loadAll().catch(() => {}).finally(() => setLoading(false));
  }, []);
 
  const handleToggle = async (item) => {
    setToggling(prev => ({ ...prev, [item.id]: true }));
    try {
      await toggleTask(item.id);
      setTodayTasks(prev =>
        prev.map(t => t.id === item.id ? { ...t, status: !t.status } : t)
      );

      getStreak()
        .then(s => setStreak(s.current_streak ?? 0))
        .catch(() => {});
    } catch {}
    finally { setToggling(prev => ({ ...prev, [item.id]: false })); }
  };
 
  const total     = goals.length;
  const completed = goals.filter(g => g.status === 'completed').length;
  const open      = goals.filter(g => g.status === 'open').length;
  const paused    = goals.filter(g => g.status === 'paused').length;
  const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;
  const habitCount = goals.reduce((acc, g) => acc + (g.tasks?.filter(t => t.recurrence_days)?.length ?? 0), 0);
  const firstName = userName.split(' ')[0];
  const lateGoals  = goals.filter(g => g.status === 'late');

  const recent = [...goals]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 4);

  const stats = [
    { label: 'Total de metas',  value: total,      icon: Target,       color: '#3b82f6' },
    { label: 'Concluídas',      value: completed,  icon: CheckCircle2, color: '#10b981' },
    { label: 'Em aberto',       value: open,       icon: Clock,        color: '#f59e0b' },
    { label: 'Pausadas',        value: paused,     icon: Pause,        color: '#ff2e4f' },
    { label: 'Taxa de sucesso', value: `${rate}%`, icon: TrendingUp,   color: '#8b5cf6' },
  ];

  const todayPending = todayTasks.filter(i => i.status === false);
  const todayDone    = todayTasks.filter(i => i.status === true);

  return (
    <>
      <Navbar />
      <main className={styles.main}>

        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              <Sparkles size={14} />
              Bem-vindo de volta {firstName ? `, ${firstName}` : ''}! 👋
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
          <div className={styles.heroOrb} />
        </section>

        {/* Stats */}
        <section className={styles.stats}>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`${styles.statCard} glass ${styles.skeleton}`} />
              ))
            : stats.map((s, i) => (
              <div
                key={s.label}
                className={`${styles.statCard} glass`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className={styles.statIcon} style={{ '--icon-color': s.color }}>
                  <s.icon size={20} />
                </div>
                <div>
                  <div className={styles.statValue}>{s.value}</div>
                  <div className={styles.statLabel}>{s.label}</div>
                </div>
              </div>
            ))
          }
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
              {todayPending.map(item => (
                <div key={item.id} className={styles.todayItem}>
                  <button
                    className={styles.todayCheck}
                    onClick={() => handleToggle(item)}
                    disabled={toggling[item.id]}
                    aria-label="Concluir tarefa"
                  >
                    {toggling[item.id]
                      ? <span className={styles.todaySpinner} />
                      : null
                    }
                  </button>
                  <div className={styles.todayInfo}>
                    <span className={styles.todayTitle}>{item.title}</span>
                    <Link href={`/goals/${item.goal_id}`} className={styles.todayGoal}>
                      {item.goal_title}
                    </Link>
                  </div>
                  {item.is_recurring && (
                    <span className={styles.todayRecurring}>
                      <RefreshCw size={11} />
                      {item.recurrence_count}/{item.max_recurrences ?? '∞'}
                    </span>
                  )}
                </div>
              ))}
 
              {/* Divisor se tiver concluídas */}
              {todayDone.length > 0 && todayPending.length > 0 && (
                <div className={styles.todayDivider}>
                  <span>Concluídas hoje</span>
                </div>
              )}
 
              {/* Concluídas */}
              {todayDone.map(item => (
                <div key={item.id} className={`${styles.todayItem} ${styles.todayItemDone}`}>
                  <button
                    className={`${styles.todayCheck} ${styles.todayChecked}`}
                    onClick={() => handleToggle(item)}
                    disabled={toggling[item.id]}
                    aria-label="Desmarcar tarefa"
                  >
                    <Check size={11} strokeWidth={3} />
                  </button>
                  <div className={styles.todayInfo}>
                    <span className={styles.todayTitle}>{item.title}</span>
                    <Link href={`/goals/${item.goal_id}`} className={styles.todayGoal}>
                      {item.goal_title}
                    </Link>
                  </div>
                </div>
              ))}
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
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className={styles.recentDot} style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                    <div className={styles.recentBody}>
                      <span className={styles.recentTitle}>{g.title}</span>
                      <div className={styles.recentBar}>
                        <div className={styles.recentFill} style={{ width: `${progress}%` }} />
                      </div>
                      <span className={styles.recentPct}>{progress}%</span>
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