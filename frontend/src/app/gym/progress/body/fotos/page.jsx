'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeftRight, Camera, ChevronLeft, Lock, Trash2, X } from 'lucide-react';
import { deleteMedia, getProgressPhotos, mediaSrc, peekCache, uploadPhoto } from '../../../../../lib/api';
import { apiError, formatDay, formatLongDay, todayIso } from '../../../../../lib/gym';
import { preparePhoto } from '../../../../../lib/photos';
import { useToast } from '../../../../../components/Toast';
import { useConfirm } from '../../../../../components/ConfirmDialog';
import GymSheet from '../../../../../components/gym/GymSheet';
import CropFrame from '../../../../../components/gym/social/CropFrame';
import styles from './photos.module.css';

function daysBetween(a, b) {
  return Math.round(Math.abs(new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);
}

export default function ProgressPhotosPage() {
  const toast = useToast();
  const confirmAction = useConfirm();
  const inputRef = useRef(null);
  const [photos, setPhotos] = useState(() => peekCache('fitnessProgressPhotos'));
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState([]);

  const load = useCallback(() => {
    getProgressPhotos().then(setPhotos).catch((err) => setError(apiError(err, 'Não foi possível carregar as fotos.')));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const choose = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const photo = await preparePhoto(file);
      setDraft({ ...photo, taken_on: todayIso(), note: '' });
    } catch {
      toast({ tone: 'danger', message: 'Não foi possível ler a foto. Tente uma imagem em JPEG ou PNG.' });
    }
  };

  const closeDraft = useCallback(() => {
    setDraft((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await uploadPhoto(draft, { kind: 'progress', taken_on: draft.taken_on, note: draft.note.trim() });
      toast('Foto salva');
      closeDraft();
      load();
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível salvar a foto.') });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (photo) => {
    const ok = await confirmAction({
      title: 'Apagar foto',
      message: [<>A foto de <strong>{formatLongDay(photo.taken_on)}</strong> será apagada.</>],
      confirmLabel: 'Apagar',
    });
    if (!ok) return;
    try {
      await deleteMedia(photo.id);
      setViewing(null);
      setPhotos((list) => list.filter((p) => p.id !== photo.id));
      toast('Foto apagada');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível apagar a foto.') });
    }
  };

  const tap = (photo) => {
    if (!comparing) return setViewing(photo);
    setPicked((current) => {
      if (current.some((p) => p.id === photo.id)) return current.filter((p) => p.id !== photo.id);
      return [...current, photo].slice(-2);
    });
  };

  const toggleCompare = () => {
    setComparing((value) => !value);
    setPicked([]);
  };

  const pair = picked.length === 2 ? [...picked].sort((a, b) => (a.taken_on < b.taken_on ? -1 : 1)) : null;
  const closeViewing = useCallback(() => setViewing(null), []);
  const closePair = useCallback(() => setPicked([]), []);

  return (
    <div className={styles.page}>
      <Link href="/gym/progress/body" className={styles.back}><ChevronLeft size={18} /> Peso corporal</Link>
      <header className={styles.top}>
        <h1 className={styles.title}>Fotos de evolução</h1>
        <p className={styles.subtitle}><Lock size={13} /> Só você vê estas fotos. Elas nunca vão para o feed.</p>
      </header>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => inputRef.current?.click()}>
          <Camera size={18} /> Adicionar foto
        </button>
        {photos && photos.length > 1 && (
          <button type="button" className={`${styles.secondary} ${comparing ? styles.secondaryActive : ''}`} onClick={toggleCompare}>
            <ArrowLeftRight size={18} /> {comparing ? 'Cancelar' : 'Comparar'}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={choose} />

      {comparing && <p className={styles.hint}>Toque em duas fotos para ver lado a lado.</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!photos && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Carregando fotos" />}

      {photos && photos.length === 0 && (
        <section className={styles.empty}>
          <Camera size={26} />
          <p className={styles.emptyTitle}>Nenhuma foto ainda</p>
          <p className={styles.emptyText}>Tire fotos de tempos em tempos, sempre no mesmo lugar e na mesma luz, para comparar a evolução.</p>
        </section>
      )}

      {photos && photos.length > 0 && (
        <ul className={styles.grid}>
          {photos.map((photo) => {
            const selected = picked.some((p) => p.id === photo.id);
            return (
              <li key={photo.id}>
                <button type="button" className={`${styles.tile} ${selected ? styles.tileSelected : ''}`} onClick={() => tap(photo)}>
                  <Image src={mediaSrc(photo.url)} alt="" fill unoptimized sizes="(max-width: 760px) 33vw, 240px" />
                  <span className={styles.tileDate}>{formatDay(photo.taken_on)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <GymSheet open={!!draft} onClose={closeDraft} title="Nova foto">
        {draft && (
          <div className={styles.sheet}>
            <CropFrame photo={draft} onMove={(position) => setDraft((current) => ({ ...current, position }))} />
            <label className={styles.field}>
              <span className={styles.label}>Data</span>
              <input
                type="date"
                className={styles.input}
                value={draft.taken_on}
                max={todayIso()}
                onChange={(e) => setDraft((current) => ({ ...current, taken_on: e.target.value || current.taken_on }))}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Nota <small>opcional</small></span>
              <input
                className={styles.input}
                value={draft.note}
                maxLength={140}
                placeholder="Ex.: de frente, em jejum"
                onChange={(e) => setDraft((current) => ({ ...current, note: e.target.value }))}
              />
            </label>
            <button type="button" className={styles.primary} onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar foto'}
            </button>
          </div>
        )}
      </GymSheet>

      <GymSheet open={!!viewing} onClose={closeViewing} title={viewing ? formatLongDay(viewing.taken_on) : ''}>
        {viewing && (
          <div className={styles.sheet}>
            <div className={styles.viewer}>
              <Image src={mediaSrc(viewing.full_url)} alt="" fill unoptimized sizes="100vw" />
            </div>
            {viewing.note && <p className={styles.note}>{viewing.note}</p>}
            <button type="button" className={styles.danger} onClick={() => remove(viewing)}><Trash2 size={16} /> Apagar foto</button>
          </div>
        )}
      </GymSheet>

      {pair && (
        <div className={styles.compare} role="dialog" aria-modal="true" aria-label="Comparar fotos">
          <button type="button" className={styles.compareClose} onClick={closePair} aria-label="Fechar comparação"><X size={22} /></button>
          <p className={styles.compareTitle}>{daysBetween(pair[0].taken_on, pair[1].taken_on)} dias de diferença</p>
          <div className={styles.compareRow}>
            {pair.map((photo) => (
              <figure key={photo.id} className={styles.compareItem}>
                <div className={styles.compareImage}>
                  <Image src={mediaSrc(photo.full_url)} alt="" fill unoptimized sizes="50vw" />
                </div>
                <figcaption>{formatLongDay(photo.taken_on)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
