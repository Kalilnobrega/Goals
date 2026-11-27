'use client';
import useNow from './useNow';

export default function SessionClock({ startedAt, format }) {
  const now = useNow();
  if (!now) return '—';
  return format((now - new Date(startedAt).getTime()) / 1000);
}
