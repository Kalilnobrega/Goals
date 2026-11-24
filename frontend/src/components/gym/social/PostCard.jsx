'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Clock, Dumbbell, Flag, MessageCircle, MoreHorizontal, Trash2, X } from 'lucide-react';
import { copyPostShared, deletePost, mediaSrc, reactToPost, removeReaction, reportPost } from '../../../lib/api';
import SharedCard from './SharedCard';
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

function PhotoCarousel({ media, onOpen }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  if (!media.length) return null;

  const onScroll = () => {
    const track = trackRef.current;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  const go = (next) => {
    const track = trackRef.current;
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  };

  const first = media[0];
  const ratio = first.width && first.height ? Math.min(1, Math.max(0.8, first.width / first.height)) : 0.8;

  return (
    <div className={styles.carousel}>
      <div ref={trackRef} className={styles.track} onScroll={onScroll} style={{ '--slide-ratio': ratio }}>
        {media.map((item, position) => (
          <button key={item.id} type="button" className={styles.slide} onClick={() => onOpen(position)} aria-label={`Abrir foto ${position + 1} de ${media.length}`}>
            <Image src={mediaSrc(item.url)} alt="" fill unoptimized sizes="(max-width: 760px) 100vw, 760px" />
          </button>
        ))}
      </div>
      {media.length > 1 && (
        <>
          {index > 0 && (
            <button type="button" className={`${styles.arrow} ${styles.arrowLeft}`} onClick={() => go(index - 1)} aria-label="Foto anterior">
              <ChevronLeft size={18} />
            </button>
          )}
          {index < media.length - 1 && (
            <button type="button" className={`${styles.arrow} ${styles.arrowRight}`} onClick={() => go(index + 1)} aria-label="Próxima foto">
              <ChevronRight size={18} />
            </button>
          )}
          <span className={styles.counter}>{index + 1}/{media.length}</span>
          <div className={styles.dots} aria-hidden="true">
            {media.map((item, position) => (
              <span key={item.id} className={`${styles.dot} ${position === index ? styles.dotActive : ''}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Lightbox({ media, index, onClose, onMove }) {
  useEffect(() => {
    if (index === null) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (media.length > 1 && event.key === 'ArrowRight') onMove((index + 1) % media.length);
      if (media.length > 1 && event.key === 'ArrowLeft') onMove((index - 1 + media.length) % media.length);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [index, media.length, onClose, onMove]);

  if (index === null) return null;
  const item = media[index];
  const step = (delta) => (event) => {
    event.stopPropagation();
    onMove((index + delta + media.length) % media.length);
  };
  return (
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Foto" onClick={onClose}>
      <button type="button" className={styles.lightboxClose} onClick={onClose} aria-label="Fechar foto"><X size={22} /></button>
      <div className={styles.lightboxImage}>
        <Image src={mediaSrc(item.full_url ?? item.url)} alt="" fill unoptimized sizes="100vw" />
      </div>
      {media.length > 1 && (
        <>
          <button type="button" className={`${styles.lightboxNav} ${styles.arrowLeft}`} onClick={step(-1)} aria-label="Foto anterior"><ChevronLeft size={22} /></button>
          <button type="button" className={`${styles.lightboxNav} ${styles.arrowRight}`} onClick={step(1)} aria-label="Próxima foto"><ChevronRight size={22} /></button>
          <span className={styles.lightboxCount}>{index + 1} / {media.length}</span>
        </>
      )}
    </div>
  );
}

export function PostPhotos({ media }) {
  const [open, setOpen] = useState(null);
  const close = useCallback(() => setOpen(null), []);
  return (
    <>
      <PhotoCarousel media={media} onOpen={setOpen} />
      <Lightbox media={media} index={open} onClose={close} onMove={setOpen} />
    </>
  );
}

function postMeta(post) {
  const place = post.gym_name && post.activity === 'Academia' ? post.gym_name : post.activity;
  const gym = post.gym_name && post.activity !== 'Academia' ? post.gym_name : null;
  return [timeAgo(post.created_at), place, gym, post.minutes ? `${post.minutes} min` : null, post.in_feed === false ? 'só nos desafios' : null].filter(Boolean).join(' · ');
}

export default function PostCard({ post, onChange, onDeleted, linkToPost = true }) {
  const toast = useToast();
  const confirmAction = useConfirm();
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
              <span className={styles.meta}>{postMeta(post)}</span>
            </span>
          </Link>
        ) : (
          <span className={styles.author}>
            <Avatar name={author.name} />
            <span className={styles.authorText}>
              <span className={styles.authorName}>{post.is_mine ? 'Você' : author.name}</span>
              <span className={styles.meta}>{postMeta(post)}</span>
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
            <span className={styles.workoutMeta}>
              <Clock size={12} />
              <span>
                {post.workout.minutes} min · {plural(post.workout.exercises, 'exercício', 'exercícios')}
                {post.workout.volume_kg > 0 ? ` · ${formatVolume(post.workout.volume_kg)}` : ''}
              </span>
            </span>
            {post.workout.highlights.length > 0 && <span className={styles.highlights}>{post.workout.highlights.join(' · ')}</span>}
          </span>
          <Link href={`/gym/social/post/${post.id}/treino`} className={styles.workoutLink}>
            Ver treino <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {post.caption && <p className={styles.caption}>{post.caption}</p>}

      {post.shared && post.shared_kind && (
        <SharedCard kind={post.shared_kind} snapshot={post.shared} mine={post.is_mine} onCopy={() => copyPostShared(post.id)} />
      )}

      <PostPhotos media={post.media} />

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
