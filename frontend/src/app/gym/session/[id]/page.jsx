'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Plus, MoreHorizontal, Repeat, Trash2, Flag, Play, Dumbbell, Trophy, ArrowDownToLine, ArrowUpDown,
  ChevronLeft, ChevronRight, Check, LayoutList, GalleryHorizontalEnd, CloudOff, RefreshCw, ArrowLeftRight
} from 'lucide-react';
import {
  getSession, getSessionInsights, getExercises, peekCache, finishSession, deleteSession, addSessionExercise,
  updateSessionExercise, removeSessionExercise, reorderSession, addSet, updateSet, deleteSet,
} from '../../../../lib/api';
import {
  apiError, formatClock, formatDuration, formatKg, formatLongDate, formatRest, formatTime, formatVolume,
  plural, REST_OPTIONS, FORGOTTEN_AFTER_MS, seriesCount, renumberSets, nextPosition, groupsLabel, familySiblings, equipmentLabel,
} from '../../../../lib/gym';
import { startRestTimer, stopRestTimer, getRestTimer } from '../../../../lib/restTimer';
import {
  newClientId, isOfflineError, pendingFor, enqueueSet, dequeueSet, forgetSession, pendingEntry, withPending,
  saveSnapshot, readSnapshot,
} from '../../../../lib/setQueue';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import GymSheet from '../../../../components/gym/GymSheet';
import ExercisePicker from '../../../../components/gym/ExercisePicker';
import SessionExerciseCard from '../../../../components/gym/SessionExerciseCard';
import SessionSummary from '../../../../components/gym/SessionSummary';
import { SortableList, SortableItem, DragHandle } from '../../../../components/Sortable';
import RestTimer from '../../../../components/gym/RestTimer';
import useNow from '../../../../components/gym/useNow';
import useWakeLock from '../../../../components/gym/useWakeLock';
import s from '../../../../components/gym/sheet.module.css';
import styles from './page.module.css';

const totals = (session) => session.exercises.reduce(
  (acc, item) => {
    item.sets.forEach(entry => {
      acc.sets += 1;
      acc.volume += entry.weight_kg * entry.reps;
    });
    return acc;
  },
  { sets: 0, volume: 0 },
);

const withItem = (session, itemId, change) => ({
  ...session,
  exercises: session.exercises.map(item => (item.id === itemId ? change(item) : item)),
});

const lastActivity = (session) => {
  const times = session.exercises.flatMap(item => item.sets.map(entry => new Date(entry.created_at).getTime()));
  return new Date(Math.max(new Date(session.started_at).getTime(), ...times)).toISOString();
};

const VIEW_KEY = 'gymSessionView';
const VIEW_EVENT = 'gym-session-view-changed';

function getView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'focus';
  } catch {
    return 'focus';
  }
}

function saveView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {}
  window.dispatchEvent(new Event(VIEW_EVENT));
}

function subscribeView(onChange) {
  window.addEventListener(VIEW_EVENT, onChange);
  return () => window.removeEventListener(VIEW_EVENT, onChange);
}

const isDone = (item) => (item.target_sets ? seriesCount(item.sets) >= item.target_sets : item.sets.length > 0);

const firstPending = (session) => (session.exercises.find(item => !isDone(item)) ?? session.exercises.at(-1))?.id ?? null;

