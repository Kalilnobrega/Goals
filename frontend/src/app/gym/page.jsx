'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { ClipboardList, Library, ChevronRight } from 'lucide-react';
import { getUserName } from '../../lib/auth';
import ActiveSessionBanner from '../../components/gym/ActiveSessionBanner';
import styles from './page.module.css';

const subscribeToUserName = (onChange) => {
  window.addEventListener('username-changed', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('username-changed', onChange);
    window.removeEventListener('storage', onChange);
  };
};

export default function GymHomePage() {
  const userName = useSyncExternalStore(subscribeToUserName, getUserName, () => '');
  const firstName = userName?.split(' ')[0];

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.kicker}>GymGoals</p>
        <h1 className={styles.title}>{firstName ? `Bora treinar, ${firstName}.` : 'Bora treinar.'}</h1>
        <p className={styles.subtitle}>Escolha uma ficha e registre cada série na hora. O histórico e a evolução chegam em seguida.</p>
      </header>

      <ActiveSessionBanner />

      <Link href="/gym/workouts" className={styles.card}>
        <span className={styles.cardIcon}><ClipboardList size={22} /></span>
        <span className={styles.cardText}>
          <span className={styles.cardTitle}>Fichas de treino</span>
          <span className={styles.cardMeta}>Exercícios, séries e repetições de cada treino</span>
        </span>
        <ChevronRight size={20} className={styles.cardChevron} aria-hidden="true" />
      </Link>

      <Link href="/gym/exercises" className={styles.card}>
        <span className={styles.cardIcon}><Library size={22} /></span>
        <span className={styles.cardText}>
          <span className={styles.cardTitle}>Biblioteca de exercícios</span>
          <span className={styles.cardMeta}>Veja os exercícios padrão e cadastre os seus</span>
        </span>
        <ChevronRight size={20} className={styles.cardChevron} aria-hidden="true" />
      </Link>
    </div>
  );
}
