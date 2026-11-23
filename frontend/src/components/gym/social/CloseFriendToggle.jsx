'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { addCloseFriend, removeCloseFriend } from '../../../lib/api';
import { apiError } from '../../../lib/gym';
import { useToast } from '../../Toast';
import styles from './social.module.css';

export default function CloseFriendToggle({ person, active, onChange, withLabel = false }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const firstName = person.name.split(' ')[0];

  const toggle = async () => {
    setBusy(true);
    try {
      if (active) {
        await removeCloseFriend(person.username);
        toast(`${firstName} saiu dos seus melhores amigos`);
      } else {
        await addCloseFriend(person.username);
        toast(`${firstName} agora vê suas fichas, histórico e evolução`);
      }
      onChange?.(!active);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível alterar.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`${withLabel ? styles.closeToggleLabel : styles.closeToggle} ${active ? styles.closeActive : ''}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={active}
      aria-label={active ? `Tirar ${firstName} dos melhores amigos` : `Marcar ${firstName} como melhor amigo`}
      title={active ? 'Melhor amigo' : 'Marcar como melhor amigo'}
    >
      <Star size={16} fill={active ? 'currentColor' : 'none'} />
      {withLabel && (active ? 'Melhor amigo' : 'Melhores amigos')}
    </button>
  );
}
