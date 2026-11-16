'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createWorkout } from '../../../../lib/api';
import { apiError } from '../../../../lib/gym';
import { useToast } from '../../../../components/Toast';
import WorkoutEditor from '../../../../components/gym/WorkoutEditor';
import styles from '../editor.module.css';

export default function NewWorkoutPage() {
  const router = useRouter();
  const toast = useToast();

  const save = async (data) => {
    try {
      await createWorkout(data);
      toast('Ficha criada');
      router.push('/gym/workouts');
      return null;
    } catch (err) {
      return apiError(err, 'Não foi possível criar a ficha.');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/gym/workouts" className={styles.back}><ChevronLeft size={18} /> Treinos</Link>
        <h1 className={styles.title}>Nova ficha</h1>
      </div>
      <WorkoutEditor initial={null} onSubmit={save} />
    </div>
  );
}
