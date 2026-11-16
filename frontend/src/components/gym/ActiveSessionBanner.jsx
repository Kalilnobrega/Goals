'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getActiveSession } from '../../lib/api';
import { formatDuration, plural } from '../../lib/gym';
import useNow from './useNow';
import styles from './ActiveSessionBanner.module.css';

export default function ActiveSessionBanner() {
  const [session, setSession] = useState(null);
  const now = useNow();

  useEffect(() => {
    getActiveSession().then(setSession).catch(() => {});
  }, []);

  if (!session) return null;

  return (
    <Link href={`/gym/session/${session.id}`} className={styles.banner}>
      <span className={styles.pulse} aria-hidden="true" />
      <span className={styles.text}>
        <span className={styles.kicker}>Treino em andamento</span>
        <span className={styles.name}>{session.name}</span>
        <span className={styles.meta}>
          {now ? `${formatDuration(now - new Date(session.started_at).getTime())} · ` : ''}
          {plural(session.total_sets, 'série', 'séries')}
        </span>
      </span>
      <span className={styles.cta}>Continuar <ChevronRight size={18} /></span>
    </Link>
  );
}
