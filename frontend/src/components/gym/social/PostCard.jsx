'use client';
import { useCallback, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Clock, Dumbbell, Flag, MessageCircle, MoreHorizontal, Trash2, X } from 'lucide-react';
import { deletePost, mediaSrc, reactToPost, removeReaction, reportPost } from '../../../lib/api';
import { apiError, formatVolume, plural } from '../../../lib/gym';
import { timeAgo } from '../../../lib/photos';
import { useToast } from '../../Toast';
import { useConfirm } from '../../ConfirmDialog';
import GymSheet from '../GymSheet';
import Avatar from './Avatar';
import styles from './PostCard.module.css';

export const REACTIONS = [
  { key: 'strong', emoji: '💪', label: 'Monstro' },
  { key: 'fire', emoji: '🔥', label: 'Pegando fogo' },
  { key: 'clap', emoji: '👏', label: 'Parabéns' },
  { key: 'wow', emoji: '😮', label: 'Uau' },
];

const REASONS = [
  { key: 'spam', label: 'Spam' },
  { key: 'offensive', label: 'Conteúdo ofensivo' },
  { key: 'fake', label: 'Perfil falso' },
  { key: 'other', label: 'Outro motivo' },
];

function PhotoGrid({ media, onOpen }) {
  if (!media.length) return null;
  return (
    <div className={`${styles.photos} ${styles[`photos${Math.min(media.length, 4)}`]}`}>
      {media.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={styles.photo}
          style={media.length === 1 && item.width && item.height ? { aspectRatio: String(Math.max(item.width / item.height, 0.8)) } : undefined}
          onClick={() => onOpen(index)}
          aria-label={`Abrir foto ${index + 1}`}
        >
          <Image src={mediaSrc(item.url)} alt="" fill unoptimized sizes="(max-width: 760px) 100vw, 760px" />
        </button>
      ))}
    </div>
  );
}

function Lightbox({ media, index, onClose, onMove }) {
  if (index === null) return null;
  const item = media[index];
  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Foto" onClick={onClose}>
      <button type="button" className={styles.lightboxClose} onClick={onClose} aria-label="Fechar foto"><X size={22} /></button>
      <div className={styles.lightboxImage} onClick={(e) => { e.stopPropagation(); if (media.length > 1) onMove((index + 1) % media.length); }}>
        <Image src={mediaSrc(item.url)} alt="" fill unoptimized sizes="100vw" />
      </div>
      {media.length > 1 && <span className={styles.lightboxCount}>{index + 1} / {media.length}</span>}
    </div>
  );
}

export default function PostCard({ post, onChange, onDeleted, linkToPost = true }) {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [open, setOpen] = useState(null);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const closeMenu = useCallback(() => setMenu(false), []);
  const closeReport = useCallback(() => {
    setReporting(false);
    setReason('');
  }, []);

  const react = async (kind) => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = post.my_reaction === kind ? await removeReaction(post.id) : await reactToPost(post.id, kind);
      onChange?.(updated);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível reagir.') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setMenu(false);
    const ok = await confirmAction({
      title: 'Apagar post',
      message: ['O post, as fotos, as reações e os comentários somem para todos. O treino continua salvo no seu histórico.'],
      confirmLabel: 'Apagar',
    });
    if (!ok) return;
    try {
      await deletePost(post.id);
      toast('Post apagado');
      onDeleted?.(post);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível apagar o post.') });
    }
  };

  const sendReport = async () => {
    if (!reason) return;
    try {
      await reportPost(post.id, reason, null);
      toast('Denúncia enviada. Obrigado por avisar.');
      closeReport();
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível enviar a denúncia.') });
    }
  };

  const author = post.author;

  return (
    <article className={styles.card}>
      <header className={styles.header}>
        {author.username && !post.is_mine ? (
          <Link href={`/gym/u/${author.username}`} className={styles.author}>
            <Avatar name={author.name} />
            <span className={styles.authorText}>
              <span className={styles.authorName}>{author.name}</span>
              <span className={styles.meta}>{timeAgo(post.created_at)}{post.activity ? ` · ${post.activity}` : ''}</span>
            </span>
          </Link>
        ) : (
          <span className={styles.author}>
            <Avatar name={author.name} />
            <span className={styles.authorText}>
              <span className={styles.authorName}>{post.is_mine ? 'Você' : author.name}</span>
              <span className={styles.meta}>{timeAgo(post.created_at)}{post.activity ? ` · ${post.activity}` : ''}</span>
            </span>
          </span>
        )}
        <button type="button" className={styles.more} onClick={() => setMenu(true)} aria-label="Opções do post"><MoreHorizontal size={18} /></button>
      </header>

      {post.workout && (
        <div className={styles.workout}>
          <span className={styles.workoutIcon}><Dumbbell size={16} /></span>
          <span className={styles.workoutText}>
            <span className={styles.workoutName}>{post.workout.name}</span>
            <span className={styles.meta}>
              <Clock size={12} /> {post.workout.minutes} min · {plural(post.workout.exercises, 'exercício', 'exercícios')}
              {post.workout.volume_kg > 0 ? ` · ${formatVolume(post.workout.volume_kg)}` : ''}
            </span>
            {post.workout.highlights.length > 0 && <span className={styles.highlights}>{post.workout.highlights.join(' · ')}</span>}
          </span>
        </div>
      )}

      {post.caption && <p className={styles.caption}>{post.caption}</p>}

      <PhotoGrid media={post.media} onOpen={setOpen} />

      <footer className={styles.footer}>
        <div className={styles.reactions} role="group" aria-label="Reações">
          {REACTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.reaction} ${post.my_reaction === item.key ? styles.reactionMine : ''}`}
              onClick={() => react(item.key)}
              aria-pressed={post.my_reaction === item.key}
              aria-label={`${item.label}${post.reactions[item.key] ? `, ${post.reactions[item.key]}` : ''}`}
            >
              <span aria-hidden="true">{item.emoji}</span>
              {post.reactions[item.key] > 0 && <span className={styles.reactionCount}>{post.reactions[item.key]}</span>}
            </button>
          ))}
        </div>
        {linkToPost ? (
          <Link href={`/gym/social/post/${post.id}`} className={styles.comments}>
            <MessageCircle size={16} /> {post.comment_count || 'Comentar'}
          </Link>
        ) : (
          <span className={styles.comments}><MessageCircle size={16} /> {post.comment_count}</span>
        )}
      </footer>

      <Lightbox media={post.media} index={open} onClose={() => setOpen(null)} onMove={setOpen} />

      <GymSheet open={menu} onClose={closeMenu} title="Post">
        <div className={styles.menu}>
          {post.is_mine ? (
            <button type="button" className={`${styles.menuItem} ${styles.menuDanger}`} onClick={remove}><Trash2 size={18} /> Apagar post</button>
          ) : (
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuDanger}`}
              onClick={() => {
                setMenu(false);
                setReporting(true);
              }}
            >
              <Flag size={18} /> Denunciar post
            </button>
          )}
        </div>
      </GymSheet>

      <GymSheet open={reporting} onClose={closeReport} title="Denunciar post">
        <div className={styles.reportForm}>
          <div className={styles.reasons} role="radiogroup" aria-label="Motivo">
            {REASONS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={reason === item.key}
                className={`${styles.reasonChip} ${reason === item.key ? styles.reasonActive : ''}`}
                onClick={() => setReason(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.primary} disabled={!reason} onClick={sendReport}>Enviar denúncia</button>
        </div>
      </GymSheet>
    </article>
  );
}
