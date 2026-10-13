'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './ActivityHeatmap.module.css';

const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const ROW_LABELS = ['Seg', '', 'Qua', '', 'Sex', '', ''];
const LEVELS = [0, 1, 2, 3, 4];

function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function levelFor(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

function describe(day) {
  const total = day.tasks + day.entries;
  const date = parseDay(day.date).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC',
  });
  if (total === 0) return { date, text: 'Nenhuma atividade' };
  const parts = [];
  if (day.tasks) parts.push(`${day.tasks} tarefa${day.tasks > 1 ? 's' : ''}`);
  if (day.entries) parts.push(`${day.entries} registro${day.entries > 1 ? 's' : ''}`);
  return { date, text: parts.join(' · ') };
}

export default function ActivityHeatmap({ days }) {
  const scrollRef = useRef(null);
  const [hover, setHover] = useState(null);

  const { weeks, monthLabels } = useMemo(() => {
    if (!days.length) return { weeks: [], monthLabels: [] };
    const offset = (parseDay(days[0].date).getUTCDay() + 6) % 7;
    const cells = [...Array(offset).fill(null), ...days];
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const monthLabels = [];
    let lastMonth = null;
    weeks.forEach((week, index) => {
      const first = week.find(Boolean);
      if (!first) return;
      const month = parseDay(first.date).getUTCMonth();
      if (month !== lastMonth) {
        if (index > 0 || offset < 4) monthLabels.push({ index, label: MONTHS[month] });
        lastMonth = month;
      }
    });
    return { weeks, monthLabels };
  }, [days]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [weeks]);

  const showTooltip = (event, day) => {
    const wrap = event.currentTarget.closest(`.${styles.wrap}`).getBoundingClientRect();
    const cell = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(cell.left - wrap.left + cell.width / 2, 70), wrap.width - 70);
    setHover({ day, x, y: cell.top - wrap.top });
  };

  const tooltip = hover && describe(hover.day);

  return (
    <div className={styles.wrap} onMouseLeave={() => setHover(null)}>
      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.grid} style={{ '--weeks': weeks.length }}>
          <div className={styles.months}>
            {monthLabels.map(m => (
              <span key={m.index} style={{ gridColumn: m.index + 1 }}>{m.label}</span>
            ))}
          </div>
          <div className={styles.rowLabels}>
            {ROW_LABELS.map((label, i) => <span key={i}>{label}</span>)}
          </div>
          <div className={styles.cells}>
            {weeks.map((week, w) => (
              <div key={w} className={styles.week}>
                {Array.from({ length: 7 }).map((_, d) => {
                  const day = week[d];
                  if (!day) return <span key={d} className={styles.empty} />;
                  const level = levelFor(day.tasks + day.entries);
                  const { date, text } = describe(day);
                  return (
                    <span
                      key={d}
                      className={styles.cell}
                      data-level={level}
                      aria-label={`${date}: ${text}`}
                      onMouseEnter={e => showTooltip(e, day)}
                      onClick={e => showTooltip(e, day)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {tooltip && (
        <div className={styles.tooltip} style={{ left: hover.x, top: hover.y }}>
          <strong>{tooltip.text}</strong>
          <span>{tooltip.date}</span>
        </div>
      )}

      <div className={styles.legend}>
        <span>Menos</span>
        {LEVELS.map(level => <span key={level} className={styles.cell} data-level={level} />)}
        <span>Mais</span>
      </div>
    </div>
  );
}