export default function SessionPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const confirmAction = useConfirm();
  const now = useNow();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading');
  const [sheet, setSheet] = useState(null);
  const [exercises, setExercises] = useState(() => peekCache('fitnessExercises') ?? null);
  const [exercisesError, setExercisesError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const view = useSyncExternalStore(subscribeView, getView, () => 'focus');
  const carouselRef = useRef(null);
  const stripRef = useRef(null);
  const fromScroll = useRef(false);
  const scrollTarget = useRef(null);
  const flushing = useRef(false);
  const [offline, setOffline] = useState(false);

  useWakeLock(session?.status === 'in_progress');

  const [insights, setInsights] = useState(null);
  const finishedId = session?.status === 'completed' ? session.id : null;

  useEffect(() => {
    if (!finishedId) return;
    let active = true;
    getSessionInsights(finishedId).then(result => { if (active) setInsights(result); }).catch(() => {});
    return () => { active = false; };
  }, [finishedId]);

  useEffect(() => {
    if (session) saveSnapshot(session);
  }, [session]);

  const loaded = useCallback((raw) => {
    const data = withPending(raw);
    setSession(data);
    setOffline(false);
    setCurrentId(current => current ?? firstPending(data));
    setStatus('ready');
    if (data.status === 'in_progress' && Date.now() - new Date(data.last_activity_at).getTime() > FORGOTTEN_AFTER_MS) {
      setSheet({ type: 'forgotten' });
    }
  }, []);

  const failed = useCallback((err) => {
    const snapshot = isOfflineError(err) ? readSnapshot(Number(id)) : null;
    if (snapshot) {
      setSession(withPending(snapshot));
      setCurrentId(current => current ?? firstPending(snapshot));
      setOffline(true);
      setStatus('ready');
      return;
    }
    setStatus(err?.response?.status === 404 ? 'missing' : 'error');
  }, [id]);

  const load = useCallback(() => {
    setStatus('loading');
    getSession(id).then(loaded).catch(failed);
  }, [id, loaded, failed]);

  useEffect(() => {
    getSession(id).then(loaded).catch(failed);
  }, [id, loaded, failed]);

  const closeSheet = useCallback(() => setSheet(null), []);

  const loadExercises = () => {
    setExercisesError(false);
    getExercises().then(setExercises).catch(() => setExercisesError(true));
  };

  const openPicker = (type, item) => {
    loadExercises();
    setSheet({ type, item });
  };

  const fail = (err, fallback) => {
    toast({ tone: 'danger', message: apiError(err, fallback) });
    return false;
  };

  const buzz = () => {
    try {
      navigator.vibrate?.(30);
    } catch {}
  };

  const celebrate = (item, record) => {
    try {
      navigator.vibrate?.([80, 60, 80, 60, 160]);
    } catch {}
    const load = item.equipment === 'bodyweight'
      ? (weight) => (weight > 0 ? `PC + ${formatKg(weight)} kg` : 'peso corporal')
      : (weight) => `${formatKg(weight)} kg`;
    toast({
      tone: 'record',
      message: record.type === 'weight'
        ? `Novo recorde em ${item.exercise_name}: ${load(record.weight_kg)} × ${record.reps}. Antes: ${load(record.previous_weight_kg)}.`
        : `Recorde de reps em ${item.exercise_name}: ${record.reps} com ${load(record.weight_kg)}. Antes: ${record.previous_reps}.`,
    });
  };

  const replacePending = (itemId, clientId, entry) => {
    setSession(current => withItem(current, itemId, it => ({
      ...it,
      sets: renumberSets(entry
        ? it.sets.map(e => (e.client_id === clientId ? entry : e))
        : it.sets.filter(e => e.client_id !== clientId)),
    })));
  };

  const logSet = async (item, data) => {
    const clientId = newClientId();
    try {
      const entry = await addSet(item.id, { ...data, client_id: clientId });
      setSession(current => withItem(current, item.id, it => ({
        ...it,
        sets: renumberSets([...it.sets, entry]),
      })));
      setOffline(false);
      if (entry.record) celebrate(item, entry.record);
      else buzz();
      return true;
    } catch (err) {
      if (!isOfflineError(err)) return fail(err, 'Não foi possível salvar a série. Tente de novo.');
      const queued = {
        clientId,
        sessionId: session.id,
        itemId: item.id,
        data,
        position: nextPosition(item.sets, data.side ?? null),
        createdAt: new Date().toISOString(),
      };
      enqueueSet(queued);
      setSession(current => withItem(current, item.id, it => ({ ...it, sets: [...it.sets, pendingEntry(queued)] })));
      setOffline(true);
      buzz();
      return true;
    }
  };

  const flush = useCallback(async () => {
    if (!session || session.status !== 'in_progress' || flushing.current) return;
    const queue = pendingFor(session.id);
    if (!queue.length) return;
    flushing.current = true;
    for (const queued of queue) {
      try {
        const entry = await addSet(queued.itemId, { ...queued.data, client_id: queued.clientId });
        dequeueSet(queued.clientId);
        replacePending(queued.itemId, queued.clientId, entry);
        setOffline(false);
      } catch (err) {
        if (isOfflineError(err)) {
          setOffline(true);
          break;
        }
        dequeueSet(queued.clientId);
        replacePending(queued.itemId, queued.clientId, null);
        toast({ tone: 'danger', message: apiError(err, 'Uma série guardada sem conexão não pôde ser salva.') });
      }
    }
    flushing.current = false;
  }, [session, toast]);

  const pendingCount = session ? session.exercises.reduce((n, it) => n + it.sets.filter(e => e.pending).length, 0) : 0;

  useEffect(() => {
    if (!pendingCount) return;
    const retry = () => { if (document.visibilityState === 'visible') flush(); };
    const first = setTimeout(retry, 0);
    const timer = setInterval(retry, 15000);
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [pendingCount, flush]);

  const editSet = async (item, entry, data) => {
    try {
      const updated = await updateSet(entry.id, data);
      setSession(current => withItem(current, item.id, it => ({
        ...it,
        sets: it.sets.map(e => (e.id === updated.id ? updated : e)),
      })));
      return true;
    } catch (err) {
      return fail(err, 'Não foi possível salvar a série.');
    }
  };

  const removeSet = async (item, entry, silent = false) => {
    if (entry.pending) {
      dequeueSet(entry.client_id);
      replacePending(item.id, entry.client_id, null);
      return true;
    }
    try {
      await deleteSet(entry.id);
      setSession(current => withItem(current, item.id, it => ({
        ...it,
        sets: renumberSets(it.sets.filter(e => e.id !== entry.id)),
      })));
      if (!silent) {
        toast({
          message: `Série ${entry.position} de ${item.exercise_name} excluída`,
          action: { label: 'Desfazer', onClick: () => logSet(item, { weight_kg: entry.weight_kg, reps: entry.reps, side: entry.side ?? undefined, rir: entry.rir ?? undefined, duration_seconds: entry.duration_seconds ?? undefined, distance_km: entry.distance_km ?? undefined, speed_kmh: entry.speed_kmh ?? undefined, level: entry.level ?? undefined }) },
        });
      }
      return true;
    } catch (err) {
      return fail(err, 'Não foi possível excluir a série.');
    }
  };

  const changeRest = async (item, seconds) => {
    setSheet(null);
    try {
      setSession(withPending(await updateSessionExercise(item.id, { rest_seconds: seconds })));
    } catch (err) {
      fail(err, 'Não foi possível salvar o descanso.');
    }
  };

  const startRest = (item) => startRestTimer(item.rest_seconds, item.exercise_name, session.id);

  const toggleUnilateral = async (item) => {
    try {
      setSession(withPending(await updateSessionExercise(item.id, { unilateral: !item.unilateral })));
      toast(item.unilateral ? `${item.exercise_name}: bilateral` : `${item.exercise_name}: unilateral (esquerda e direita)`);
    } catch (err) {
      fail(err, 'Não foi possível mudar o modo do exercício.');
    }
  };

  const planned = (item) => !!session.workout_id && item.from_plan;

  const requestUnilateral = (item) => {
    if (!planned(item)) return toggleUnilateral(item);
    setSheet({
      type: 'confirm',
      item,
      text: <>A ficha manda fazer <strong>{item.exercise_name}</strong> {item.unilateral ? 'unilateral (esquerda e direita)' : 'bilateral'}. Fazer {item.unilateral ? 'bilateral' : 'unilateral'} só neste treino? A ficha não muda.</>,
      confirmLabel: item.unilateral ? 'Fazer bilateral' : 'Fazer unilateral',
      onConfirm: () => toggleUnilateral(item),
    });
  };

  const requestSwap = (item, selected) => {
    const [exercise] = selected;
    if (!exercise || !planned(item)) return swapExercise(item, selected);
    setSheet({
      type: 'confirm',
      item,
      text: <>A ficha manda <strong>{item.exercise_name}</strong> ({equipmentLabel(item.equipment).toLowerCase()}). Trocar por <strong>{exercise.name}</strong> ({equipmentLabel(exercise.equipment).toLowerCase()}) só neste treino? A ficha não muda.</>,
      confirmLabel: 'Trocar',
      onConfirm: () => swapExercise(item, selected),
    });
  };

  const saveNote = async (item, note) => {
    try {
      setSession(withPending(await updateSessionExercise(item.id, { note })));
      return true;
    } catch (err) {
      fail(err, 'Não foi possível salvar a observação.');
      return false;
    }
  };

  const addExercises = async (selected) => {
    setSheet(null);
    try {
      const before = session.exercises.length;
      let latest = session;
      for (const exercise of selected) latest = await addSessionExercise(session.id, exercise.id);
      setSession(withPending(latest));
      if (latest.exercises[before]) setCurrentId(latest.exercises[before].id);
    } catch (err) {
      fail(err, 'Não foi possível adicionar o exercício.');
      load();
    }
  };

  const swapExercise = async (item, [exercise]) => {
    setSheet(null);
    try {
      setSession(withPending(await updateSessionExercise(item.id, { exercise_id: exercise.id })));
    } catch (err) {
      fail(err, 'Não foi possível trocar o exercício.');
    }
  };

  const reorder = async (ids) => {
    const previous = session;
    setSession(current => ({ ...current, exercises: ids.map(itemId => current.exercises.find(item => item.id === itemId)) }));
    try {
      await reorderSession(previous.id, ids);
    } catch (err) {
      setSession(previous);
      fail(err, 'Não foi possível mudar a ordem.');
    }
  };

  const moveToEnd = (item) => {
    setSheet(null);
    const all = session.exercises.map(e => e.id);
    const ids = all.filter(itemId => itemId !== item.id);
    if (item.id === currentId) setCurrentId(all[all.indexOf(item.id) + 1] ?? item.id);
    reorder([...ids, item.id]);
    toast(`${item.exercise_name} foi para o fim do treino`);
  };

  const removeExercise = async (item) => {
    setSheet(null);
    if (item.sets.length) {
      const ok = await confirmAction({
        title: 'Remover exercício',
        message: [<><strong>{item.exercise_name}</strong> sai deste treino junto com {plural(seriesCount(item.sets), 'série registrada', 'séries registradas')}.</>],
        confirmLabel: 'Remover',
      });
      if (!ok) return;
    }
    try {
      const all = session.exercises.map(e => e.id);
      const updated = await removeSessionExercise(item.id);
      if (item.id === currentId) {
        const index = all.indexOf(item.id);
        setCurrentId(all[index + 1] ?? all[index - 1] ?? null);
      }
      setSession(withPending(updated));
    } catch (err) {
      fail(err, 'Não foi possível remover o exercício.');
    }
  };

  const finish = async (completedAt) => {
    if (pendingCount) {
      flush();
      toast({ tone: 'info', message: `Espere ${pendingCount === 1 ? 'a série guardada ser enviada' : `as ${pendingCount} séries guardadas serem enviadas`} para finalizar.` });
      return;
    }
    setBusy(true);
    try {
      const data = await finishSession(session.id, completedAt);
      forgetSession(session.id);
      if (getRestTimer()?.sessionId === session.id) stopRestTimer();
      setSession(data);
      setSheet(null);
      window.scrollTo({ top: 0 });
    } catch (err) {
      fail(err, 'Não foi possível finalizar o treino.');
    }
    setBusy(false);
  };

  const discard = async () => {
    setSheet(null);
    const ok = await confirmAction({
      title: 'Descartar treino',
      message: ['O treino e todas as séries registradas nele serão apagados.'],
      confirmLabel: 'Descartar',
    });
    if (!ok) return;
    try {
      await deleteSession(session.id);
      forgetSession(session.id);
      if (getRestTimer()?.sessionId === session.id) stopRestTimer();
      toast('Treino descartado');
      router.push('/gym/workouts');
    } catch (err) {
      fail(err, 'Não foi possível descartar o treino.');
    }
  };

  const ids = session?.exercises.map(item => item.id) ?? [];
  const idsKey = ids.join(',');
  const currentIndex = Math.max(0, ids.indexOf(currentId));
  const focus = view === 'focus' && session?.status === 'in_progress' && ids.length > 0;

  useLayoutEffect(() => {
    const el = carouselRef.current;
    if (!focus || !el) return;
    if (fromScroll.current) {
      fromScroll.current = false;
      return;
    }
    const left = currentIndex * el.clientWidth;
    if (Math.abs(el.scrollLeft - left) > 2) el.scrollTo({ left, behavior: 'instant' });
  }, [focus, currentIndex, idsKey]);

  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.children[currentIndex];
    if (!chip) return;
    strip.scrollTo({ left: chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  }, [currentIndex, idsKey, focus]);

  const goTo = (index) => {
    const id = ids[index];
    if (!id) return;
    const el = carouselRef.current;
    if (el) {
      fromScroll.current = true;
      clearTimeout(scrollTarget.current?.timer);
      scrollTarget.current = { index, timer: setTimeout(() => { scrollTarget.current = null; }, 1000) };
      el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
    }
    setCurrentId(id);
    const top = stripRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) window.scrollBy({ top: top - 12, behavior: 'smooth' });
  };

  const handleCarouselScroll = () => {
    const el = carouselRef.current;
    const target = scrollTarget.current;
    if (target) {
      if (Math.abs(el.scrollLeft - target.index * el.clientWidth) < 2) {
        clearTimeout(target.timer);
        scrollTarget.current = null;
      }
      return;
    }
    const id = ids[Math.round(el.scrollLeft / el.clientWidth)];
    if (id && id !== currentId) {
      fromScroll.current = true;
      setCurrentId(id);
    }
  };

  if (status === 'missing' || (status === 'error' && !session)) {
    return (
      <div className={styles.state}>
        <p>{status === 'missing' ? 'Esse treino não existe ou foi descartado.' : 'Não foi possível carregar o treino.'}</p>
        {status === 'missing'
          ? <Link href="/gym/workouts" className={styles.stateAction}>Ver suas fichas</Link>
          : <button type="button" className={styles.stateAction} onClick={load}>Tentar de novo</button>}
      </div>
    );
  }

  if (!session) {
    return (
      <div className={styles.page} aria-busy="true" aria-label="Carregando treino">
        <div className={styles.skeletonHeader} />
        <div className={styles.skeletonCard} />
        <div className={styles.skeletonCard} />
      </div>
    );
  }

  if (session.status === 'completed') {
    return (
      <div className={styles.page} data-session-focus="">
        <header className={styles.doneHeader}>
          <span className={styles.trophy}><Trophy size={26} /></span>
          <p className={styles.kicker}>Treino concluído</p>
          <h1 className={styles.title}>{session.name}</h1>
        </header>
        <SessionSummary session={session} insights={insights} />
        <div className={s.actions}>
          <Link href="/gym" className={s.primary}>Voltar ao início</Link>
          <Link href="/gym/history" className={s.secondary}>Ver histórico</Link>
        </div>
      </div>
    );
  }

  const { sets: totalSets, volume } = totals(session);
  const elapsed = now ? (now - new Date(session.started_at).getTime()) / 1000 : null;
  const lastAt = lastActivity(session);
  const pending = session.exercises.filter(item => item.sets.length === 0).length;

  const current = session.exercises[currentIndex];
  const next = session.exercises[currentIndex + 1];
  const cardProps = {
    onLogSet: logSet,
    onEditSet: editSet,
    onDeleteSet: removeSet,
    onStartRest: startRest,
    onOpenRest: it => setSheet({ type: 'rest', item: it }),
    onOpenMenu: it => {
      loadExercises();
      setSheet({ type: 'menu', item: it });
    },
    onSaveNote: saveNote,
    onToggleUnilateral: requestUnilateral,
  };

  return (
    <div className={styles.page} data-session-focus="">
      <div className={styles.headerTop}>
        <Link href="/gym" className={styles.iconButton} aria-label="Voltar ao início">
          <ChevronLeft size={22} />
        </Link>
        <span className={styles.live}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.clock}>{elapsed === null ? '—' : formatClock(elapsed)}</span>
        </span>
        <div className={styles.headerActions}>
          {ids.length > 1 && (
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => saveView(view === 'focus' ? 'list' : 'focus')}
              aria-label={view === 'focus' ? 'Ver todos os exercícios em lista' : 'Ver um exercício por vez'}
            >
              {view === 'focus' ? <LayoutList size={20} /> : <GalleryHorizontalEnd size={20} />}
            </button>
          )}
          <button type="button" className={styles.iconButton} onClick={() => setSheet({ type: 'options' })} aria-label="Mais opções">
            <MoreHorizontal size={20} />
          </button>
        </div>
      </div>
      <header className={styles.header}>
        <h1 className={styles.title}>{session.name}</h1>
        {(pendingCount > 0 || offline) && (
          <div className={styles.offline} role="status">
            <CloudOff size={16} aria-hidden="true" />
            <span>
              {pendingCount
                ? `${pendingCount === 1 ? '1 série guardada' : `${pendingCount} séries guardadas`} no celular. Enviamos quando a conexão voltar.`
                : 'Sem conexão. As próximas séries ficam guardadas no celular.'}
            </span>
            {pendingCount > 0 && (
              <button type="button" className={styles.offlineRetry} onClick={flush} aria-label="Tentar enviar agora">
                <RefreshCw size={16} />
              </button>
            )}
          </div>
        )}
        <p className={styles.headerMeta}>
          {plural(totalSets, 'série', 'séries')} · {formatVolume(volume)}
        </p>
      </header>

      {session.exercises.length === 0 && (
        <button type="button" className={styles.empty} onClick={() => openPicker('add')}>
          <Dumbbell size={30} aria-hidden="true" />
          <span className={styles.emptyTitle}>Treino livre</span>
          <span className={styles.emptyText}>Adicione o primeiro exercício para começar a registrar</span>
        </button>
      )}

      {focus && (
        <>
          <div className={styles.strip} ref={stripRef} role="tablist" aria-label="Exercícios do treino">
            {session.exercises.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === currentIndex}
                className={`${styles.chip} ${index === currentIndex ? styles.chipCurrent : ''} ${isDone(item) ? styles.chipDone : ''}`}
                onClick={() => goTo(index)}
              >
                <span className={styles.chipIndex}>{isDone(item) ? <Check size={13} strokeWidth={3} /> : index + 1}</span>
                <span className={styles.chipName}>{item.exercise_name}</span>
              </button>
            ))}
            <button type="button" className={`${styles.chip} ${styles.chipAdd}`} onClick={() => openPicker('add')} aria-label="Adicionar exercício">
              <Plus size={16} strokeWidth={2.4} />
            </button>
          </div>

          <div className={styles.carousel} ref={carouselRef} onScroll={handleCarouselScroll}>
            {session.exercises.map((item, index) => (
              <div key={item.id} className={styles.slide} aria-hidden={index !== currentIndex} inert={index !== currentIndex}>
                <SessionExerciseCard item={item} index={index} {...cardProps} />
              </div>
            ))}
          </div>
        </>
      )}

      {!focus && session.exercises.length > 0 && (
        <>
          <div className={styles.cards}>
            {session.exercises.map((item, index) => (
              <SessionExerciseCard key={item.id} item={item} index={index} {...cardProps} />
            ))}
          </div>
          <button type="button" className={styles.add} onClick={() => openPicker('add')}>
            <Plus size={18} strokeWidth={2.4} /> Adicionar exercício
          </button>
        </>
      )}

      <nav className={styles.bar} aria-label="Navegação do treino">
        {focus && (
          <button
            type="button"
            className={styles.barPrev}
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            aria-label="Exercício anterior"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {focus && next ? (
          <button
            type="button"
            className={`${styles.barMain} ${isDone(current) ? styles.barMainReady : ''}`}
            onClick={() => goTo(currentIndex + 1)}
          >
            <span className={styles.barText}>
              <small>Próximo · {currentIndex + 2} de {ids.length}</small>
              <span>{next.exercise_name}</span>
            </span>
            <ChevronRight size={22} />
          </button>
        ) : (
          <button type="button" className={`${styles.barMain} ${styles.barFinish}`} onClick={() => setSheet({ type: 'finish' })}>
            <Flag size={18} /> Finalizar treino
          </button>
        )}
      </nav>

      <RestTimer />

      <GymSheet
        open={!!sheet}
        onClose={closeSheet}
        title={{
          add: 'Adicionar exercício',
          swap: 'Trocar exercício',
          menu: sheet?.item?.exercise_name,
          order: 'Ordem dos exercícios',
          rest: 'Tempo de descanso',
          finish: 'Finalizar treino',
          forgotten: 'Esse treino ficou aberto',
          options: 'Treino',
          confirm: 'Diferente da ficha',
        }[sheet?.type] ?? ''}
      >
        {sheet?.type === 'add' && (
          <ExercisePicker exercises={exercises} loadError={exercisesError} onRetry={loadExercises} onConfirm={addExercises} />
        )}

        {sheet?.type === 'swap' && (
          <ExercisePicker
            single
            exercises={exercises}
            loadError={exercisesError}
            onRetry={loadExercises}
            onConfirm={selected => requestSwap(sheet.item, selected)}
          />
        )}

        {sheet?.type === 'menu' && (
          <div className={s.actions}>
            {session.exercises.length > 1 && (
              <>
                <button
                  type="button"
                  className={s.option}
                  onClick={() => moveToEnd(sheet.item)}
                  disabled={session.exercises.at(-1).id === sheet.item.id}
                >
                  <ArrowDownToLine size={20} />
                  <span>Deixar para depois<small>Vai para o fim do treino, útil se o aparelho estiver ocupado</small></span>
                </button>
                <button type="button" className={s.option} onClick={() => setSheet({ type: 'order' })}>
                  <ArrowUpDown size={20} /> <span>Reordenar exercícios</span>
                </button>
              </>
            )}
            <button
              type="button"
              className={s.option}
              onClick={() => { const item = sheet.item; setSheet(null); requestUnilateral(item); }}
              disabled={sheet.item.sets.length > 0}
            >
              <ArrowLeftRight size={20} />
              <span>
                {sheet.item.unilateral ? 'Fazer bilateral' : 'Fazer unilateral (E/D)'}
                <small>{sheet.item.sets.length > 0 ? 'Só dá para mudar antes de registrar séries' : 'Anote carga e reps da esquerda e da direita em cada série'}</small>
              </span>
            </button>
            {familySiblings(exercises?.find(item => item.id === sheet.item.exercise_id), exercises).length > 1 && (
              <div className={s.option} role="group" aria-label="Equipamento">
                <Dumbbell size={20} />
                <span>
                  Equipamento
                  <small>{sheet.item.sets.length > 0 ? 'Só dá para trocar antes de registrar séries' : 'Mesmo exercício, outro equipamento'}</small>
                  <span className={styles.equipmentChoices}>
                    {familySiblings(exercises.find(item => item.id === sheet.item.exercise_id), exercises).map(variant => (
                      <button
                        key={variant.id}
                        type="button"
                        className={`${styles.equipmentChoice} ${variant.id === sheet.item.exercise_id ? styles.equipmentChoiceOn : ''}`}
                        disabled={sheet.item.sets.length > 0 || variant.id === sheet.item.exercise_id}
                        onClick={() => requestSwap(sheet.item, [variant])}
                      >
                        {equipmentLabel(variant.equipment)}
                      </button>
                    ))}
                  </span>
                </span>
              </div>
            )}
            <button type="button" className={s.option} onClick={() => openPicker('swap', sheet.item)} disabled={sheet.item.sets.length > 0}>
              <Repeat size={20} />
              <span>Trocar exercício{sheet.item.sets.length > 0 && <small>Só dá para trocar antes de registrar séries</small>}</span>
            </button>
            <button type="button" className={`${s.option} ${s.optionDanger}`} onClick={() => removeExercise(sheet.item)}>
              <Trash2 size={20} />
              <span>Remover deste treino<small>A ficha não muda</small></span>
            </button>
          </div>
        )}

        {sheet?.type === 'order' && (
          <div className={s.stack}>
            <p className={s.text}>Arraste para mudar a ordem. A ficha não muda.</p>
            <SortableList ids={session.exercises.map(item => item.id)} onReorder={reorder}>
              <ol className={s.orderList}>
                {session.exercises.map((item, index) => (
                  <SortableItem key={item.id} id={item.id}>
                    {({ itemProps, handleProps, isDragging }) => (
                      <li {...itemProps} className={`${s.orderItem} ${isDragging ? s.orderDragging : ''}`}>
                        <DragHandle handleProps={handleProps} className={s.orderHandle} />
                        <span className={s.orderIndex}>{index + 1}</span>
                        <span className={s.orderText}>
                          <span className={s.orderName}>{item.exercise_name}</span>
                          <span className={s.orderMeta}>
                            {groupsLabel(item)}
                            {item.sets.length ? ` · ${plural(item.sets.length, 'série feita', 'séries feitas')}` : ''}
                          </span>
                        </span>
                      </li>
                    )}
                  </SortableItem>
                ))}
              </ol>
            </SortableList>
            <button type="button" className={s.primary} onClick={closeSheet}>Pronto</button>
          </div>
        )}

        {sheet?.type === 'rest' && (
          <div className={s.stack}>
            <p className={s.text}>
              O cronômetro só começa quando você tocar nele. O tempo fica salvo para as próximas vezes
              {session.workout_id ? ' e na ficha' : ''}.
            </p>
            <div className={s.chips}>
              {REST_OPTIONS.map(seconds => (
                <button
                  key={seconds}
                  type="button"
                  className={`${s.chip} ${sheet.item.rest_seconds === seconds ? s.chipActive : ''}`}
                  onClick={() => changeRest(sheet.item, seconds)}
                >
                  {formatRest(seconds)}
                </button>
              ))}
            </div>
            {sheet.item.rest_seconds ? (
              <button type="button" className={s.secondary} onClick={() => changeRest(sheet.item, null)}>Sem descanso</button>
            ) : null}
          </div>
        )}

        {sheet?.type === 'finish' && (
          <div className={s.stack}>
            {totalSets === 0 ? (
              <p className={s.text}>Você ainda não registrou nenhuma série. Registre ao menos uma ou descarte o treino.</p>
            ) : (
              <>
                <div className={s.stats}>
                  <div className={s.stat}>
                    <span className={s.statValue}>{elapsed === null ? '—' : formatDuration(elapsed * 1000)}</span>
                    <span className={s.statLabel}>Duração</span>
                  </div>
                  <div className={s.stat}>
                    <span className={s.statValue}>{totalSets}</span>
                    <span className={s.statLabel}>Séries</span>
                  </div>
                  <div className={s.stat}>
                    <span className={s.statValue}>{formatVolume(volume)}</span>
                    <span className={s.statLabel}>Volume</span>
                  </div>
                </div>
                {pending > 0 && (
                  <p className={s.text}>{plural(pending, 'exercício ficou', 'exercícios ficaram')} sem séries e não {pending === 1 ? 'entra' : 'entram'} no resumo.</p>
                )}
              </>
            )}
            <div className={s.actions}>
              {totalSets > 0 && (
                <button type="button" className={s.primary} onClick={() => finish(null)} disabled={busy}>
                  <Flag size={18} /> {busy ? 'Finalizando…' : 'Finalizar agora'}
                </button>
              )}
              <button type="button" className={s.secondary} onClick={closeSheet}>Continuar treinando</button>
              {totalSets === 0 && (
                <button type="button" className={s.danger} onClick={discard}><Trash2 size={18} /> Descartar treino</button>
              )}
            </div>
          </div>
        )}

        {sheet?.type === 'forgotten' && (
          <div className={s.stack}>
            <p className={s.text}>
              {totalSets > 0
                ? <>A última série foi registrada <strong>{formatLongDate(lastAt)} às {formatTime(lastAt)}</strong>. Quer finalizar o treino nesse horário?</>
                : <>Você começou este treino <strong>{formatLongDate(session.started_at)} às {formatTime(session.started_at)}</strong> e não registrou nenhuma série.</>}
            </p>
            <div className={s.actions}>
              {totalSets > 0 && (
                <button type="button" className={s.primary} onClick={() => finish(lastAt)} disabled={busy}>
                  <Flag size={18} /> Finalizar às {formatTime(lastAt)}
                </button>
              )}
              <button type="button" className={s.secondary} onClick={closeSheet}>
                <Play size={18} /> Continuar treinando
              </button>
              <button type="button" className={s.danger} onClick={discard}><Trash2 size={18} /> Descartar treino</button>
            </div>
          </div>
        )}

        {sheet?.type === 'confirm' && (
          <div className={s.stack}>
            <p className={s.text}>{sheet.text}</p>
            <div className={s.actions}>
              <button type="button" className={s.primary} onClick={() => { const run = sheet.onConfirm; setSheet(null); run(); }}>
                {sheet.confirmLabel}
              </button>
              <button type="button" className={s.secondary} onClick={closeSheet}>Manter como na ficha</button>
            </div>
          </div>
        )}

        {sheet?.type === 'options' && (
          <div className={s.actions}>
            {session.exercises.length > 1 && (
              <button type="button" className={s.option} onClick={() => setSheet({ type: 'order' })}>
                <ArrowUpDown size={20} /> <span>Reordenar exercícios</span>
              </button>
            )}
            <button type="button" className={s.option} onClick={() => setSheet({ type: 'finish' })}>
              <Flag size={20} /> <span>Finalizar treino</span>
            </button>
            <button type="button" className={`${s.option} ${s.optionDanger}`} onClick={discard}>
              <Trash2 size={20} /> <span>Descartar treino<small>Apaga o treino e as séries registradas</small></span>
            </button>
          </div>
        )}
      </GymSheet>
    </div>
  );
}
