'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Newspaper, Send } from 'lucide-react';
import { getFriends, shareToFriends } from '../../../lib/api';
import { apiError } from '../../../lib/gym';
import { useToast } from '../../Toast';
import GymSheet from '../GymSheet';
import Avatar from './Avatar';
import styles from './ShareSheet.module.css';

function FriendPicker({ kind, itemId, onDone }) {
  const toast = useToast();
  const [friends, setFriends] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getFriends().then((data) => setFriends(data.friends)).catch((err) => setError(apiError(err, 'Não foi possível carregar seus amigos.')));
  }, []);

  const toggle = (username) => setPicked((current) => (current.includes(username) ? current.filter((u) => u !== username) : [...current, username]));

  const send = async () => {
    setSending(true);
    try {
      await shareToFriends({ kind, item_id: itemId, usernames: picked, message: message.trim() || null });
      toast(picked.length === 1 ? 'Enviado' : `Enviado para ${picked.length} amigos`);
      onDone();
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível enviar.') });
      setSending(false);
    }
  };

  if (error) return <p className={styles.muted}>{error}</p>;
  if (!friends) return <p className={styles.muted}>Carregando amigos...</p>;
  if (!friends.length) return <p className={styles.muted}>Você ainda não tem amigos no GymGoals. Adicione alguém na aba Social → Amigos.</p>;

  return (
    <div className={styles.picker}>
      <ul className={styles.list}>
        {friends.map((friend) => {
          const active = picked.includes(friend.username);
          return (
            <li key={friend.username}>
              <button type="button" className={`${styles.friend} ${active ? styles.friendActive : ''}`} onClick={() => toggle(friend.username)} aria-pressed={active}>
                <Avatar name={friend.name} />
                <span className={styles.friendText}>
                  <span className={styles.friendName}>{friend.name}</span>
                  <span className={styles.muted}>@{friend.username}</span>
                </span>
                <span className={styles.check}>{active && <Check size={14} strokeWidth={3} />}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <input
        className={styles.input}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={300}
        placeholder="Mensagem (opcional)"
        aria-label="Mensagem"
      />
      <button type="button" className={styles.send} onClick={send} disabled={!picked.length || sending}>
        <Send size={16} /> {sending ? 'Enviando...' : picked.length > 1 ? `Enviar para ${picked.length} amigos` : 'Enviar'}
      </button>
    </div>
  );
}

export default function ShareSheet({ open, onClose, kind, itemId }) {
  const [step, setStep] = useState('menu');
  const close = () => {
    setStep('menu');
    onClose();
  };
  const param = kind === 'plan' ? 'plano' : 'ficha';

  return (
    <GymSheet open={open} onClose={close} title={step === 'friends' ? 'Enviar para amigos' : kind === 'plan' ? 'Compartilhar plano' : 'Compartilhar ficha'}>
      {step === 'menu' ? (
        <div className={styles.menu}>
          <Link href={`/gym/social/publicar?${param}=${itemId}`} className={styles.option}>
            <Newspaper size={18} />
            <span className={styles.optionText}>
              <span className={styles.optionTitle}>Publicar no feed</span>
              <span className={styles.muted}>Seus amigos veem e podem copiar</span>
            </span>
            <ChevronRight size={18} className={styles.muted} />
          </Link>
          <button type="button" className={styles.option} onClick={() => setStep('friends')}>
            <Send size={18} />
            <span className={styles.optionText}>
              <span className={styles.optionTitle}>Enviar para amigos</span>
              <span className={styles.muted}>Só quem você escolher recebe</span>
            </span>
            <ChevronRight size={18} className={styles.muted} />
          </button>
        </div>
      ) : (
        <FriendPicker kind={kind} itemId={itemId} onDone={close} />
      )}
    </GymSheet>
  );
}
