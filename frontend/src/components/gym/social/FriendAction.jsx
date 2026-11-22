'use client';
import { useState } from 'react';
import { Check, Clock, UserCheck, UserPlus } from 'lucide-react';
import { acceptFriendRequest, removeFriendship, sendFriendRequest, unblockUser } from '../../../lib/api';
import { apiError } from '../../../lib/gym';
import { useToast } from '../../Toast';
import { useConfirm } from '../../ConfirmDialog';
import styles from './social.module.css';

export default function FriendAction({ person, onChange, compact = false }) {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [busy, setBusy] = useState(false);

  const run = async (action, message) => {
    setBusy(true);
    try {
      const updated = await action(person.username);
      onChange?.({ ...person, relation: updated.relation });
      if (message) toast(message);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível concluir. Tente de novo.') });
    } finally {
      setBusy(false);
    }
  };

  const unfriend = async () => {
    const ok = await confirmAction({
      title: 'Desfazer amizade',
      message: [<>Você e <strong>{person.name}</strong> deixam de ser amigos.</>],
      confirmLabel: 'Desfazer',
    });
    if (ok) run(removeFriendship, 'Amizade desfeita');
  };

  const className = `${styles.action} ${compact ? styles.actionCompact : ''}`;

  switch (person.relation) {
    case 'none':
      return (
        <button type="button" className={`${className} ${styles.actionPrimary}`} disabled={busy} onClick={() => run(sendFriendRequest, 'Pedido de amizade enviado')}>
          <UserPlus size={16} /> Adicionar
        </button>
      );
    case 'request_sent':
      return (
        <button type="button" className={className} disabled={busy} onClick={() => run(removeFriendship, 'Pedido cancelado')} title="Cancelar pedido">
          <Clock size={16} /> Pedido enviado
        </button>
      );
    case 'request_received':
      return (
        <button type="button" className={`${className} ${styles.actionPrimary}`} disabled={busy} onClick={() => run(acceptFriendRequest, `Agora você e ${person.name.split(' ')[0]} são amigos`)}>
          <Check size={16} /> Aceitar
        </button>
      );
    case 'friends':
      return (
        <button type="button" className={className} disabled={busy} onClick={unfriend} title="Desfazer amizade">
          <UserCheck size={16} /> Amigos
        </button>
      );
    case 'blocked':
      return (
        <button type="button" className={className} disabled={busy} onClick={() => run(unblockUser, 'Pessoa desbloqueada')}>
          Desbloquear
        </button>
      );
    default:
      return null;
  }
}
