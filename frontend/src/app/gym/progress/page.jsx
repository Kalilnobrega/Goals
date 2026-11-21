'use client';
import Link from 'next/link';
import { Activity, CalendarCheck, ChevronRight, ClipboardList, Dumbbell, HeartPulse, Scale } from 'lucide-react';
import styles from './progress.module.css';
import hub from './hub.module.css';

const AREAS = [
  { href: '/gym/progress/geral', icon: Activity, title: 'Geral', text: 'Resumo, frequência, constância e recordes' },
  { href: '/gym/progress/planos', icon: CalendarCheck, title: 'Planos', text: 'Aderência ao plano e dias treinados' },
  { href: '/gym/progress/workouts', icon: ClipboardList, title: 'Fichas', text: 'Evolução e cumprimento de cada ficha' },
  { href: '/gym/progress/exercises', icon: Dumbbell, title: 'Exercícios', text: 'Cargas, recordes e progressão' },
  { href: '/gym/progress/cardio', icon: HeartPulse, title: 'Cardio', text: 'Tempo, metas cumpridas e aparelhos' },
  { href: '/gym/progress/body', icon: Scale, title: 'Peso corporal', text: 'Pesagens, tendência e meta' },
];

export default function ProgressHubPage() {
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Evolução</h1>
        <p className={styles.subtitle}>Escolha o que você quer acompanhar</p>
      </header>
      <nav className={hub.grid} aria-label="Áreas da evolução">
        {AREAS.map(({ href, icon: Icon, title, text }, index) => (
          <Link key={href} href={href} className={hub.card} style={{ '--i': index }}>
            <span className={hub.top}>
              <span className={hub.icon}><Icon size={22} aria-hidden="true" /></span>
              <ChevronRight size={18} className={hub.chevron} aria-hidden="true" />
            </span>
            <span className={hub.title}>{title}</span>
            <span className={hub.text}>{text}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
