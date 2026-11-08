'use client';
import { useEffect, useRef, useState } from 'react';
import { whenLanded } from '../lib/pageSlide';

const DEFAULT_DURATION_MS = 900;
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

export default function CountUp({ value, duration = DEFAULT_DURATION_MS }) {
  const parsed = parse(value);
  const target = parsed?.target;
  const isNumber = target !== undefined;
  const [shown, setShown] = useState(0);
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(0);
  const spanRef = useRef(null);

  useEffect(() => {
    const el = spanRef.current;
    if (!el || !('IntersectionObserver' in window)) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    let release = () => {};
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect();
        release = whenLanded(() => setVisible(true));
      }
    }, { rootMargin: '0px 0px -6% 0px' });
    io.observe(el);
    return () => {
      io.disconnect();
      release();
    };
  }, [isNumber]);

  useEffect(() => {
    if (target === undefined || !visible) return;
    const from = shownRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame;
    let startedAt;

    const step = (now) => {
      startedAt ??= now;
      const progress = reduce ? 1 : Math.min((now - startedAt) / duration, 1);
      const next = Math.round(from + (target - from) * easeOutCubic(progress));
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, visible]);

  if (!parsed) return value;

  return (
    <span ref={spanRef} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {parsed.prefix}{formatter.format(shown)}{parsed.suffix}
    </span>
  );
}
