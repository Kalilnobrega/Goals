'use client';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PlanStats } from '../../../../components/gym/ProgressStats';
import styles from '../progress.module.css';

export default function PlanProgressPage() {
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/gym/progress" className={styles.back}><ChevronLeft size={18} /> Evolução</Link>
        <h1 className={styles.detailTitle}>Planos</h1>
        <p className={styles.subtitle}>Quanto do seu plano semanal você está cumprindo</p>
      </div>
      <PlanStats />
    </div>
  );
}
