'use client';
import { ViewTransition, useLayoutEffect, useRef } from 'react';
import { holdUntilLanded } from '../lib/pageSlide';

export default function Template({ children }) {
  const frame = useRef(null);

  useLayoutEffect(() => {
    holdUntilLanded(frame.current);
  }, []);

  return (
    <div className="page-clip">
      <ViewTransition
        enter={{ 'tab-forward': 'tab-in-right', 'tab-back': 'tab-in-left', default: 'none' }}
        exit={{ 'tab-forward': 'tab-out-left', 'tab-back': 'tab-out-right', default: 'none' }}
        default="none"
      >
        <div className="page-frame" ref={frame}>{children}</div>
      </ViewTransition>
    </div>
  );
}
