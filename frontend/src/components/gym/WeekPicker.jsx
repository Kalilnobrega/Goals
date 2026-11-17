'use client';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCalendar, peekCache } from '../../lib/api';
import { addDays, formatDay, formatMonth, mondayOf, plural } from '../../lib/gym';
import styles from './WeekPicker.module.css';

const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

const shiftMonth = (month, delta) => {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(year, index - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

function monthWeeks(month) {
  const [year, index] = month.split('-').map(Number);
  const last = `${month}-${String(new Date(year, index, 0).getDate()).padStart(2, '0')}`;
  const weeks = [];
  for (let start = mondayOf(`${month}-01`); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

export default function WeekPicker({ today, selected, minMonth, maxMonth, onPick }) {
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [data, setData] = useState(() => peekCache(`fitnessCalendar:${selected.slice(0, 7)}`) ?? null);

  useEffect(() => {
    let current = true;
    getCalendar(month).then(result => { if (current) setData(result); }).catch(() => {});
    return () => { current = false; };
  }, [month]);

  const go = (delta) => {
    const next = shiftMonth(month, delta);
    setData(peekCache(`fitnessCalendar:${next}`) ?? null);
    setMonth(next);
  };

  const ready = data?.month === month ? data : null;
  const trained = new Map((ready?.days ?? []).map(day => [day.date, day.sessions.length]));

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <button type="button" className={styles.nav} onClick={() => go(-1)} disabled={month <= minMonth} aria-label="Mês anterior">
          <ChevronLeft size={20} />
        </button>
        <div className={styles.month}>
          <h3 className={styles.monthName} aria-live="polite">{formatMonth(`${month}-15T12:00:00`)}</h3>
          <span className={styles.monthMeta}>
            {ready ? (ready.total_sessions ? plural(ready.total_sessions, 'treino', 'treinos') : 'Nenhum treino') : ' '}
          </span>
        </div>
        <button type="button" className={styles.nav} onClick={() => go(1)} disabled={month >= maxMonth} aria-label="Próximo mês">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((day, i) => <span key={i}>{day}</span>)}
      </div>

      <ul className={styles.weeks}>
        {monthWeeks(month).map(days => {
          const start = days[0];
          const count = days.reduce((sum, day) => sum + (trained.get(day) ?? 0), 0);
          return (
            <li key={start}>
              <button
                type="button"
                className={`${styles.week} ${start === selected ? styles.weekSelected : ''}`}
                onClick={() => onPick(start)}
                aria-pressed={start === selected}
                aria-label={`Semana de ${formatDay(start)} a ${formatDay(days[6])}${count ? `, ${plural(count, 'treino', 'treinos')}` : ''}`}
              >
                {days.map(day => (
                  <span
                    key={day}
                    aria-hidden="true"
                    className={[
                      styles.cell,
                      day.slice(0, 7) !== month ? styles.outside : '',
                      trained.get(day) ? styles.trained : '',
                      day === today ? styles.today : '',
                      day > today ? styles.future : '',
                    ].join(' ')}
                  >
                    {Number(day.slice(8))}
                  </span>
                ))}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
