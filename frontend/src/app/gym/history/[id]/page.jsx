'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowUpDown, Building2, Camera, Check, ChevronLeft, Dumbbell, Pencil, Play, Repeat, Trash2 } from 'lucide-react';
import {
  getSession, getSessionInsights, deleteSession, addSet, updateSet, deleteSet, updateSessionExercise, removeSessionExercise,
  getExercises, getGyms, reorderSession, setSessionGym,
} from '../../../../lib/api';
import { apiError, familySiblings, groupsLabel, plural, renumberSets, variantTitle, variantHint } from '../../../../lib/gym';
import GymSheet from '../../../../components/gym/GymSheet';
import VariantChoices from '../../../../components/gym/VariantChoices';
import ExercisePicker from '../../../../components/gym/ExercisePicker';
import { SortableList, SortableItem, DragHandle } from '../../../../components/Sortable';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import SessionSummary from '../../../../components/gym/SessionSummary';
import SessionExerciseCard from '../../../../components/gym/SessionExerciseCard';
import useStartSession from '../../../../components/gym/useStartSession';
import s from '../../../../components/gym/sheet.module.css';
import styles from '../../workouts/editor.module.css';

const sameTracking = (item, exercise) => !item.sets.length || (exercise.tracking ?? 'reps') === (item.tracking ?? 'reps');

