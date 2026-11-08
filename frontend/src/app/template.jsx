'use client';
import { ViewTransition } from 'react';

export default function Template({ children }) {
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
