'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Camera, ChevronLeft, ChevronRight, ClipboardList, Clock, Dumbbell, ImagePlus, Link2, X } from 'lucide-react';
import { createPost, getExercises, getPlan, getPostableSessions, getSession, getWorkout, uploadPhoto } from '../../../../lib/api';
import { addDays, apiError, formatDay, formatVolume, plural, todayIso } from '../../../../lib/gym';
import { FORMATS, preparePhoto } from '../../../../lib/photos';
import { useToast } from '../../../../components/Toast';
import CropFrame from '../../../../components/gym/social/CropFrame';
import GymSheet from '../../../../components/gym/GymSheet';
import styles from './compose.module.css';

const MAX_PHOTOS = 4;
const ACTIVITIES = ['Academia', 'Corrida', 'Caminhada', 'Bike', 'Natação', 'Futebol', 'Luta', 'Yoga', 'Outra'];

function Composer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSession = Number(searchParams.get('sessao')) || null;
  const checkin = searchParams.get('checkin') === '1';
  const shareWorkoutId = Number(searchParams.get('ficha')) || null;
  const sharePlanId = Number(searchParams.get('plano')) || null;
  const shareExerciseId = Number(searchParams.get('exercicio')) || null;
  const sharing = !!(shareWorkoutId || sharePlanId || shareExerciseId);
  const [sharedName, setSharedName] = useState('');
  const challengeId = Number(searchParams.get('desafio')) || null;
  const backHref = challengeId ? `/gym/social/desafios/${challengeId}?aba=atividade` : '/gym/social';
  const [minutes, setMinutes] = useState('');
  const [performedOn, setPerformedOn] = useState(todayIso());
  const toast = useToast();
  const inputRef = useRef(null);
  const [linked, setLinked] = useState(null);
  const [picking, setPicking] = useState(false);
  const [postable, setPostable] = useState(null);
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
    if (shareWorkoutId) getWorkout(shareWorkoutId).then((data) => setSharedName(data.name)).catch(() => setError('Ficha não encontrada.'));
    if (sharePlanId) getPlan(sharePlanId).then((data) => setSharedName(data.name)).catch(() => setError('Plano não encontrado.'));
    if (shareExerciseId) {
      getExercises()
        .then((list) => {
          const found = list.find((item) => item.id === shareExerciseId);
          if (found) setSharedName(found.name);
          else setError('Exercício não encontrado.');
        })
        .catch(() => setError('Exercício não encontrado.'));
    }
  }, [shareWorkoutId, sharePlanId, shareExerciseId]);

  useEffect(() => {
    if (!initialSession) return;
    getSession(initialSession)
      .then((data) => setLinked({ id: data.id, name: data.name, date: data.started_at.slice(0, 10) }))
      .catch(() => setError('Não foi possível carregar o treino.'));
  }, [initialSession]);

  const openPicker = () => {
    setPicking(true);
    getPostableSessions().then(setPostable).catch(() => setPostable([]));
  };
  const closePicker = useCallback(() => setPicking(false), []);
  const chooseSession = (item) => {
    setLinked(item);
    setPicking(false);
  };

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
  const minutesValue = Number(minutes);
  const checkinReady = !!chosenActivity && minutesValue >= 1 && minutesValue <= 600 && photos.length > 0;
  const canSubmit = !progress && !preparing && (sharing ? !!sharedName : checkin ? checkinReady : linked || caption.trim() || photos.length || chosenActivity);

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
        session_id: sharing ? null : linked?.id ?? null,
        caption: caption.trim() || null,
        activity: linked || sharing ? null : chosenActivity || null,
        share_workout_id: shareWorkoutId,
        share_plan_id: sharePlanId,
        share_exercise_id: shareExerciseId,
        media_ids: ids,
        ...(checkin ? { minutes: minutesValue, performed_on: performedOn } : {}),
      });
      toast(checkin ? 'Check-in feito' : 'Publicado no feed');
      router.replace(backHref);
    } catch (err) {
      setError(apiError(err, 'Não foi possível publicar.'));
      setProgress('');
    }
  };

  return (
    <div className={styles.page}>
      <Link href={backHref} className={styles.back}><ChevronLeft size={18} /> {challengeId ? 'Desafio' : 'Feed'}</Link>
      <h1 className={styles.title}>
        {shareWorkoutId ? 'Compartilhar ficha' : sharePlanId ? 'Compartilhar plano' : shareExerciseId ? 'Compartilhar exercício' : checkin ? 'Check-in manual' : linked ? 'Publicar treino' : 'Nova publicação'}
      </h1>
      {checkin && <p className={styles.muted}>Para treinos feitos fora do app. A foto é obrigatória e serve de prova para o grupo.</p>}

      <form className={styles.form} onSubmit={submit}>
        {sharing && (
          <section className={styles.workout}>
            <span className={styles.workoutIcon}>{sharePlanId ? <CalendarDays size={18} /> : shareExerciseId ? <Dumbbell size={18} /> : <ClipboardList size={18} />}</span>
            <span className={styles.workoutText}>
              <span className={styles.workoutName}>{sharedName || 'Carregando...'}</span>
              <span className={styles.muted}>Quem vir o post pode copiar {sharePlanId ? 'o plano' : shareExerciseId ? 'o exercício' : 'a ficha'}</span>
            </span>
          </section>
        )}

        {checkin || sharing ? null : linked ? (
          <section className={styles.workout}>
            <span className={styles.workoutIcon}><Dumbbell size={18} /></span>
            <span className={styles.workoutText}>
              <span className={styles.workoutName}>{linked.name}</span>
              <span className={styles.muted}>{formatDay(linked.date)} · o resumo do treino vai junto com as fotos</span>
            </span>
            <button type="button" className={styles.workoutChange} onClick={openPicker}>Trocar</button>
            <button type="button" className={styles.workoutRemove} onClick={() => setLinked(null)} aria-label="Desvincular treino">
              <X size={16} />
            </button>
          </section>
        ) : (
          <button type="button" className={styles.linkWorkout} onClick={openPicker}>
            <span className={styles.workoutIcon}><Link2 size={18} /></span>
            <span className={styles.workoutText}>
              <span className={styles.workoutName}>Vincular um treino do app</span>
              <span className={styles.muted}>O resumo do treino aparece junto com as fotos</span>
            </span>
            <ChevronRight size={18} className={styles.muted} />
          </button>
        )}

        {!linked && !sharing && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>O que você fez? {!checkin && <small>opcional</small>}</h2>
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
            {checkin && (
              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>Duração (min)</span>
                  <input
                    className={styles.input}
                    inputMode="numeric"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="Ex.: 45"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Data</span>
                  <input
                    type="date"
                    className={styles.input}
                    value={performedOn}
                    min={addDays(todayIso(), -7)}
                    max={todayIso()}
                    onChange={(e) => setPerformedOn(e.target.value || todayIso())}
                  />
                </label>
              </div>
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
            placeholder={linked ? 'Como foi o treino?' : 'Conte como foi'}
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

      <GymSheet open={picking} onClose={closePicker} title="Vincular treino">
        {!postable && <p className={styles.muted}>Carregando treinos...</p>}
        {postable && postable.length === 0 && (
          <p className={styles.muted}>Nenhum treino dos últimos 30 dias para publicar. Os treinos que já estão no feed não aparecem aqui.</p>
        )}
        {postable && postable.length > 0 && (
          <ul className={styles.sessionList}>
            {postable.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${styles.sessionItem} ${linked?.id === item.id ? styles.sessionActive : ''}`}
                  onClick={() => chooseSession(item)}
                >
                  <span className={styles.workoutText}>
                    <span className={styles.workoutName}>{item.name}</span>
                    <span className={styles.muted}>
                      {formatDay(item.date)} · <Clock size={12} /> {item.minutes} min · {plural(item.exercises, 'exercício', 'exercícios')}
                      {item.volume_kg > 0 ? ` · ${formatVolume(item.volume_kg)}` : ''}
                    </span>
                  </span>
                  <ChevronRight size={18} className={styles.muted} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </GymSheet>
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
