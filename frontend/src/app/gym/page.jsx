'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  Play, Plus, Zap, Scale, ChevronRight, ChevronDown, History, TrendingUp, ClipboardList, Flame, CalendarDays, Check, Moon, ArrowLeftRight,
} from 'lucide-react';
import { getUserName } from '../../lib/auth';
import { getFitnessOverview, peekCache } from '../../lib/api';
import {
  daysAgo, formatDay, formatDelta, formatDuration, formatKg, formatVolume, muscleLabel, plural, weekdayOf,
} from '../../lib/gym';
import ActiveSessionBanner from '../../components/gym/ActiveSessionBanner';
import useStartSession from '../../components/gym/useStartSession';
import TrainingCalendar from '../../components/gym/TrainingCalendar';
import GymSheet from '../../components/gym/GymSheet';
import sheetStyles from '../../components/gym/sheet.module.css';
import styles from './page.module.css';

const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const WEEKDAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

const subscribeToUserName = (onChange) => {
  window.addEventListener('username-changed', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('username-changed', onChange);
    window.removeEventListener('storage', onChange);
  };
};

function weekMessage(data) {
  const { sessions } = data.week;
  if (data.active_session) return 'Seu treino está em andamento. Bora terminar.';
  if (data.total_sessions === 0) return 'Monte uma ficha, comece o treino e registre cada série na hora.';
  if (sessions === 0) return 'Nenhum treino nesta semana ainda. Hoje é um bom dia.';
  if (sessions === 1) return 'Você treinou 1 vez nesta semana. Mantém o ritmo.';
  return `Você treinou ${sessions} vezes nesta semana. Mandou bem.`;
}

function workoutMeta(workout, today) {
  return (
    <>
      {plural(workout.exercise_count, 'exercício', 'exercícios')}
      {workout.muscle_groups.length > 0 && ` · ${workout.muscle_groups.slice(0, 3).map(muscleLabel).join(', ')}`}
      <br />
      {workout.last_done_at ? `Feito pela última vez ${daysAgo(workout.last_done_at, today)}` : 'Ainda não feito'}
    </>
  );
}

function nextText(plan, today) {
  if (!plan.next) return 'Nenhum outro dia de treino no plano.';
  const diff = Math.round((new Date(`${plan.next.date}T12:00`) - new Date(`${today}T12:00`)) / 86400000);
  const when = diff === 1 ? 'amanhã' : `na ${WEEKDAY_NAMES[weekdayOf(plan.next.date)]}`;
  return `Próximo: ${plan.next.workouts.join(' + ')} ${when}.`;
}

