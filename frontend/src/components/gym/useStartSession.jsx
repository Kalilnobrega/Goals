'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Trash2 } from 'lucide-react';
import { startSession, deleteSession } from '../../lib/api';
import { apiError } from '../../lib/gym';
import { useToast } from '../Toast';
import GymSheet from './GymSheet';
import s from './sheet.module.css';

export default function useStartSession() {
  const router = useRouter();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const [conflict, setConflict] = useState(null);

  const begin = useCallback(async (workoutId) => {
    setStarting(true);
    try {
      const session = await startSession(workoutId);
      router.push(`/gym/session/${session.id}`);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 409 && detail?.session_id) {
        setConflict({ ...detail, workoutId });
      } else {
        toast({ tone: 'danger', message: apiError(err, 'Não foi possível iniciar o treino.') });
      }
      setStarting(false);
    }
  }, [router, toast]);

  const close = useCallback(() => setConflict(null), []);

  const replace = async () => {
    const { session_id: sessionId, workoutId } = conflict;
    setConflict(null);
    setStarting(true);
    try {
      await deleteSession(sessionId);
    } catch (err) {
      setStarting(false);
      return toast({ tone: 'danger', message: apiError(err, 'Não foi possível descartar o treino atual.') });
    }
    begin(workoutId);
  };

  const sheet = (
    <GymSheet open={!!conflict} onClose={close} title="Treino em andamento">
      {conflict && (
        <div className={s.stack}>
          <p className={s.text}>{conflict.message} Termine ele antes ou descarte para começar outro.</p>
          <div className={s.actions}>
            <button type="button" className={s.primary} onClick={() => router.push(`/gym/session/${conflict.session_id}`)}>
              <Play size={18} /> Continuar treino atual
            </button>
            <button type="button" className={s.danger} onClick={replace}>
              <Trash2 size={18} /> Descartar e começar este
            </button>
          </div>
        </div>
      )}
    </GymSheet>
  );

  return { begin, starting, sheet };
}
