'use client';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { GeneralStats } from '../../../../components/gym/ProgressStats';
import styles from '../progress.module.css';

export default function GeneralProgressPage() {
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/gym/progress" className={styles.back}><ChevronLeft size={18} /> Evolução</Link>
        <h1 className={styles.detailTitle}>Geral</h1>
        <p className={styles.subtitle}>Seus números de treino, do volume aos recordes</p>
      </div>
      <GeneralStats />
    </div>
  );
}
