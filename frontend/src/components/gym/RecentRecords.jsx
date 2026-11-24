import Link from 'next/link';
import { Building2, Trophy, ChevronRight } from 'lucide-react';
import { formatDay, formatKg } from '../../lib/gym';
import styles from './RecentRecords.module.css';

export default function RecentRecords({ records }) {
  if (!records.length) return null;

  return (
    <section className={styles.card} aria-labelledby="recent-records-title">
      <div className={styles.header}>
        <Trophy size={16} className={styles.icon} aria-hidden="true" />
        <h2 id="recent-records-title" className={styles.title}>Recordes recentes</h2>
        <span className={styles.hint}>últimos 14 dias</span>
      </div>
      <ul className={styles.list}>
        {records.map((record, index) => (
          <li key={`${record.session_id}-${record.name}-${index}`}>
            <Link href={`/gym/history/${record.session_id}`} className={styles.row}>
              <span className={styles.main}>
                <span className={styles.name}>{record.name}</span>
                <span className={styles.meta}>{formatDay(record.date)} · antes {formatKg(record.previous_kg)} kg</span>
                {record.gym_name && (
                  <span className={styles.gym}><Building2 size={12} aria-hidden="true" /> {record.gym_name}</span>
                )}
              </span>
              <span className={styles.value}>
                {formatKg(record.weight_kg)} kg × {record.reps}
                <small>+{formatKg(Math.round((record.weight_kg - record.previous_kg) * 100) / 100)} kg</small>
              </span>
              <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
