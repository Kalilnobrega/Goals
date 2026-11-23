'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Send, Trash2 } from 'lucide-react';
import { addComment, deleteComment, getPost } from '../../../../../lib/api';
import { apiError } from '../../../../../lib/gym';
import { timeAgo } from '../../../../../lib/photos';
import { useToast } from '../../../../../components/Toast';
import PostCard from '../../../../../components/gym/social/PostCard';
import Avatar from '../../../../../components/gym/social/Avatar';
import styles from './post.module.css';

export default function PostPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    getPost(id)
      .then(setPost)
      .catch((err) => setError(err.response?.status === 404 ? 'Post não encontrado.' : apiError(err, 'Não foi possível carregar o post.')));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const comment = await addComment(post.id, text.trim());
      setPost((current) => ({ ...current, comments: [...current.comments, comment], comment_count: current.comment_count + 1 }));
      setText('');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível comentar.') });
    } finally {
      setSending(false);
    }
  };

  const removeComment = async (comment) => {
    try {
      await deleteComment(comment.id);
      setPost((current) => ({
        ...current,
        comments: current.comments.filter((c) => c.id !== comment.id),
        comment_count: current.comment_count - 1,
      }));
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível apagar o comentário.') });
    }
  };

  return (
    <div className={styles.page}>
      <Link href="/gym/social" className={styles.back}><ChevronLeft size={18} /> Feed</Link>
      {error && <p className={styles.error}>{error}</p>}
      {!post && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando post" />}

      {post && (
        <>
          <PostCard
            post={post}
            linkToPost={false}
            onChange={(updated) => setPost((current) => ({ ...current, ...updated }))}
            onDeleted={() => router.replace('/gym/social')}
          />

          <section className={styles.comments}>
            <h2 className={styles.title}>Comentários</h2>
            {post.comments.length === 0 && <p className={styles.muted}>Ninguém comentou ainda. Manda o primeiro!</p>}
            <ul className={styles.list}>
              {post.comments.map((comment) => (
                <li key={comment.id} className={styles.comment}>
                  <Avatar name={comment.author.name} />
                  <div className={styles.bubble}>
                    <p className={styles.commentHead}>
                      {comment.author.username ? (
                        <Link href={`/gym/u/${comment.author.username}`} className={styles.commentAuthor}>{comment.author.name}</Link>
                      ) : (
                        <span className={styles.commentAuthor}>{comment.author.name}</span>
                      )}
                      <span className={styles.muted}>{timeAgo(comment.created_at)}</span>
                    </p>
                    <p className={styles.commentText}>{comment.text}</p>
                  </div>
                  {comment.can_delete && (
                    <button type="button" className={styles.remove} onClick={() => removeComment(comment)} aria-label="Apagar comentário">
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form className={styles.form} onSubmit={send}>
              <input
                className={styles.input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                placeholder="Escreva um comentário"
                aria-label="Comentário"
              />
              <button type="submit" className={styles.send} disabled={sending || !text.trim()} aria-label="Enviar comentário">
                <Send size={18} />
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
