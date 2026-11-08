'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { prepareMorph } from './goalMorph';

const CLICK_BLOCK_AFTER_DRAG_MS = 400;

export function useCardLink(href, dragging) {
  const router = useRouter();
  const wasDragging = useRef(false);
  const dragEndedAt = useRef(0);

  useEffect(() => {
    if (dragging) {
      wasDragging.current = true;
      navigator.vibrate?.(12);
    } else if (wasDragging.current) {
      wasDragging.current = false;
      dragEndedAt.current = Date.now();
    }
  }, [dragging]);

  const onClick = (event) => {
    if (event.target.closest('button, a, input, textarea, select, label')) return;
    if (Date.now() - dragEndedAt.current < CLICK_BLOCK_AFTER_DRAG_MS) return;
    prepareMorph(event.currentTarget);
    router.push(href);
  };

  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter') return;
    prepareMorph(event.currentTarget);
    router.push(href);
  };

  return { role: 'link', tabIndex: 0, onClick, onKeyDown, 'data-card-href': href };
}
