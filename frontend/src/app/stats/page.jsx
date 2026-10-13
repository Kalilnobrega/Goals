'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import ActivityHeatmap from '../../components/ActivityHeatmap';
import NumericGoalChart from '../../components/NumericGoalChart';
import HoursChart, { DAY_PERIODS } from '../../components/HoursChart';
import { getStats } from '../../lib/api';
import { formatValue } from '../../lib/numeric';
import { formatDeadline } from '../../lib/date';
import {
  Activity, CalendarCheck, CalendarDays, Trophy, Sparkles, TrendingUp, TrendingDown, Minus,
  RefreshCw, Check, X, Clock, Flame, ListOrdered, AlertTriangle, CheckCircle2, Target, CircleDashed,
} from 'lucide-react';
import styles from './page.module.css';

const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function rateTone(rate) {
  if (rate >= 70) return styles.toneGood;
  if (rate >= 40) return styles.toneWarn;
  return styles.toneBad;
}

function formatDay(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function Delta({ period, label }) {
  const { current, previous } = period;
  if (current === previous) {
    return <span className={`${styles.delta} ${styles.deltaFlat}`}><Minus size={12} /> igual aos {label}</span>;
  }
  const up = current > previous;
  const Icon = up ? TrendingUp : TrendingDown;
  const text = previous === 0
    ? `${current} a mais que os ${label}`
    : `${up ? '+' : ''}${Math.round(((current - previous) / previous) * 100)}% vs. ${label}`;
  return (
    <span className={`${styles.delta} ${up ? styles.deltaUp : styles.deltaDown}`}>
      <Icon size={12} /> {text}
    </span>
  );
}

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <div className={`${styles.tile} glass`}>
      <span className={styles.tileIcon}><Icon size={16} /></span>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      {hint && <span className={styles.tileHint}>{hint}</span>}
    </div>
  );
}

function CardHeader({ icon: Icon, title, hint }) {
  return (
    <div className={styles.cardHeader}>
      <Icon size={16} className={styles.cardIcon} />
      <h2 className={styles.cardTitle}>{title}</h2>
      {hint && <span className={styles.cardHint}>{hint}</span>}
    </div>
  );
}

