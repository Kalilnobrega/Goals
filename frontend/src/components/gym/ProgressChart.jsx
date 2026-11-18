'use client';
import { useEffect, useRef, useState } from 'react';
import { niceTicks } from '../../lib/numeric';
import styles from './ProgressChart.module.css';

const HEIGHT = 200;
const PAD = { top: 16, right: 16, bottom: 26, left: 44 };
const DAY = 86400000;

const shortDate = (time) => new Date(time).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

export default function ProgressChart({ points, format, axisFormat = format, label, target = null }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const values = [...points.map(p => p.value), ...(target !== null ? [target] : [])];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const margin = (high - low) * 0.1 || Math.max(Math.abs(high) * 0.05, 1);
  const ticks = niceTicks(Math.max(low - margin, 0), high + margin);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const first = points[0].time;
  const last = points[points.length - 1].time;
  const single = last - first < DAY / 2;
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const x = t => (single ? PAD.left + plotW / 2 : PAD.left + ((t - first) / (last - first)) * plotW);
  const y = v => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time)},${y(p.value)}`).join(' ');
  const area = points.length > 1
    ? `${path} L${x(last)},${PAD.top + plotH} L${x(first)},${PAD.top + plotH} Z`
    : '';

  const pick = (clientX) => {
    const rect = ref.current.getBoundingClientRect();
    const mx = clientX - rect.left;
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.time) - mx) < Math.abs(x(points[nearest].time) - mx)) nearest = i;
    });
    setActive(nearest);
  };

  const handleKey = (event) => {
    if (event.key === 'ArrowRight') setActive(i => Math.min((i ?? -1) + 1, points.length - 1));
    else if (event.key === 'ArrowLeft') setActive(i => Math.max((i ?? points.length) - 1, 0));
    else if (event.key === 'Escape') setActive(null);
    else return;
    event.preventDefault();
  };

  const current = active !== null ? points[active] : null;
  const tooltipLeft = current ? Math.min(Math.max(x(current.time), 70), width - 70) : 0;

  return (
    <div
      ref={ref}
      className={styles.chart}
      tabIndex={0}
      role="group"
      aria-label={`${label}. Use as setas para percorrer os pontos.`}
      onPointerMove={e => pick(e.clientX)}
      onPointerDown={e => pick(e.clientX)}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}
      onKeyDown={handleKey}
      onBlur={() => setActive(null)}
    >
      {width > 0 && (
        <svg width={width} height={HEIGHT} aria-hidden="true">
          {ticks.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={styles.grid} />
              <text x={PAD.left - 8} y={y(t)} className={styles.axis} textAnchor="end" dominantBaseline="middle">
                {axisFormat(t)}
              </text>
            </g>
          ))}

          {single ? (
            <text x={x(first)} y={HEIGHT - 6} className={styles.axis} textAnchor="middle">{shortDate(first)}</text>
          ) : (
            <>
              <text x={PAD.left} y={HEIGHT - 6} className={styles.axis}>{shortDate(first)}</text>
              <text x={width - PAD.right} y={HEIGHT - 6} className={styles.axis} textAnchor="end">{shortDate(last)}</text>
            </>
          )}

          {target !== null && (
            <g>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(target)} y2={y(target)} className={styles.target} />
              <text x={width - PAD.right} y={y(target) - 5} className={styles.targetLabel} textAnchor="end">Meta {format(target)}</text>
            </g>
          )}

          {area && <path d={area} className={styles.area} />}
          {points.length > 1 && <path d={path} className={styles.line} />}

          {current && (
            <line x1={x(current.time)} x2={x(current.time)} y1={PAD.top} y2={PAD.top + plotH} className={styles.crosshair} />
          )}

          {points.map((p, i) => (
            <circle
              key={p.key}
              cx={x(p.time)}
              cy={y(p.value)}
              r={i === active ? 5.5 : points.length <= 12 || i === points.length - 1 ? 4 : 0}
              className={`${styles.dot} ${i === active ? styles.dotActive : ''}`}
            />
          ))}
        </svg>
      )}

      {current && (
        <div className={styles.tooltip} style={{ left: tooltipLeft, top: y(current.value) }} role="status">
          <strong>{format(current.value)}</strong>
          {current.detail && <span>{current.detail}</span>}
          <span>{new Date(current.time).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      )}
    </div>
  );
}
