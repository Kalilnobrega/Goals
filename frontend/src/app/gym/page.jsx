'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  Play, Plus, Zap, Scale, ChevronRight, ChevronDown, History, TrendingUp, ClipboardList, Flame, CalendarDays,
} from 'lucide-react';
import { getUserName } from '../../lib/auth';
import { getFitnessOverview, peekCache } from '../../lib/api';
import {
  daysAgo, formatDay, formatDelta, formatDuration, formatKg, formatVolume, muscleLabel, plural,
} from '../../lib/gym';
import ActiveSessionBanner from '../../components/gym/ActiveSessionBanner';
import useStartSession from '../../components/gym/useStartSession';
import TrainingCalendar from '../../components/gym/TrainingCalendar';
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

function NextWorkout({ data, begin, starting }) {
  const workout = data.suggested_workout;

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
      <p className={styles.nextMeta}>
        {plural(workout.exercise_count, 'exercício', 'exercícios')}
        {workout.muscle_groups.length > 0 && ` · ${workout.muscle_groups.slice(0, 3).map(muscleLabel).join(', ')}`}
        <br />
        {workout.last_done_at ? `Feito pela última vez ${daysAgo(workout.last_done_at, data.today)}` : 'Ainda não feito'}
      </p>
      <div className={styles.nextActions}>
        <button type="button" className={styles.nextStart} onClick={() => begin(workout.id)} disabled={starting}>
          <Play size={20} fill="currentColor" /> {starting ? 'Iniciando…' : 'Começar treino'}
        </button>
        <Link href="/gym/workouts" className={styles.nextFree}>Outra ficha</Link>
      </div>
    </section>
  );
}

function Week({ data }) {
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
          const label = `${WEEKDAY_NAMES[index]}, ${formatDay(day.date)}: ${trained ? plural(day.sessions, 'treino', 'treinos') : future ? 'ainda não chegou' : 'sem treino'}`;
          return (
            <li key={day.date} className={styles.day} aria-label={label}>
              <span className={styles.dayLabel} aria-hidden="true">{WEEKDAYS[index]}</span>
              <span
                aria-hidden="true"
                className={`${styles.dayDot} ${trained ? styles.dayTrained : ''} ${day.date === today ? styles.dayToday : ''} ${future ? styles.dayFuture : ''}`}
              >
                {day.sessions > 1 ? day.sessions : ''}
              </span>
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
