'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCalendar, peekCache } from '../../lib/api';
import { formatDuration, formatLongDay, formatMonth, formatTime, formatVolume, plural } from '../../lib/gym';
import styles from './TrainingCalendar.module.css';

const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

const shiftMonth = (month, delta) => {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(year, index - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

function monthCells(month) {
  const [year, index] = month.split('-').map(Number);
  const leading = (new Date(year, index - 1, 1).getDay() + 6) % 7;
  const total = new Date(year, index, 0).getDate();
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
}

export default function TrainingCalendar({ today, id }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState(() => peekCache(`fitnessCalendar:${today.slice(0, 7)}`) ?? null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let current = true;
    getCalendar(month)
      .then(result => {
        if (!current) return;
        setData(result);
        setSelected(result.days.at(-1)?.date ?? null);
      })
      .catch(() => { if (current) setLoadError(true); });
    return () => { current = false; };
  }, [month]);

  const go = (delta) => {
    const next = shiftMonth(month, delta);
    setLoadError(false);
    setData(peekCache(`fitnessCalendar:${next}`) ?? null);
    setSelected(null);
    setMonth(next);
  };

  const retry = () => {
    setLoadError(false);
    getCalendar(month).then(setData).catch(() => setLoadError(true));
  };

  const ready = data?.month === month ? data : null;
  const byDay = new Map((ready?.days ?? []).map(day => [day.date, day.sessions]));
  const canGoBack = !!ready?.first_session_on && ready.first_session_on.slice(0, 7) < month;
  const canGoForward = month < today.slice(0, 7);
  const selectedSessions = (selected && byDay.get(selected)) || [];

  return (
    <div id={id} className={styles.calendar} aria-busy={!ready}>
      <div className={styles.header}>
        <button type="button" className={styles.nav} onClick={() => go(-1)} disabled={!canGoBack} aria-label="Mês anterior">
          <ChevronLeft size={20} />
        </button>
        <div className={styles.month}>
          <h3 className={styles.monthName} aria-live="polite">{formatMonth(`${month}-15T12:00:00`)}</h3>
          <span className={styles.monthMeta}>
            {ready
              ? ready.total_sessions
                ? `${plural(ready.total_sessions, 'treino', 'treinos')} em ${plural(ready.days_trained, 'dia', 'dias')}`
                : 'Nenhum treino'
              : ' '}
          </span>
        </div>
        <button type="button" className={styles.nav} onClick={() => go(1)} disabled={!canGoForward} aria-label="Próximo mês">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((day, i) => <span key={i}>{day}</span>)}
      </div>

      <div className={styles.grid}>
        {monthCells(month).map((day, i) => {
          if (!day) return <span key={`blank-${i}`} />;
          const sessions = byDay.get(day);
          const classes = [
            styles.cell,
            sessions ? styles.trained : '',
            day === today ? styles.today : '',
            day > today ? styles.future : '',
            day === selected ? styles.selected : '',
          ].join(' ');
          const number = Number(day.slice(8));
          if (!sessions) {
            return <span key={day} className={classes} aria-label={`${formatLongDay(day)}, sem treino`}>{number}</span>;
          }
          return (
            <button
              key={day}
              type="button"
              className={classes}
              onClick={() => setSelected(day)}
              aria-pressed={day === selected}
              aria-label={`${formatLongDay(day)}, ${plural(sessions.length, 'treino', 'treinos')}`}
            >
              {number}
              {sessions.length > 1 && <span className={styles.count}>{sessions.length}</span>}
            </button>
          );
        })}
      </div>

      {loadError && !ready && (
        <p className={styles.error}>
          Não foi possível carregar este mês. <button type="button" onClick={retry}>Tentar de novo</button>
        </p>
      )}

      {selectedSessions.length > 0 && (
        <div className={styles.day}>
          <h4 className={styles.dayTitle}>{formatLongDay(selected)}</h4>
          <ul className={styles.list}>
            {selectedSessions.map(session => (
              <li key={session.id}>
                <Link href={`/gym/history/${session.id}`} className={styles.row}>
                  <span className={styles.rowTime}>{formatTime(session.started_at)}</span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{session.name}</span>
                    <span className={styles.rowMeta}>
                      {formatDuration(new Date(session.completed_at) - new Date(session.started_at))} · {plural(session.total_sets, 'série', 'séries')} · {formatVolume(session.volume_kg)}
                    </span>
                  </span>
                  <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
