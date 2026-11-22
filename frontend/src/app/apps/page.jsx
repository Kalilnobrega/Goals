'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { Target, Dumbbell, ArrowRight, UserCircle2 } from 'lucide-react';
import { getUserName } from '../../lib/auth';
import { getLastApp, saveLastApp } from '../../lib/apps';
import styles from './page.module.css';

const APPS = [
  {
    key: 'goals',
    href: '/',
    name: 'Goals',
    description: 'Metas, hábitos e tarefas do dia a dia',
    icon: Target,
    className: 'goals',
  },
  {
    key: 'gym',
    href: '/gym',
    name: <>Gym<span>Goals</span></>,
    label: 'GymGoals',
    description: 'Fichas de treino, cargas e evolução na academia',
    icon: Dumbbell,
    className: 'gym',
  },
];

const noSubscribe = () => () => {};

export default function AppsPage() {
  const userName = useSyncExternalStore(noSubscribe, getUserName, () => '');
  const lastApp = useSyncExternalStore(noSubscribe, getLastApp, () => null);
  const firstName = userName.split(' ')[0];

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>{firstName ? `Olá, ${firstName}.` : 'Olá.'}</h1>
          <p className={styles.subtitle}>Qual app você quer abrir?</p>
        </header>

        <ul className={styles.list}>
          {APPS.map(({ key, href, name, label, description, icon: Icon, className }) => (
            <li key={key}>
              <Link
                href={href}
                className={`${styles.card} ${styles[className]}`}
                onClick={() => saveLastApp(key)}
                aria-label={`Abrir ${label ?? name}${lastApp === key ? ', último usado' : ''}`}
              >
                <span className={styles.icon}><Icon size={26} strokeWidth={2.2} /></span>
                <span className={styles.text}>
                  <span className={styles.nameRow}>
                    <span className={styles.name}>{name}</span>
                    {lastApp === key && <span className={styles.badge}>Último usado</span>}
                  </span>
                  <span className={styles.description}>{description}</span>
                </span>
                <ArrowRight size={20} className={styles.arrow} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

        <footer className={styles.footer}>
          <p>Você pode trocar de app a qualquer momento tocando na logo no topo da tela, sem entrar de novo.</p>
          <Link href="/account" className={styles.account}><UserCircle2 size={16} /> Minha conta</Link>
        </footer>
      </div>
    </main>
  );
}
