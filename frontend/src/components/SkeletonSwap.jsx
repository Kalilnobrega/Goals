'use client';
import { useState } from 'react';
import styles from './SkeletonSwap.module.css';

export default function SkeletonSwap({ loading, skeleton, children, className = '' }) {
  const [showSkeleton, setShowSkeleton] = useState(loading);
  const [wasLoading, setWasLoading] = useState(loading);

  if (loading !== wasLoading) {
    setWasLoading(loading);
    if (loading) setShowSkeleton(true);
  }

  const leaving = !loading && showSkeleton;

  const finish = (event) => {
    if (leaving && event.target === event.currentTarget) setShowSkeleton(false);
  };

  return (
    <div className={`${styles.swap} ${className}`}>
      {!loading && (
        <div className={`${styles.layer} ${leaving ? styles.contentIn : ''}`}>{children}</div>
      )}
      {showSkeleton && (
        <div
          className={`${styles.layer} ${leaving ? styles.skeletonOut : ''}`}
          aria-hidden={leaving || undefined}
          onAnimationEnd={finish}
        >
          {skeleton}
        </div>
      )}
    </div>
  );
}
