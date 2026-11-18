'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatDuration, formatVolume, mondayOf, parseDay, plural } from '../../lib/gym';
import styles from './TrainingHeatmap.module.css';

const WEEKS = 53;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ROW_LABELS = ['Seg', '', 'Qua', '', 'Sex', '', ''];
const LEVELS = [0, 1, 2, 3, 4];

const dateLabel = (iso) => parseDay(iso)
  .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
  .replace(/\./g, '');

function levelFor(day) {
  if (!day) return 0;
  if (day.sets < 12) return 1;
  if (day.sets < 20) return 2;
  if (day.sets < 28) return 3;
  return 4;
}

export default function TrainingHeatmap({ activity, today }) {
  const scrollRef = useRef(null);
  const [hover, setHover] = useState(null);

  const { weeks, months, trainedDays } = useMemo(() => {
    const byDate = new Map(activity.map(day => [day.date, day]));
    const first = addDays(mondayOf(today), -(WEEKS - 1) * 7);
    const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => {
      const iso = addDays(first, w * 7 + d);
      if (iso > today) return null;
      return { iso, day: byDate.get(iso) ?? null };
    }));
    const months = [];
    let last = null;
    weeks.forEach((week, index) => {
      const month = parseDay(week[0].iso).getMonth();
      if (month !== last) {
        if (index > 0) months.push({ index, label: MONTHS[month] });
        last = month;
      }
    });
    return { weeks, months, trainedDays: activity.filter(day => day.date >= first).length };
  }, [activity, today]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [weeks]);

  const show = (event, cell) => {
    const wrap = event.currentTarget.closest(`.${styles.wrap}`).getBoundingClientRect();
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(box.left - wrap.left + box.width / 2, 100), wrap.width - 100);
    setHover({ cell, x, y: box.top - wrap.top });
  };

  return (
    <div className={styles.wrap} onMouseLeave={() => setHover(null)}>
      <p className={styles.total}>
        <strong>{plural(trainedDays, 'dia treinado', 'dias treinados')}</strong> nos últimos 12 meses
      </p>

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.grid} style={{ '--weeks': WEEKS }}>
          <div className={styles.months}>
            {months.map(m => <span key={m.index} style={{ gridColumn: m.index + 1 }}>{m.label}</span>)}
          </div>
          <div className={styles.rowLabels}>
            {ROW_LABELS.map((label, i) => <span key={i}>{label}</span>)}
          </div>
          <div className={styles.cells}>
            {weeks.map((week, w) => (
              <div key={w} className={styles.week}>
                {week.map((cell, d) => {
                  if (!cell) return <span key={d} className={styles.empty} />;
                  const { iso, day } = cell;
                  const summary = day
                    ? `${day.workouts.join(' + ')} · ${plural(day.sets, 'série', 'séries')}`
                    : 'Sem treino';
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`${styles.cell} ${iso === today ? styles.today : ''}`}
                      data-level={levelFor(day)}
                      style={{ '--w': w, '--d': d }}
                      aria-label={`${dateLabel(iso)}: ${summary}`}
                      onMouseEnter={e => show(e, cell)}
                      onFocus={e => show(e, cell)}
                      onClick={e => show(e, cell)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hover && (
        <div className={styles.tooltip} style={{ left: hover.x, top: hover.y }} role="status">
          {hover.cell.day ? (
            <>
              <strong>{hover.cell.day.workouts.join(' + ')}</strong>
              <span>
                {plural(hover.cell.day.sets, 'série', 'séries')} · {formatDuration(hover.cell.day.minutes * 60000)}
                {hover.cell.day.volume_kg > 0 ? ` · ${formatVolume(hover.cell.day.volume_kg)}` : ''}
              </span>
            </>
          ) : (
            <strong>Sem treino</strong>
          )}
          <span className={styles.tooltipDate}>{dateLabel(hover.cell.iso)}</span>
        </div>
      )}

      <div className={styles.legend}>
        <span>Menos séries</span>
        {LEVELS.map(level => <span key={level} className={styles.legendCell} data-level={level} />)}
        <span>Mais</span>
      </div>
    </div>
  );
}