export default function HistoryDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const confirmAction = useConfirm();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading');
  const [insights, setInsights] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editPanel, setEditPanel] = useState(null);
  const [exercises, setExercises] = useState(null);
  const [exercisesError, setExercisesError] = useState(false);
  const [gyms, setGyms] = useState([]);
  const [gymOpen, setGymOpen] = useState(false);
  const closeGym = useCallback(() => setGymOpen(false), []);
  const { begin, starting, sheet } = useStartSession();

  const loaded = useCallback((data) => {
    if (data.status !== 'completed') return router.replace(`/gym/session/${data.id}`);
    setSession(data);
    setStatus('ready');
  }, [router]);

  const failed = (err) => setStatus(err?.response?.status === 404 ? 'missing' : 'error');

  const fetchSession = () => {
    setStatus('loading');
    getSession(id).then(loaded).catch(failed);
  };

  useEffect(() => {
    getSession(id).then(loaded).catch(failed);
  }, [id, loaded]);

  useEffect(() => {
    getGyms().then(data => setGyms(data.gyms)).catch(() => {});
  }, []);

  const changeGym = async (gym) => {
    setGymOpen(false);
    if (gym.id === session.gym_id) return;
    try {
      const updated = await setSessionGym(session.id, gym.id);
      setSession(current => ({ ...current, gym_id: updated.gym_id, gym_name: updated.gym_name }));
      setInsights(null);
      getSessionInsights(session.id).then(setInsights).catch(() => {});
      toast(`Treino movido para ${gym.name}`);
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível trocar a academia.') });
    }
  };

  const sessionId = session?.id;
  useEffect(() => {
    if (status !== 'ready' || !sessionId || editing) return;
    let active = true;
    getSessionInsights(sessionId).then(result => { if (active) setInsights(result); }).catch(() => {});
    return () => { active = false; };
  }, [status, sessionId, editing]);

  const fail = (err, message) => {
    toast({ tone: 'danger', message: apiError(err, message) });
    return false;
  };

  const changeItem = (itemId, change) => setSession(current => ({
    ...current,
    exercises: current.exercises.map(it => (it.id === itemId ? change(it) : it)),
  }));

  const logSet = async (item, data) => {
    try {
      const entry = await addSet(item.id, data);
      changeItem(item.id, it => ({ ...it, sets: renumberSets([...it.sets, entry]) }));
      return true;
    } catch (err) {
      return fail(err, 'Não foi possível adicionar a série.');
    }
  };

  const editSet = async (item, entry, data) => {
    try {
      const updated = await updateSet(entry.id, data);
      changeItem(item.id, it => ({ ...it, sets: it.sets.map(e => (e.id === updated.id ? updated : e)) }));
      return true;
    } catch (err) {
      return fail(err, 'Não foi possível salvar a série.');
    }
  };

  const removeSet = async (item, entry) => {
    try {
      await deleteSet(entry.id);
      changeItem(item.id, it => ({ ...it, sets: renumberSets(it.sets.filter(e => e.id !== entry.id)) }));
      return true;
    } catch (err) {
      return fail(err, 'Não foi possível excluir a série.');
    }
  };

  const saveNote = async (item, note) => {
    try {
      setSession(await updateSessionExercise(item.id, { note }));
      return true;
    } catch (err) {
      return fail(err, 'Não foi possível salvar a observação.');
    }
  };

  const loadExercises = () => {
    setExercisesError(false);
    getExercises().then(setExercises).catch(() => setExercisesError(true));
  };

  const startEditing = () => {
    setEditing(true);
    if (!exercises) loadExercises();
  };

  const swapExercise = async (item, [exercise]) => {
    setEditPanel(null);
    if (!exercise || exercise.id === item.exercise_id) return;
    try {
      setSession(await updateSessionExercise(item.id, { exercise_id: exercise.id }));
      toast(`Trocado por ${exercise.name}`);
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

  const removeItem = async (item) => {
    setEditPanel(null);
    const ok = await confirmAction({
      title: 'Remover exercício',
      message: [<><strong>{item.exercise_name}</strong> e as séries dele saem deste treino.</>],
      confirmLabel: 'Remover',
    });
    if (!ok) return;
    try {
      setSession(await removeSessionExercise(item.id));
    } catch (err) {
      fail(err, 'Não foi possível remover o exercício.');
    }
  };

  const editSheet = editing ? editPanel : null;
  const siblings = editSheet?.type === 'menu' && exercises
    ? familySiblings(exercises.find(exercise => exercise.id === editSheet.item.exercise_id), exercises)
    : [];

  const finishEditing = async () => {
    setEditing(false);
    setInsights(null);
    try {
      setSession(await getSession(session.id));
    } catch {
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: 'Excluir treino',
      message: [<><strong>{session.name}</strong> e todas as séries dele saem do histórico.</>],
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteSession(session.id);
      toast('Treino excluído');
      router.push('/gym/history');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível excluir o treino.') });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Link href="/gym/history" className={styles.back}><ChevronLeft size={18} /> Histórico</Link>
        {session && <h1 className={styles.title}>{session.name}</h1>}
        {status === 'ready' && gyms.length > 1 && (
          <button type="button" className={styles.gymChip} onClick={() => setGymOpen(true)} aria-label={`Academia: ${session.gym_name ?? 'sem academia'}. Trocar`}>
            <Building2 size={14} aria-hidden="true" />
            <span>{session.gym_name ?? 'Sem academia'}</span>
          </button>
        )}
        {status === 'ready' && gyms.length <= 1 && session.gym_name && (
          <span className={styles.gymLabel}>
            <Building2 size={14} aria-hidden="true" />
            <span>{session.gym_name}</span>
          </span>
        )}
      </div>

      {status === 'missing' && (
        <div className={styles.state}>
          <p>Esse treino não existe ou foi excluído.</p>
          <Link href="/gym/history" className={styles.stateAction}>Ver histórico</Link>
        </div>
      )}

      {status === 'error' && (
        <div className={styles.state}>
          <p>Não foi possível carregar o treino.</p>
          <button type="button" className={styles.stateAction} onClick={fetchSession}>Tentar de novo</button>
        </div>
      )}

      {status === 'loading' && (
        <div className={styles.top} aria-busy="true" aria-label="Carregando treino">
          <div className={styles.skeleton} />
          <div className={styles.skeletonTall} />
        </div>
      )}

      {status === 'ready' && editing && (
        <>
          <p className={styles.editHint}>Toque numa série para corrigir, deslize para excluir ou registre as que faltaram. No menu de cada exercício dá para trocar ou remover.</p>
          {session.exercises.length > 1 && (
            <button type="button" className={s.secondary} onClick={() => setEditPanel({ type: 'order' })}>
              <ArrowUpDown size={18} /> Reordenar exercícios
            </button>
          )}
          <div className={styles.editList}>
            {session.exercises.map(item => (
              <SessionExerciseCard
                key={item.id}
                item={item}
                index={session.exercises.filter(other => other.tracking !== 'cardio').indexOf(item)}
                onLogSet={logSet}
                onEditSet={editSet}
                onDeleteSet={removeSet}
                onSaveNote={saveNote}
                onOpenMenu={item => setEditPanel({ type: 'menu', item })}
              />
            ))}
          </div>
          <div className={s.actions}>
            <button type="button" className={s.primary} onClick={finishEditing}>
              <Check size={18} strokeWidth={2.6} /> Concluir edição
            </button>
          </div>
        </>
      )}

      {status === 'ready' && !editing && (
        <>
          <SessionSummary session={session} insights={insights} />
          <div className={s.actions}>
            {session.workout_id && (
              <button type="button" className={s.primary} onClick={() => begin(session.workout_id)} disabled={starting}>
                <Play size={18} fill="currentColor" /> {starting ? 'Iniciando…' : 'Treinar de novo'}
              </button>
            )}
            <Link href={`/gym/social/publicar?sessao=${session.id}`} className={s.secondary}>
              <Camera size={18} /> Publicar no feed
            </Link>
            <button type="button" className={s.secondary} onClick={startEditing}>
              <Pencil size={18} /> Editar treino
            </button>
            <button type="button" className={s.danger} onClick={remove}>
              <Trash2 size={18} /> Excluir do histórico
            </button>
          </div>
        </>
      )}
      {sheet}
      <GymSheet open={gymOpen} onClose={closeGym} title="Academia deste treino">
        {session && (
          <div className={s.actions}>
            {gyms.map(gym => (
              <button
                key={gym.id}
                type="button"
                className={s.option}
                onClick={() => changeGym(gym)}
                aria-pressed={gym.id === session.gym_id}
              >
                {gym.id === session.gym_id ? <Check size={20} /> : <Building2 size={20} />}
                <span>{gym.name}</span>
              </button>
            ))}
            <p className={styles.gymHint}>Máquinas e polias deste treino passam a contar para a carga anterior e os recordes da academia escolhida.</p>
          </div>
        )}
      </GymSheet>
      <GymSheet
        open={!!editSheet}
        onClose={() => setEditPanel(null)}
        title={{ menu: editSheet?.item?.exercise_name, swap: 'Trocar exercício', order: 'Ordem dos exercícios' }[editSheet?.type] ?? ''}
      >
        {editSheet?.type === 'menu' && (
          <div className={s.actions}>
            {siblings.length > 1 && (
              <div className={s.option} role="group" aria-label={variantTitle(siblings)}>
                <Dumbbell size={20} />
                <span>
                  {variantTitle(siblings)}
                  <small>{variantHint(siblings)}</small>
                  <VariantChoices
                    spaced
                    variants={siblings}
                    current={siblings.find(variant => variant.id === editSheet.item.exercise_id)}
                    isDisabled={option => option.variant.id === editSheet.item.exercise_id || !sameTracking(editSheet.item, option.variant)}
                    onSelect={variant => swapExercise(editSheet.item, [variant])}
                    chipClassName={styles.equipmentChoice}
                    activeClassName={styles.equipmentChoiceOn}
                  />
                </span>
              </div>
            )}
            <button type="button" className={s.option} onClick={() => setEditPanel({ type: 'swap', item: editSheet.item })}>
              <Repeat size={20} />
              <span>Trocar exercício<small>{editSheet.item.sets.length ? 'As séries registradas continuam' : 'Escolha outro da biblioteca'}</small></span>
            </button>
            <button type="button" className={`${s.option} ${s.optionDanger}`} onClick={() => removeItem(editSheet.item)}>
              <Trash2 size={20} />
              <span>Remover deste treino<small>As séries dele saem do histórico</small></span>
            </button>
          </div>
        )}

        {editSheet?.type === 'swap' && (
          <ExercisePicker
            single
            exercises={editSheet.item.sets.length ? exercises?.filter(exercise => sameTracking(editSheet.item, exercise)) : exercises}
            loadError={exercisesError}
            onRetry={loadExercises}
            onConfirm={selected => swapExercise(editSheet.item, selected)}
          />
        )}

        {editSheet?.type === 'order' && (
          <div className={s.stack}>
            <p className={s.text}>Arraste para mudar a ordem.</p>
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
                            {item.sets.length ? ` · ${plural(item.sets.length, 'série', 'séries')}` : ''}
                          </span>
                        </span>
                      </li>
                    )}
                  </SortableItem>
                ))}
              </ol>
            </SortableList>
            <button type="button" className={s.primary} onClick={() => setEditPanel(null)}>Pronto</button>
          </div>
        )}
      </GymSheet>
    </div>
  );
}
