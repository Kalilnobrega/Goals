'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Dumbbell, MapPin, MessageCircle, Send, Trash2 } from 'lucide-react';
import { deleteChallengeMessage, getChallengeChat, readChallengeChat, sendChallengeMessage } from '../../../lib/api';
import { addDays, apiError, formatDay } from '../../../lib/gym';
import { timeAgo } from '../../../lib/photos';
import { useToast } from '../../Toast';
import Avatar from './Avatar';
import styles from './ChallengeChat.module.css';

const FAST_MS = 3000;
const SLOW_MS = 15000;
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

function merge(current, incoming) {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export default function ChallengeChat({ challenge, onRead }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [nextBefore, setNextBefore] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const stickToEnd = useRef(true);
  const lastActivity = useRef(0);
  const seen = useRef(null);

  const noteActivity = (list) => {
    const known = seen.current;
    const ids = list.map((item) => item.id);
    const recent = list.some((item) => Date.now() - new Date(item.created_at).getTime() < ACTIVE_WINDOW_MS);
    if ((known && ids.some((id) => !known.has(id))) || (!known && recent)) lastActivity.current = Date.now();
    seen.current = new Set([...(known ?? []), ...ids]);
  };

  const refresh = useCallback(async (first = false) => {
    try {
      const page = await getChallengeChat(challenge.id);
      noteActivity(page.items);
      setItems((current) => (current ? merge(current, page.items) : page.items));
      if (first) setNextBefore(page.next_before);
      if (page.unread > 0 || first) {
        await readChallengeChat(challenge.id);
        onRead?.();
      }
    } catch (err) {
      if (first) setError(apiError(err, 'Não foi possível carregar o chat.'));
    }
  }, [challenge.id, onRead]);

  useEffect(() => {
    let timer = null;
    let stopped = false;
    const schedule = () => {
      const active = Date.now() - lastActivity.current < ACTIVE_WINDOW_MS;
      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible') await refresh();
        if (!stopped) schedule();
      }, active ? FAST_MS : SLOW_MS);
    };
    refresh(true).then(() => {
      if (!stopped) schedule();
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  const lastId = items?.at(-1)?.id;
  useEffect(() => {
    if (lastId && stickToEnd.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);

  const loadOlder = async () => {
    setLoadingOlder(true);
    stickToEnd.current = false;
    try {
      const page = await getChallengeChat(challenge.id, nextBefore);
      setItems((current) => merge(current, page.items));
      setNextBefore(page.next_before);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível carregar mensagens antigas.') });
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    stickToEnd.current = true;
    try {
      const message = await sendChallengeMessage(challenge.id, text.trim());
      lastActivity.current = Date.now();
      setItems((current) => merge(current ?? [], [message]));
      setText('');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível enviar.') });
    } finally {
      setSending(false);
    }
  };

  const remove = async (item) => {
    try {
      await deleteChallengeMessage(challenge.id, item.message_id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível apagar a mensagem.') });
    }
  };

  return (
    <section className={styles.chat}>
      {error && <p className={styles.error}>{error}</p>}
      {!items && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando chat" />}
      {nextBefore && (
        <button type="button" className={styles.older} onClick={loadOlder} disabled={loadingOlder}>
          {loadingOlder ? 'Carregando...' : 'Carregar mensagens anteriores'}
        </button>
      )}
      {items && items.length === 0 && (
        <p className={styles.empty}>
          <MessageCircle size={22} />
          Ninguém falou nada ainda. Mande a primeira mensagem! Os comentários nos treinos e check-ins do desafio também aparecem aqui.
        </p>
      )}
      {items && items.length > 0 && (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={`${styles.row} ${item.is_mine ? styles.rowMine : ''}`}>
              {!item.is_mine && <Avatar name={item.author.name} />}
              <div className={`${styles.bubble} ${item.is_mine ? styles.bubbleMine : ''}`}>
                {!item.is_mine && <span className={styles.author}>{item.author.name}</span>}
                {item.post && (
                  <Link href={`/gym/social/post/${item.post.post_id}`} className={styles.ref}>
                    {item.post.kind === 'checkin' ? <MapPin size={12} /> : <Dumbbell size={12} />}
                    <span>
                      no {item.post.kind === 'checkin' ? 'check-in' : 'treino'} {item.post.label} de {item.post.owner_name.split(' ')[0]} · {formatDay(item.post.day)}
                    </span>
                  </Link>
                )}
                <p className={styles.text}>{item.text}</p>
                <span className={styles.time}>{timeAgo(item.created_at)}</span>
              </div>
              {item.can_delete && (
                <button type="button" className={styles.remove} onClick={() => remove(item)} aria-label="Apagar mensagem">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div ref={endRef} />
      {challenge.status === 'finished' && (
        <p className={styles.closing}>
          {challenge.chat_open === false
            ? 'O chat foi fechado uma semana depois do fim do desafio. As mensagens continuam aqui para ler.'
            : `O desafio acabou. O chat fica aberto até ${formatDay(addDays(challenge.end_date, 7))} para a resenha.`}
        </p>
      )}
      {challenge.chat_open !== false && (
        <form className={styles.form} onSubmit={send}>
          <input
            className={styles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Mensagem para o grupo"
            aria-label="Mensagem"
          />
          <button type="submit" className={styles.send} disabled={sending || !text.trim()} aria-label="Enviar mensagem">
            <Send size={18} />
          </button>
        </form>
      )}
    </section>
  );
}