function HoursCard({ hours }) {
  const total = hours.reduce((a, b) => a + b, 0);
  const periods = DAY_PERIODS.map(p => ({
    ...p,
    count: hours.slice(p.from, p.to).reduce((a, b) => a + b, 0),
  }));
  const best = periods.reduce((a, b) => (b.count > a.count ? b : a));
  const peak = hours.indexOf(Math.max(...hours));

  return (
    <section className={`${styles.card} glass`}>
      <CardHeader icon={Clock} title="Horário de produção" />
      {total === 0 ? (
        <p className={styles.cardEmpty}>Conclua tarefas para descobrir seu melhor horário.</p>
      ) : (
        <>
          <p className={styles.insight}>
            Você rende mais <strong>{best.phrase}</strong>,
            principalmente entre <strong>{peak}h e {peak + 1}h</strong>.
          </p>
          <HoursChart hours={hours} />
          <div className={styles.periods}>
            {periods.map(p => (
              <div key={p.label} className={`${styles.period} ${p === best ? styles.periodBest : ''}`}>
                <span className={styles.periodValue}>{Math.round((p.count / total) * 100)}%</span>
                <span className={styles.periodLabel}>{p.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function StreaksCard({ streaks, lastDay }) {
  const longest = streaks.top[0]?.length || 1;
  return (
    <section className={`${styles.card} glass`}>
      <CardHeader icon={Flame} title="Maiores sequências" hint="no último ano" />
      {streaks.top.length === 0 ? (
        <p className={styles.cardEmpty}>Nenhuma sequência ainda. Conclua uma tarefa hoje para começar.</p>
      ) : (
        <>
          <ol className={styles.streakList}>
            {streaks.top.map((run, index) => (
              <li key={run.start} className={styles.streakItem}>
                <span className={styles.rank}>{index + 1}</span>
                <div className={styles.streakBody}>
                  <div className={styles.streakTop}>
                    <span className={styles.streakLength}>
                      {run.length} dia{run.length !== 1 ? 's' : ''}
                    </span>
                    {run.end === lastDay && <span className={styles.currentBadge}><Flame size={11} /> atual</span>}
                  </div>
                  <span className={styles.streakRange}>
                    {run.length === 1 ? formatDay(run.start) : `${formatDay(run.start)} – ${formatDay(run.end)}`}
                  </span>
                  <span className={styles.meter}>
                    <span style={{ width: `${(run.length / longest) * 100}%` }} />
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <p className={styles.cardFoot}>
            {streaks.total_runs} sequência{streaks.total_runs !== 1 ? 's' : ''} no último ano
            {streaks.total_runs > 1 && ` · você recomeçou ${streaks.total_runs - 1} vez${streaks.total_runs - 1 !== 1 ? 'es' : ''}`}
          </p>
        </>
      )}
    </section>
  );
}

function TopTasksCard({ tasks }) {
  const max = tasks[0]?.count || 1;
  return (
    <section className={`${styles.card} glass`}>
      <CardHeader icon={ListOrdered} title="Tarefas mais concluídas" hint="no último ano" />
      {tasks.length === 0 ? (
        <p className={styles.cardEmpty}>Nenhuma tarefa concluída ainda.</p>
      ) : (
        <ul className={styles.taskList}>
          {tasks.map(task => (
            <li key={task.task_id} className={styles.taskItem}>
              <div className={styles.taskText}>
                <span className={styles.taskTitle}>{task.title}</span>
                <Link href={`/goals/${task.goal_id}`} className={styles.taskGoal}>{task.goal_title}</Link>
                <span className={styles.meter}><span style={{ width: `${(task.count / max) * 100}%` }} /></span>
              </div>
              <span className={styles.taskCount}>{task.count}×</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NeglectedTasksCard({ tasks }) {
  return (
    <section className={`${styles.card} glass`}>
      <CardHeader icon={AlertTriangle} title="Precisam de atenção" hint="recorrentes feitas menos de 70% das vezes" />
      {tasks.length === 0 ? (
        <p className={`${styles.cardEmpty} ${styles.allGood}`}>
          <CheckCircle2 size={16} /> Tudo em dia! Nenhuma tarefa recorrente ficando para trás.
        </p>
      ) : (
        <ul className={styles.taskList}>
          {tasks.map(task => (
            <li key={task.task_id} className={styles.taskItem}>
              <div className={styles.taskText}>
                <span className={styles.taskTitle}>{task.title}</span>
                <Link href={`/goals/${task.goal_id}`} className={styles.taskGoal}>{task.goal_title}</Link>
                <span className={styles.taskMeta}>feita {task.done} de {task.expected} vezes</span>
              </div>
              <span className={`${styles.rate} ${rateTone(task.rate)}`}>{Math.round(task.rate)}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Forecast({ goal }) {
  const { forecast } = goal;

  if (forecast.status === 'reached') {
    return <p className={`${styles.forecast} ${styles.forecastGood}`}><CheckCircle2 size={14} /> Meta alcançada!</p>;
  }
  if (forecast.status === 'no_data') {
    return <p className={styles.forecast}><CircleDashed size={14} /> Registre mais progresso para ver a previsão.</p>;
  }
  if (forecast.status === 'no_trend') {
    return <p className={`${styles.forecast} ${styles.forecastBad}`}><Minus size={14} /> Sem avanço em direção à meta até agora.</p>;
  }

  const weekly = formatValue(Math.abs(forecast.rate_per_day * 7), goal.unit);
  const eta = formatDate(forecast.eta);

  if (forecast.status === 'on_track') {
    return (
      <p className={`${styles.forecast} ${styles.forecastGood}`}>
        <Target size={14} />
        <span>
          No ritmo atual (~{weekly}/semana), você chega lá em <strong>{eta}</strong>
          {forecast.deadline && <>, antes do prazo ({formatDeadline(forecast.deadline)})</>}.
        </span>
      </p>
    );
  }

  return (
    <p className={`${styles.forecast} ${styles.forecastBad}`}>
      <AlertTriangle size={14} />
      <span>
        No ritmo atual (~{weekly}/semana), você chega lá só em <strong>{eta}</strong>, depois do prazo ({formatDeadline(forecast.deadline)}).
        {forecast.needed_per_day !== null && (
          <> Para cumprir, precisa de ~{formatValue(Math.abs(forecast.needed_per_day * 7), goal.unit)}/semana.</>
        )}
      </span>
    </p>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats().then(setStats).catch(() => setError('Erro ao carregar estatísticas.'));
  }, []);

  const summary = stats?.summary;

  return (
    <>
      <Navbar />
      <main className={styles.main}>
        <div className={`${styles.pageHero} glass`}>
          <div>
            <h1 className={styles.title}>Estatísticas</h1>
            <p className={styles.sub}>Seu histórico de tarefas, registros e ciclos</p>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {!stats && !error && (
          <>
            <div className={styles.tiles}>
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`${styles.skeleton} glass`} />)}
            </div>
            <div className={`${styles.skeleton} ${styles.skeletonTall} glass`} />
          </>
        )}

        {stats && (
          <>
            <div className={styles.tiles}>
              <StatTile
                icon={CalendarDays}
                label="Últimos 7 dias"
                value={stats.periods.week.current}
                hint={<Delta period={stats.periods.week} label="7 dias anteriores" />}
              />
              <StatTile
                icon={CalendarDays}
                label="Últimos 30 dias"
                value={stats.periods.month.current}
                hint={<Delta period={stats.periods.month} label="30 dias anteriores" />}
              />
              <StatTile
                icon={Activity}
                label="Atividades no ano"
                value={summary.total_activities}
                hint={`em ${summary.active_days} de ${stats.days.length} dias`}
              />
              <StatTile
                icon={CalendarCheck}
                label="Dias ativos"
                value={`${Math.round((summary.active_days / stats.days.length) * 100)}%`}
                hint="dos dias do último ano"
              />
              <StatTile
                icon={Sparkles}
                label="Dia mais produtivo"
                value={summary.best_weekday !== null ? WEEKDAY_NAMES[summary.best_weekday] : '—'}
              />
              <StatTile
                icon={Trophy}
                label="Metas concluídas"
                value={summary.goals_completed}
                hint={`${summary.goals_open} em aberto · ${summary.goals_late} atrasada${summary.goals_late !== 1 ? 's' : ''}`}
              />
            </div>

            <section className={`${styles.card} glass`}>
              <CardHeader icon={Activity} title="Atividade" hint="tarefas concluídas e registros de progresso por dia" />
              <ActivityHeatmap days={stats.days} />
            </section>

            <div className={styles.pair}>
              <HoursCard hours={stats.hours} />
              <StreaksCard streaks={stats.streaks} lastDay={stats.days[stats.days.length - 1]?.date} />
            </div>

            <div className={styles.pair}>
              <TopTasksCard tasks={stats.top_tasks} />
              <NeglectedTasksCard tasks={stats.neglected_tasks} />
            </div>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <TrendingUp size={16} className={styles.cardIcon} />
                <h2 className={styles.cardTitle}>Evolução das metas de progresso</h2>
                <span className={styles.count}>{stats.numeric_goals.length}</span>
              </div>

              {stats.numeric_goals.length === 0 ? (
                <div className={`${styles.empty} glass`}>
                  <TrendingUp size={22} />
                  <p>Crie uma meta de progresso para ver a evolução dos valores aqui.</p>
                </div>
              ) : (
                <div className={styles.chartGrid}>
                  {stats.numeric_goals.map(goal => {
                    const current = goal.points[goal.points.length - 1]?.value ?? goal.start_value ?? 0;
                    return (
                      <div key={goal.id} className={`${styles.card} glass`}>
                        <div className={styles.chartHeader}>
                          <Link href={`/goals/${goal.id}`} className={styles.goalLink}>{goal.title}</Link>
                          <span className={styles.chartValue}>
                            {formatValue(current)} / {formatValue(goal.target_value, goal.unit)}
                          </span>
                        </div>
                        {goal.points.length > 1 ? (
                          <NumericGoalChart goal={goal} />
                        ) : (
                          <p className={styles.chartEmpty}>Nenhum registro ainda.</p>
                        )}
                        <Forecast goal={goal} />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <RefreshCw size={16} className={styles.cardIcon} />
                <h2 className={styles.cardTitle}>Consistência das metas recorrentes</h2>
                <span className={styles.count}>{stats.recurring_goals.length}</span>
              </div>

              {stats.recurring_goals.length === 0 ? (
                <div className={`${styles.empty} glass`}>
                  <RefreshCw size={22} />
                  <p>Crie uma meta recorrente para acompanhar sua consistência aqui.</p>
                </div>
              ) : (
                <ul className={styles.recurringList}>
                  {stats.recurring_goals.map(goal => (
                    <li key={goal.id} className={`${styles.recurringItem} glass`}>
                      <div className={styles.recurringInfo}>
                        <Link href={`/goals/${goal.id}`} className={styles.goalLink}>{goal.title}</Link>
                        <span className={styles.recurringMeta}>
                          {goal.total_cycles === 0
                            ? 'Nenhum ciclo fechado ainda'
                            : `${goal.completed_cycles} de ${goal.total_cycles} ciclo${goal.total_cycles !== 1 ? 's' : ''} batido${goal.total_cycles !== 1 ? 's' : ''}`}
                        </span>
                      </div>

                      {goal.cycles.length > 0 && (
                        <div className={styles.cycleStrip} aria-label="Últimos ciclos">
                          {goal.cycles.map(cycle => (
                            <span
                              key={cycle.cycle_start}
                              className={`${styles.cycle} ${cycle.completed ? styles.cycleDone : styles.cycleMissed}`}
                              title={`${formatDeadline(cycle.cycle_start)} – ${formatDeadline(cycle.cycle_end)}: ${formatValue(cycle.achieved)}/${formatValue(cycle.target, goal.unit)}`}
                            >
                              {cycle.completed ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                            </span>
                          ))}
                        </div>
                      )}

                      {goal.rate !== null && (
                        <span className={`${styles.rate} ${rateTone(goal.rate)}`}>
                          {Math.round(goal.rate)}%
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