function PlanToday({ data, begin, starting }) {
  const { plan, today } = data;
  const kicker = `Hoje · ${WEEKDAY_NAMES[weekdayOf(today)]} · ${plan.name}`;
  const pending = plan.today.filter(w => !w.done);
  const done = plan.today.filter(w => w.done);

  if (pending.length) {
    const [main, ...others] = pending;
    return (
      <section className={styles.next}>
        <span className={styles.nextKicker}>{kicker}</span>
        <h2 className={styles.nextName}>{main.name}</h2>
        <p className={styles.nextMeta}>{workoutMeta(main, today)}</p>
        {(others.length > 0 || done.length > 0) && (
          <ul className={styles.planOthers}>
            {done.map(w => <li key={w.workout_id} className={styles.planDone}><Check size={14} strokeWidth={3} /> {w.name} feito</li>)}
            {others.map(w => (
              <li key={w.workout_id}>
                <button type="button" className={styles.planOther} onClick={() => begin(w.workout_id)} disabled={starting}>
                  Também hoje: {w.name} <Play size={13} fill="currentColor" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.nextActions}>
          <button type="button" className={styles.nextStart} onClick={() => begin(main.workout_id)} disabled={starting}>
            <Play size={20} fill="currentColor" /> {starting ? 'Iniciando…' : 'Começar treino'}
          </button>
          <Link href="/gym/workouts" className={styles.nextFree}>Outra ficha</Link>
        </div>
      </section>
    );
  }

  const rest = plan.today.length === 0;
  return (
    <section className={styles.next}>
      <span className={styles.nextKicker}>{kicker}</span>
      <h2 className={styles.nextName}>
        {rest ? <><Moon size={22} className={styles.nextIcon} aria-hidden="true" /> Dia de descanso</> : <><Check size={24} strokeWidth={3} className={styles.nextIcon} aria-hidden="true" /> Treino de hoje feito</>}
      </h2>
      <p className={styles.nextMeta}>
        {!rest && <>{done.map(w => w.name).join(' + ')}. </>}
        {nextText(plan, today)}
      </p>
      <div className={styles.nextActions}>
        {rest && data.suggested_workout ? (
          <button type="button" className={styles.nextSecondary} onClick={() => begin(data.suggested_workout.id)} disabled={starting}>
            <Play size={18} fill="currentColor" /> Treinar {data.suggested_workout.name} mesmo assim
          </button>
        ) : (
          <Link href="/gym/workouts" className={styles.nextSecondary}>Treinar outra ficha</Link>
        )}
      </div>
    </section>
  );
}

function NextWorkout({ data, begin, starting }) {
  const workout = data.suggested_workout;

  if (data.plan) return <PlanToday data={data} begin={begin} starting={starting} />;

  if (!workout) {
    return (
      <section className={styles.next}>
        <span className={styles.nextKicker}>Primeiro passo</span>
        <h2 className={styles.nextName}>{data.workout_count ? 'Adicione exercícios à sua ficha' : 'Crie sua primeira ficha'}</h2>
        <p className={styles.nextMeta}>Monte o treino com os exercícios, séries e repetições que você costuma fazer.</p>
        <div className={styles.nextActions}>
          <Link href={data.workout_count ? '/gym/workouts' : '/gym/workouts/new'} className={styles.nextStart}>
            <Plus size={20} strokeWidth={2.4} /> {data.workout_count ? 'Ver fichas' : 'Criar ficha'}
          </Link>
          <button type="button" className={styles.nextFree} onClick={() => begin(null)} disabled={starting}>
            <Zap size={18} /> Treino livre
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.next}>
      <span className={styles.nextKicker}>{data.workout_count > 1 ? 'Próximo da fila' : 'Seu treino'}</span>
      <h2 className={styles.nextName}>{workout.name}</h2>
      <p className={styles.nextMeta}>{workoutMeta(workout, data.today)}</p>
      <div className={styles.nextActions}>
        <button type="button" className={styles.nextStart} onClick={() => begin(workout.id)} disabled={starting}>
          <Play size={20} fill="currentColor" /> {starting ? 'Iniciando…' : 'Começar treino'}
        </button>
        <Link href="/gym/workouts" className={styles.nextFree}>Outra ficha</Link>
      </div>
      <Link href="/gym/plans/new" className={styles.planHint}>Monte sua semana: diga qual ficha fazer em cada dia</Link>
    </section>
  );
}

function DayTarget({ targets, label, onOpen, children }) {
  if (!targets.length) {
    return <div className={styles.dayInner} role="img" aria-label={label}>{children}</div>;
  }
  return (
    <button type="button" className={`${styles.dayInner} ${styles.dayButton}`} onClick={() => onOpen(targets)} aria-label={`${label}. Toque para ver.`}>
      {children}
    </button>
  );
}

function dayTargets(day, future) {
  return [
    ...day.trained.map(session => ({
      key: `s${session.id}`, href: `/gym/history/${session.id}`, title: session.name, meta: 'Treino feito',
    })),
    ...day.planned.filter(p => !p.done).map(p => ({
      key: `w${p.workout_id}`, href: `/gym/workouts/${p.workout_id}`, title: p.name, meta: future ? 'Ficha planejada' : 'Ficha planejada, não feita',
    })),
  ];
}

function Week({ data }) {
  const router = useRouter();
  const [chosen, setChosen] = useState(null);
  const closeChosen = useCallback(() => setChosen(null), []);
  const { week, today } = data;
  const trainedDays = week.days.filter(day => day.sessions > 0).length;
  const [expanded, setExpanded] = useState(false);

  return (
    <section className={styles.panel} aria-labelledby="week-title">
      <div className={styles.panelHeader}>
        <h2 id="week-title" className={styles.panelTitle}>Esta semana</h2>
        <div className={styles.panelSide}>
          {trainedDays > 0 && (
            <span className={styles.badge}><Flame size={14} aria-hidden="true" /> {plural(trainedDays, 'dia', 'dias')}</span>
          )}
          <button
            type="button"
            className={`${styles.calendarToggle} ${expanded ? styles.calendarOpen : ''}`}
            onClick={() => setExpanded(open => !open)}
            aria-expanded={expanded}
            aria-controls="training-calendar"
          >
            <CalendarDays size={16} /> Calendário <ChevronDown size={16} className={styles.toggleChevron} />
          </button>
        </div>
      </div>

      <ol className={styles.days}>
        {week.days.map((day, index) => {
          const future = day.date > today;
          const trained = day.sessions > 0;
          const planned = day.planned.map(p => p.name).join(' + ');
          const rest = !!data.plan && !planned;
          const swapped = !!data.plan && trained && !day.planned.some(p => p.done);
          const actual = day.trained.map(t => t.name).join(' + ');
          const label = `${WEEKDAY_NAMES[index]}, ${formatDay(day.date)}: ${trained ? plural(day.sessions, 'treino', 'treinos') : future ? 'ainda não chegou' : 'sem treino'}${swapped ? `. Planejado: ${planned || 'descanso'}, feito: ${actual}` : planned ? `. Plano: ${planned}` : rest ? '. Descanso no plano' : ''}`;
          return (
            <li key={day.date} className={styles.day}>
              <DayTarget
                targets={dayTargets(day, future)}
                label={label}
                onOpen={targets => (targets.length === 1 ? router.push(targets[0].href) : setChosen({ index, day, targets }))}
              >
              <span className={styles.dayLabel} aria-hidden="true">{WEEKDAYS[index]}</span>
              <span
                aria-hidden="true"
                className={`${styles.dayDot} ${trained ? styles.dayTrained : ''} ${planned && !trained ? styles.dayPlanned : ''} ${rest && !trained ? styles.dayRest : ''} ${day.date === today ? styles.dayToday : ''} ${future ? styles.dayFuture : ''}`}
              >
                {day.sessions > 1 ? day.sessions : rest && !trained ? <Moon size={14} /> : ''}
              </span>
              {data.plan && !swapped && (
                <span className={`${styles.dayPlan} ${rest ? styles.dayPlanRest : ''}`} aria-hidden="true">
                  {planned || 'Descanso'}
                </span>
              )}
              {swapped && (
                <span className={styles.daySwap} aria-hidden="true">
                  <s className={styles.daySwapFrom}>{planned || 'Descanso'}</s>
                  <ArrowLeftRight size={11} className={styles.daySwapIcon} />
                  <span className={styles.daySwapTo}>{actual}</span>
                </span>
              )}
              </DayTarget>
            </li>
          );
        })}
      </ol>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{week.sessions}</span>
          <span className={styles.statLabel}>{week.sessions === 1 ? 'Treino' : 'Treinos'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{week.sets}</span>
          <span className={styles.statLabel}>Séries</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{week.minutes ? formatDuration(week.minutes * 60000) : '0min'}</span>
          <span className={styles.statLabel}>Tempo</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatVolume(week.volume_kg)}</span>
          <span className={styles.statLabel}>Volume</span>
        </div>
      </div>

      {expanded && <TrainingCalendar id="training-calendar" today={today} />}

      <GymSheet
        open={!!chosen}
        onClose={closeChosen}
        title={chosen ? `${WEEKDAY_NAMES[chosen.index][0].toUpperCase()}${WEEKDAY_NAMES[chosen.index].slice(1)}, ${formatDay(chosen.day.date)}` : ''}
      >
        {chosen && (
          <div className={sheetStyles.actions}>
            {chosen.targets.map(target => (
              <Link key={target.key} href={target.href} className={sheetStyles.option} onClick={closeChosen}>
                <span>{target.title}<small>{target.meta}</small></span>
                <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </GymSheet>
    </section>
  );
}

function LastSession({ session, today }) {
  const duration = new Date(session.completed_at) - new Date(session.started_at);
  return (
    <Link href={`/gym/history/${session.id}`} className={styles.tile}>
      <span className={styles.tileIcon}><History size={20} /></span>
      <span className={styles.tileText}>
        <span className={styles.tileLabel}>Último treino · {daysAgo(session.started_at, today)}</span>
        <span className={styles.tileTitle}>{session.name}</span>
        <span className={styles.tileMeta}>
          {formatDuration(duration)} · {plural(session.total_sets, 'série', 'séries')} · {formatVolume(session.volume_kg)}
        </span>
      </span>
      <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
    </Link>
  );
}

function BodyWeight({ body }) {
  if (!body) {
    return (
      <Link href="/gym/progress/body" className={styles.tile}>
        <span className={styles.tileIcon}><Scale size={20} /></span>
        <span className={styles.tileText}>
          <span className={styles.tileTitle}>Registrar peso</span>
          <span className={styles.tileMeta}>Acompanhe seu peso corporal ao longo do tempo</span>
        </span>
        <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
      </Link>
    );
  }

  return (
    <Link href="/gym/progress/body" className={styles.tile}>
      <span className={styles.tileIcon}><Scale size={20} /></span>
      <span className={styles.tileText}>
        <span className={styles.tileLabel}>Peso corporal · {formatDay(body.measured_on)}</span>
        <span className={styles.tileTitle}>{formatKg(body.weight_kg)} kg</span>
        {body.change_kg !== null && (
          <span className={styles.tileMeta}>{formatDelta(body.change_kg)} desde {formatDay(body.previous_on)}</span>
        )}
      </span>
      <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
    </Link>
  );
}

export default function GymHomePage() {
  const userName = useSyncExternalStore(subscribeToUserName, getUserName, () => '');
  const firstName = userName?.split(' ')[0];
  const [data, setData] = useState(() => peekCache('fitnessOverview') ?? null);
  const [loadError, setLoadError] = useState(false);
  const { begin, starting, sheet } = useStartSession();

  const fetchOverview = useCallback(() => {
    setLoadError(false);
    return getFitnessOverview().then(setData).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    getFitnessOverview().then(setData).catch(() => setLoadError(true));
  }, []);

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.kicker}>GymGoals</p>
        <h1 className={styles.title}>{firstName ? `Bora treinar, ${firstName}.` : 'Bora treinar.'}</h1>
        <p className={styles.subtitle}>{data ? weekMessage(data) : ' '}</p>
      </header>

      {loadError && !data && (
        <div className={styles.state}>
          <p>Não foi possível carregar seu resumo.</p>
          <button type="button" className={styles.stateAction} onClick={fetchOverview}>Tentar de novo</button>
        </div>
      )}

      {!data && !loadError && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando resumo">
          <div className={styles.skeletonHero} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      )}

      {data && (
        <>
          {data.active_session
            ? <ActiveSessionBanner session={data.active_session} />
            : <NextWorkout data={data} begin={begin} starting={starting} />}

          <Week data={data} />

          <div className={styles.tiles}>
            {data.last_session && <LastSession session={data.last_session} today={data.today} />}
            <BodyWeight body={data.body_weight} />
          </div>

          <nav className={styles.shortcuts} aria-label="Atalhos">
            <Link href="/gym/workouts" className={styles.shortcut}><ClipboardList size={18} /> Fichas</Link>
            <Link href="/gym/history" className={styles.shortcut}><History size={18} /> Histórico</Link>
            <Link href="/gym/progress" className={styles.shortcut}><TrendingUp size={18} /> Evolução</Link>
            {data.suggested_workout && !data.active_session && (
              <button type="button" className={styles.shortcut} onClick={() => begin(null)} disabled={starting}>
                <Zap size={18} /> Treino livre
              </button>
            )}
          </nav>
        </>
      )}
      {sheet}
    </div>
  );
}
