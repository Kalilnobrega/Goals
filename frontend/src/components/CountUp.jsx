'use client';
import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 900;
const NUMBER_PATTERN = /^(\D*?)(-?\d[\d.]*)(\D*)$/;
const formatter = new Intl.NumberFormat('pt-BR');

function parse(value) {
  if (typeof value === 'number') return { prefix: '', target: value, suffix: '' };
  const match = NUMBER_PATTERN.exec(String(value ?? ''));
  if (!match) return null;
  const target = Number(match[2].replace(/\./g, ''));
  return Number.isFinite(target) ? { prefix: match[1], target, suffix: match[3] } : null;
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export default function CountUp({ value }) {
  const parsed = parse(value);
  const target = parsed?.target;
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    if (target === undefined) return;
    const from = shownRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame;
    let startedAt;

    const step = (now) => {
      startedAt ??= now;
      const progress = reduce ? 1 : Math.min((now - startedAt) / DURATION_MS, 1);
      const next = Math.round(from + (target - from) * easeOutCubic(progress));
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  if (!parsed) return value;

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {parsed.prefix}{formatter.format(shown)}{parsed.suffix}
    </span>
  );
}
