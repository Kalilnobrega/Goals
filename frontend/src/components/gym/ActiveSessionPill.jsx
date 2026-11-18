'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getActiveSession } from '../../lib/api';
import { formatDuration, plural } from '../../lib/gym';
import useNow from './useNow';
import styles from './ActiveSessionPill.module.css';

export default function ActiveSessionPill() {
  const pathname = usePathname();
  const now = useNow();
  const [session, setSession] = useState(null);
  const [last, setLast] = useState(null);
  const [seen, setSeen] = useState(false);
  const onSession = pathname.startsWith('/gym/session/');

  useEffect(() => {
    let current = true;
    const load = () => getActiveSession()
      .then(data => { if (current) setSession(data ?? null); })
      .catch(() => {});
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pathname]);

  if (session && session !== last) setLast(session);
  const shown = session ?? last;
  const hidden = !session || onSession;
  if (!hidden && !seen) setSeen(true);
  if (!shown || !seen) return null;

  return (
    <Link
      href={`/gym/session/${shown.id}`}
      className={`${styles.pill} ${hidden ? styles.hidden : ''}`}
      data-session-pill=""
      data-hidden={hidden ? '' : undefined}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
    >
      <span className={styles.pulse} aria-hidden="true" />
      <span className={styles.text}>
        <span className={styles.name}>{shown.name}</span>
        <span className={styles.meta}>
          Em andamento{now ? ` · ${formatDuration(now - new Date(shown.started_at).getTime())}` : ''} · {plural(shown.total_sets, 'série', 'séries')}
        </span>
      </span>
      <span className={styles.cta}>Continuar <ChevronRight size={17} /></span>
    </Link>
  );
}
