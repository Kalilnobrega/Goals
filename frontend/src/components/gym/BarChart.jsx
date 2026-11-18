'use client';
import { useEffect, useRef, useState } from 'react';
import { niceTicks } from '../../lib/numeric';
import styles from './BarChart.module.css';

const HEIGHT = 180;
const PAD = { top: 12, right: 8, bottom: 24, left: 40 };
const MAX_BAR = 28;

export default function BarChart({ bars, format, axisFormat = format, label }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const max = Math.max(...bars.map(b => b.value), 0);
  const ticks = max > 0 ? niceTicks(0, max, 3) : [0, 1];
  const top = ticks[ticks.length - 1] || 1;
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / bars.length;
  const gap = Math.min(4, slot * 0.25);
  const barW = Math.min(Math.max(slot - gap, 1), MAX_BAR);
  const y = v => PAD.top + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(bars.length / Math.max(Math.floor(plotW / 44), 1));

  const pick = (clientX) => {
    const rect = ref.current.getBoundingClientRect();
    const index = Math.floor((clientX - rect.left - PAD.left) / slot);
    setActive(Math.min(Math.max(index, 0), bars.length - 1));
  };

  const handleKey = (event) => {
    if (event.key === 'ArrowRight') setActive(i => Math.min((i ?? -1) + 1, bars.length - 1));
    else if (event.key === 'ArrowLeft') setActive(i => Math.max((i ?? bars.length) - 1, 0));
    else if (event.key === 'Escape') setActive(null);
    else return;
    event.preventDefault();
  };

  const current = active !== null ? bars[active] : null;
  const tooltipLeft = current ? Math.min(Math.max(PAD.left + slot * active + slot / 2, 70), width - 70) : 0;

  return (
    <div
      ref={ref}
      className={styles.chart}
      tabIndex={0}
      role="group"
      aria-label={`${label}. Use as setas para percorrer as barras.`}
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
          {bars.map((bar, i) => {
            const x = PAD.left + slot * i + (slot - barW) / 2;
            const h = bar.value > 0 ? Math.max(plotH - (y(bar.value) - PAD.top), 3) : 0;
            return (
              <g key={bar.key}>
                {h > 0 && (
                  <rect
                    x={x}
                    y={PAD.top + plotH - h}
                    width={barW}
                    height={h}
                    rx={Math.min(4, barW / 2)}
                    className={`${styles.bar} ${i === active ? styles.barActive : ''} ${active !== null && i !== active ? styles.barDim : ''}`}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={HEIGHT - 6} className={styles.axis} textAnchor="middle">{bar.label}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {current && (
        <div className={styles.tooltip} style={{ left: tooltipLeft }} role="status">
          <strong>{format(current.value)}</strong>
          <span>{current.detail}</span>
        </div>
      )}
    </div>
  );
}
