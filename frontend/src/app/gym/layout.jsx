import GymNavbar from '../../components/gym/GymNavbar';
import styles from './gym.module.css';

export const metadata = {
  title: 'GymGoals — Seus treinos e sua evolução',
  description: 'Organize seus treinos, registre suas cargas e acompanhe sua evolução.',
};

export const viewport = {
  themeColor: '#0e1013',
  colorScheme: 'dark',
};

export default function GymLayout({ children }) {
  return (
    <div className={styles.shell}>
      <GymNavbar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
