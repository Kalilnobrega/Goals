import Link from 'next/link';
import { AtSign } from 'lucide-react';
import styles from './social.module.css';

export default function UsernameSetup() {
  return (
    <section className={styles.setup}>
      <span className={styles.setupIcon}><AtSign size={22} /></span>
      <h2 className={styles.setupTitle}>Escolha seu @username</h2>
      <p className={styles.setupText}>É por ele que seus amigos vão te encontrar, te adicionar e te chamar para desafios.</p>
      <Link href="/gym/account" className={styles.setupButton}>Criar username</Link>
    </section>
  );
}
