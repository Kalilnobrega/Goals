'use client';
import { ViewTransition, useLayoutEffect, useRef } from 'react';
import { holdUntilLanded } from '../lib/pageSlide';

export default function Template({ children }) {
  const frame = useRef(null);

  useLayoutEffect(() => {
    holdUntilLanded(frame.current);
  }, []);

  return (
    <ViewTransition default="none">
      <div className="page-clip">
        <div className="page-frame" ref={frame}>{children}</div>
      </div>
    </ViewTransition>
  );
}
