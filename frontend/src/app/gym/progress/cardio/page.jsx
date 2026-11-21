'use client';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import CardioDetails from '../../../../components/gym/CardioDetails';
import styles from '../progress.module.css';

export default function CardioProgressPage() {
  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/gym/progress" className={styles.back}><ChevronLeft size={18} /> Evolução</Link>
        <h1 className={styles.detailTitle}>Cardio</h1>
        <p className={styles.subtitle}>Tempo, metas e aparelhos do seu cardio</p>
      </div>
      <CardioDetails />
    </div>
  );
}
