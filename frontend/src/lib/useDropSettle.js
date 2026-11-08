'use client';
import { useState } from 'react';

export function useDropSettle(dragging) {
  const [wasDragging, setWasDragging] = useState(dragging);
  const [settling, setSettling] = useState(false);

  if (dragging !== wasDragging) {
    setWasDragging(dragging);
    if (!dragging) setSettling(true);
  }

  const endSettle = (event) => {
    if (event.target === event.currentTarget) setSettling(false);
  };

  return [settling, endSettle];
}
