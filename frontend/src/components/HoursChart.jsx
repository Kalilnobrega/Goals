'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './HoursChart.module.css';

const HEIGHT = 150;
const PAD = { top: 10, right: 4, bottom: 22, left: 4 };
const LABELED_HOURS = [0, 6, 12, 18, 23];

export const DAY_PERIODS = [
  { label: 'Madrugada', phrase: 'de madrugada', from: 0, to: 6 },
  { label: 'Manhã', phrase: 'de manhã', from: 6, to: 12 },
  { label: 'Tarde', phrase: 'à tarde', from: 12, to: 18 },
  { label: 'Noite', phrase: 'à noite', from: 18, to: 24 },
];

export default function HoursChart({ hours }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const max = Math.max(...hours, 1);
  const peak = hours.indexOf(Math.max(...hours));
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / 24;
  const gap = 2;
  const barW = Math.max(slot - gap, 2);
  const baseline = PAD.top + plotH;

  const barPath = (x, h) => {
    if (h <= 0) return '';
    const r = Math.min(3, barW / 2, h);
    return `M${x},${baseline} V${baseline - h + r} Q${x},${baseline - h} ${x + r},${baseline - h} H${x + barW - r} Q${x + barW},${baseline - h} ${x + barW},${baseline - h + r} V${baseline} Z`;
  };

  return (
    <div className={styles.chart} ref={ref} onMouseLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label="Atividades por hora do dia">
          <line x1={PAD.left} x2={width - PAD.right} y1={baseline} y2={baseline} className={styles.baseline} />
          {hours.map((count, hour) => {
            const x = PAD.left + hour * slot + gap / 2;
            const h = (count / max) * plotH;
            return (
              <g key={hour} onMouseEnter={() => setActive(hour)} onClick={() => setActive(hour)}>
                <rect x={PAD.left + hour * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                <path
                  d={barPath(x, h)}
                  className={`${styles.bar} ${hour === peak && count > 0 ? styles.peak : ''} ${active === hour ? styles.active : ''}`}
                />
              </g>
            );
          })}
          {LABELED_HOURS.map(hour => (
            <text
              key={hour}
              x={PAD.left + hour * slot + slot / 2}
              y={HEIGHT - 6}
              className={styles.axis}
              textAnchor="middle"
            >
              {hour}h
            </text>
          ))}
        </svg>
      )}

      {active !== null && (
        <div
          className={styles.tooltip}
          style={{
            left: Math.min(Math.max(PAD.left + active * slot + slot / 2, 60), width - 60),
            top: baseline - (hours[active] / max) * plotH,
          }}
        >
          <strong>{hours[active]} atividade{hours[active] !== 1 ? 's' : ''}</strong>
          <span>{active}h – {active + 1}h</span>
        </div>
      )}
    </div>
  );
}
