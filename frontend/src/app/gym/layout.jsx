import GymNavbar from '../../components/gym/GymNavbar';
import ServiceWorker from '../../components/gym/ServiceWorker';
import { StartWorkoutProvider } from '../../components/gym/StartWorkout';
import styles from './gym.module.css';

export const metadata = {
  title: 'GymGoals — Seus treinos e sua evolução',
  description: 'Organize seus treinos, registre suas cargas e acompanhe sua evolução.',
  applicationName: 'GymGoals',
  manifest: '/gym.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'GymGoals',
    statusBarStyle: 'black',
  },
  icons: {
    icon: '/icons/gym.svg',
    apple: '/icons/gym-apple-180.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1013',
  colorScheme: 'dark',
};

export default function GymLayout({ children }) {
  return (
    <div className={styles.shell}>
      <ServiceWorker />
      <StartWorkoutProvider>
        <GymNavbar />
        <main className={styles.main}>{children}</main>
      </StartWorkoutProvider>
    </div>
  );
}
