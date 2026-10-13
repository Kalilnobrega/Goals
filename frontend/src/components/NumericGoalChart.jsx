'use client';
import { useEffect, useRef, useState } from 'react';
import { formatValue } from '../lib/numeric';
import styles from './NumericGoalChart.module.css';

const HEIGHT = 170;
const PAD = { top: 14, right: 14, bottom: 24, left: 44 };

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * power).find(s => s >= raw);
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(10)));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function shortDate(date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function NumericGoalChart({ goal }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const points = goal.points.map(p => ({ ...p, time: new Date(p.date).getTime() }));
  const values = points.map(p => p.value);
  const ticks = niceTicks(
    Math.min(...values, goal.target_value),
    Math.max(...values, goal.target_value),
  );
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const first = points[0].time;
  const last = Math.max(points[points.length - 1].time, first + 86400000);
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const x = t => PAD.left + ((t - first) / (last - first)) * plotW;
  const y = v => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time)},${y(p.value)}`).join(' ');
  const area = points.length > 1
    ? `${path} L${x(points[points.length - 1].time)},${PAD.top + plotH} L${x(first)},${PAD.top + plotH} Z`
    : '';

  const handleMove = event => {
    const rect = ref.current.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.time) - mx) < Math.abs(x(points[nearest].time) - mx)) nearest = i;
    });
    setActive(nearest);
  };

  const activePoint = active !== null ? points[active] : null;
  const targetY = y(goal.target_value);

  return (
    <div className={styles.chart} ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Evolução de ${goal.title}`}
          onMouseMove={handleMove}
          onMouseLeave={() => setActive(null)}
        >
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={styles.grid} />
              <text x={PAD.left - 8} y={y(t)} className={styles.axis} textAnchor="end" dominantBaseline="middle">
                {formatValue(t)}
              </text>
            </g>
          ))}

          <text x={PAD.left} y={HEIGHT - 6} className={styles.axis}>{shortDate(new Date(first))}</text>
          <text x={width - PAD.right} y={HEIGHT - 6} className={styles.axis} textAnchor="end">
            {shortDate(new Date(last))}
          </text>

          <line x1={PAD.left} x2={width - PAD.right} y1={targetY} y2={targetY} className={styles.target} />
          <text x={width - PAD.right} y={targetY - 6} className={styles.targetLabel} textAnchor="end">
            meta {formatValue(goal.target_value, goal.unit)}
          </text>

          {area && <path d={area} className={styles.area} />}
          <path d={path} className={styles.line} />

          {activePoint && (
            <line
              x1={x(activePoint.time)} x2={x(activePoint.time)}
              y1={PAD.top} y2={PAD.top + plotH}
              className={styles.crosshair}
            />
          )}

          {points.map((p, i) => (
            <circle
              key={i}
              cx={x(p.time)}
              cy={y(p.value)}
              r={i === active ? 5 : i === points.length - 1 ? 4 : 0}
              className={styles.dot}
            />
          ))}
        </svg>
      )}

      {activePoint && (
        <div
          className={styles.tooltip}
          style={{ left: Math.min(Math.max(x(activePoint.time), 60), width - 60), top: y(activePoint.value) }}
        >
          <strong>{formatValue(activePoint.value, goal.unit)}</strong>
          <span>{new Date(activePoint.time).toLocaleDateString('pt-BR')}</span>
        </div>
      )}
    </div>
  );
}
