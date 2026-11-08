'use client';
import { ViewTransition, useLayoutEffect } from 'react';
import { holdUntilLanded } from '../lib/pageSlide';

export default function Template({ children }) {
  useLayoutEffect(holdUntilLanded, []);

  return (
    <ViewTransition
      enter={{ 'tab-forward': 'tab-in-right', 'tab-back': 'tab-in-left', default: 'none' }}
      exit={{ 'tab-forward': 'tab-out-left', 'tab-back': 'tab-out-right', default: 'none' }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
