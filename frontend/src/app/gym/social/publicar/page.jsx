'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, ChevronLeft, Dumbbell, ImagePlus, X } from 'lucide-react';
import { createPost, getSession, uploadPhoto } from '../../../../lib/api';
import { apiError, formatDay } from '../../../../lib/gym';
import { FORMATS, preparePhoto } from '../../../../lib/photos';
import { useToast } from '../../../../components/Toast';
import CropFrame from '../../../../components/gym/social/CropFrame';
import styles from './compose.module.css';

const MAX_PHOTOS = 4;
const ACTIVITIES = ['Corrida', 'Caminhada', 'Bike', 'Natação', 'Futebol', 'Luta', 'Yoga', 'Outra'];

function Composer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = Number(searchParams.get('sessao')) || null;
  const toast = useToast();
  const inputRef = useRef(null);
  const [session, setSession] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [active, setActive] = useState(0);
  const [format, setFormat] = useState('portrait');
  const [caption, setCaption] = useState('');
  const [activity, setActivity] = useState('');
  const [customActivity, setCustomActivity] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId).then(setSession).catch(() => setError('Não foi possível carregar o treino.'));
  }, [sessionId]);

  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  const addPhotos = async (event) => {
    const files = [...event.target.files].slice(0, MAX_PHOTOS - photos.length);
    event.target.value = '';
    if (!files.length) return;
    setPreparing(true);
    setError('');
    const ready = [];
    for (const file of files) {
      try {
        ready.push(await preparePhoto(file));
      } catch {
        setError('Não foi possível ler uma das fotos. Tente outra imagem em JPEG ou PNG.');
      }
    }
    setPhotos((current) => {
      const next = [...current, ...ready].slice(0, MAX_PHOTOS);
      if (ready.length) setActive(current.length);
      return next;
    });
    setPreparing(false);
  };

  const removePhoto = (index) => {
    URL.revokeObjectURL(photos[index].url);
    setPhotos((current) => current.filter((_, i) => i !== index));
    setActive((current) => Math.max(0, current > index ? current - 1 : Math.min(current, photos.length - 2)));
  };

  const moveCrop = (position) => setPhotos((current) => current.map((photo, i) => (i === active ? { ...photo, position } : photo)));

  const chosenActivity = activity === 'Outra' ? customActivity.trim() : activity;
  const canSubmit = !progress && !preparing && (sessionId ? !!session : caption.trim() || photos.length || chosenActivity);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    try {
      const ids = [];
      for (const [index, photo] of photos.entries()) {
        setProgress(photos.length > 1 ? `Enviando foto ${index + 1} de ${photos.length}...` : 'Enviando foto...');
        const media = await uploadPhoto(photo, { kind: 'post' }, format);
        ids.push(media.id);
      }
      setProgress('Publicando...');
      await createPost({
        session_id: sessionId,
        caption: caption.trim() || null,
        activity: sessionId ? null : chosenActivity || null,
        media_ids: ids,
      });
      toast('Publicado no feed');
      router.replace('/gym/social');
    } catch (err) {
      setError(apiError(err, 'Não foi possível publicar.'));
      setProgress('');
    }
  };

  return (
    <div className={styles.page}>
      <Link href="/gym/social" className={styles.back}><ChevronLeft size={18} /> Feed</Link>
      <h1 className={styles.title}>{sessionId ? 'Publicar treino' : 'Nova publicação'}</h1>

      <form className={styles.form} onSubmit={submit}>
        {sessionId && session && (
          <section className={styles.workout}>
            <span className={styles.workoutIcon}><Dumbbell size={18} /></span>
            <span className={styles.workoutText}>
              <span className={styles.workoutName}>{session.name}</span>
              <span className={styles.muted}>{formatDay(session.started_at.slice(0, 10))} · o resumo do treino vai junto</span>
            </span>
          </section>
        )}

        {!sessionId && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>O que você fez? <small>opcional</small></h2>
            <div className={styles.chips}>
              {ACTIVITIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`${styles.chip} ${activity === item ? styles.chipActive : ''}`}
                  onClick={() => setActivity((current) => (current === item ? '' : item))}
                >
                  {item}
                </button>
              ))}
            </div>
            {activity === 'Outra' && (
              <input
                className={styles.input}
                value={customActivity}
                onChange={(e) => setCustomActivity(e.target.value)}
                maxLength={40}
                placeholder="Ex.: Crossfit, vôlei, trilha"
                aria-label="Atividade"
              />
            )}
          </section>
        )}

        <section className={styles.card}>
          <textarea
            className={styles.textarea}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={sessionId ? 'Como foi o treino?' : 'Conte como foi'}
            aria-label="Legenda"
          />
          {photos.length > 0 && (
            <div className={styles.formats} role="radiogroup" aria-label="Formato das fotos">
              {Object.entries(FORMATS).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={format === key}
                  className={`${styles.format} ${format === key ? styles.formatActive : ''}`}
                  onClick={() => setFormat(key)}
                >
                  <span className={styles.formatShape} style={{ aspectRatio: item.css }} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {photos[active] && <CropFrame photo={photos[active]} onMove={moveCrop} format={format} />}
          <div className={styles.photos}>
            {photos.map((photo, index) => (
              <div
                key={photo.url}
                className={`${styles.thumb} ${index === active ? styles.thumbActive : ''}`}
                style={{ aspectRatio: FORMATS[format].css }}
              >
                <button type="button" className={styles.thumbButton} onClick={() => setActive(index)} aria-label={`Ajustar foto ${index + 1}`}>
                  <CropFrame photo={photo} size="small" format={format} />
                </button>
                <button type="button" className={styles.removePhoto} onClick={() => removePhoto(index)} aria-label={`Remover foto ${index + 1}`}>
                  <X size={14} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" className={styles.addPhoto} onClick={() => inputRef.current?.click()} disabled={preparing}>
                {preparing ? '...' : photos.length ? <ImagePlus size={22} /> : <><Camera size={22} /><span>Fotos</span></>}
              </button>
            )}
          </div>
          <p className={styles.muted}>Até {MAX_PHOTOS} fotos. No feed elas aparecem no formato escolhido; ao tocar, abrem inteiras em alta qualidade. A localização gravada pela câmera é removida.</p>
          <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={addPhotos} />
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submit} disabled={!canSubmit}>
          {progress || 'Publicar'}
        </button>
      </form>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense fallback={null}>
      <Composer />
    </Suspense>
  );
}
