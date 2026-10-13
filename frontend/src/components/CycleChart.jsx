'use client';
import { useEffect, useRef, useState } from 'react';
import { formatValue, niceTicks } from '../lib/numeric';
import { formatDeadline, cycleNotStarted } from '../lib/date';
import styles from './CycleChart.module.css';

const HEIGHT = 180;
const PAD = { top: 18, right: 8, bottom: 24, left: 40 };
const MAX_CYCLES = 12;

function shortDate(iso) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildCycleBars(goal, cycles) {
  const closed = [...cycles]
    .sort((a, b) => new Date(a.cycle_start) - new Date(b.cycle_start))
    .slice(-MAX_CYCLES)
    .map(c => {
      const numeric = c.achieved_value !== null && c.achieved_value !== undefined;
      return {
        key: c.id,
        start: c.cycle_start,
        end: c.cycle_end,
        achieved: numeric ? c.achieved_value : c.achieved_count,
        target: numeric ? c.target_value : c.target_count,
        state: c.completed ? 'done' : 'missed',
      };
    });

  if (goal.is_recurring && goal.cycle_start_date && goal.cycle_ends_at && !cycleNotStarted(goal)) {
    const target = goal.is_numeric ? goal.target_value : goal.recurrence_target ?? 1;
    const achieved = goal.is_numeric ? goal.current_value ?? 0 : goal.current_cycle_progress ?? 0;
    closed.push({
      key: 'current',
      start: goal.cycle_start_date,
      end: goal.cycle_ends_at,
      achieved,
      target,
      state: achieved >= target ? 'done' : 'current',
      current: true,
    });
  }
  return closed;
}

export default function CycleChart({ goal, bars }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const unit = goal.is_numeric ? goal.unit : null;
  const ticks = niceTicks(0, Math.max(...bars.map(b => Math.max(b.achieved, b.target)), 1));
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(bars.length, 4);
  const barW = Math.min(Math.max(slot * 0.6, 8), 40);
  const offset = PAD.left + (plotW - slot * bars.length) / 2;

  const x = i => offset + slot * i + (slot - barW) / 2;
  const y = v => PAD.top + (1 - v / (yMax || 1)) * plotH;
  const labelEvery = Math.ceil(bars.length / Math.max(Math.floor(plotW / 44), 1));

  const activeBar = active !== null ? bars[active] : null;

  return (
    <div className={styles.chart} ref={ref}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={`Ciclos de ${goal.title}`} onMouseLeave={() => setActive(null)}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={styles.grid} />
              <text x={PAD.left - 8} y={y(t)} className={styles.axis} textAnchor="end" dominantBaseline="middle">
                {formatValue(t)}
              </text>
            </g>
          ))}

          {bars.map((bar, i) => {
            const top = y(Math.min(bar.achieved, yMax));
            const height = Math.max(PAD.top + plotH - top, bar.achieved > 0 ? 2 : 0);
            return (
              <g
                key={bar.key}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                className={styles.barGroup}
              >
                <rect x={offset + slot * i} y={PAD.top} width={slot} height={plotH} className={styles.hit} />
                <rect
                  x={x(i)}
                  y={PAD.top + plotH - height}
                  width={barW}
                  height={height}
                  rx={Math.min(5, barW / 3)}
                  className={styles.bar}
                  data-state={bar.state}
                  data-active={i === active || undefined}
                />
                <line
                  x1={x(i) - 3}
                  x2={x(i) + barW + 3}
                  y1={y(bar.target)}
                  y2={y(bar.target)}
                  className={styles.target}
                />
                {(i % labelEvery === (bars.length - 1) % labelEvery) && (
                  <text x={x(i) + barW / 2} y={HEIGHT - 6} className={styles.axis} textAnchor="middle">
                    {bar.current ? 'atual' : shortDate(bar.start)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {activeBar && (
        <div
          className={styles.tooltip}
          style={{
            left: Math.min(Math.max(x(active) + barW / 2, 80), width - 80),
            top: y(Math.max(activeBar.achieved, activeBar.target)),
          }}
        >
          <strong>
            {formatValue(activeBar.achieved)} / {formatValue(activeBar.target, unit)}
            {activeBar.current ? ' · ciclo atual' : activeBar.state === 'done' ? ' · batido' : ' · não batido'}
          </strong>
          <span>{formatDeadline(activeBar.start)} – {formatDeadline(activeBar.end)}</span>
        </div>
      )}

      <div className={styles.legend}>
        <span><i data-state="done" /> Batido</span>
        <span><i data-state="missed" /> Não batido</span>
        {bars.some(b => b.current) && <span><i data-state="current" /> Em andamento</span>}
        <span><i className={styles.legendTarget} /> Meta do ciclo</span>
      </div>
    </div>
  );
}
