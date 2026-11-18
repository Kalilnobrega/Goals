'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import styles from './MarqueeText.module.css';

const SPEED = 28;
const PAUSE_SHARE = 0.4;

export default function MarqueeText({ text, as: Tag = 'span', className = '' }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [distance, setDistance] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => setDistance(Math.max(0, Math.ceil(inner.scrollWidth - outer.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [text]);

  const moving = distance > 2;
  const duration = moving ? (distance / SPEED) / (1 - PAUSE_SHARE) : 0;

  return (
    <Tag ref={outerRef} className={`${styles.outer} ${className}`} title={moving ? text : undefined}>
      <span
        ref={innerRef}
        className={`${styles.inner} ${moving ? styles.moving : ''}`}
        style={moving ? { '--distance': `${-distance}px`, '--duration': `${duration * 2}s` } : undefined}
      >
        {text}
      </span>
    </Tag>
  );
}
