'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { Move } from 'lucide-react';
import { FORMATS } from '../../../lib/photos';
import styles from './CropFrame.module.css';

export default function CropFrame({ photo, onMove, size = 'large', format = 'portrait' }) {
  const frameRef = useRef(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  const overflow = () => {
    const frame = frameRef.current.getBoundingClientRect();
    const scale = Math.max(frame.width / photo.width, frame.height / photo.height);
    return { x: photo.width * scale - frame.width, y: photo.height * scale - frame.height };
  };

  const start = (event) => {
    if (!onMove) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, position: photo.position, overflow: overflow() };
    setDragging(true);
  };

  const move = (event) => {
    if (!drag.current) return;
    const { x, y, position, overflow: room } = drag.current;
    const clamp = (value) => Math.min(100, Math.max(0, value));
    onMove({
      x: room.x > 0 ? clamp(position.x - ((event.clientX - x) / room.x) * 100) : 50,
      y: room.y > 0 ? clamp(position.y - ((event.clientY - y) / room.y) * 100) : 50,
    });
  };

  const end = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={frameRef}
      className={`${styles.frame} ${styles[size]} ${onMove ? styles.movable : ''}`}
      style={{ aspectRatio: FORMATS[format].css }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <Image
        src={photo.url}
        alt=""
        fill
        unoptimized
        draggable={false}
        sizes={size === 'large' ? '(max-width: 760px) 100vw, 480px' : '96px'}
        style={{ objectPosition: `${photo.position.x}% ${photo.position.y}%` }}
      />
      {onMove && size === 'large' && dragging && (
        <span className={styles.grid} aria-hidden="true">
          <span className={styles.lineV} style={{ left: '33.333%' }} />
          <span className={styles.lineV} style={{ left: '66.666%' }} />
          <span className={styles.lineH} style={{ top: '33.333%' }} />
          <span className={styles.lineH} style={{ top: '66.666%' }} />
        </span>
      )}
      {onMove && size === 'large' && !dragging && <span className={styles.hint}><Move size={14} /> Arraste para ajustar</span>}
    </div>
  );
}
