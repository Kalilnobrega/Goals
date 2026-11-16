'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Plus, MoreHorizontal, Repeat, Trash2, Flag, Play, Dumbbell, Trophy } from 'lucide-react';
import {
  getSession, getExercises, peekCache, finishSession, deleteSession, addSessionExercise,
  updateSessionExercise, removeSessionExercise, addSet, updateSet, deleteSet,
} from '../../../../lib/api';
import {
  apiError, formatClock, formatDuration, formatLongDate, formatRest, formatTime, formatVolume,
  plural, REST_OPTIONS, FORGOTTEN_AFTER_MS,
} from '../../../../lib/gym';
import { startRestTimer, stopRestTimer, getRestTimer } from '../../../../lib/restTimer';
import { useToast } from '../../../../components/Toast';
import { useConfirm } from '../../../../components/ConfirmDialog';
import GymSheet from '../../../../components/gym/GymSheet';
import ExercisePicker from '../../../../components/gym/ExercisePicker';
import SessionExerciseCard from '../../../../components/gym/SessionExerciseCard';
import SessionSummary from '../../../../components/gym/SessionSummary';
import RestTimer from '../../../../components/gym/RestTimer';
import useNow from '../../../../components/gym/useNow';
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

  const loaded = useCallback((data) => {
    setSession(data);
    setStatus('ready');
    if (data.status === 'in_progress' && Date.now() - new Date(data.last_activity_at).getTime() > FORGOTTEN_AFTER_MS) {
      setSheet({ type: 'forgotten' });
    }
  }, []);

  const failed = useCallback((err) => setStatus(err?.response?.status === 404 ? 'missing' : 'error'), []);

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

  const logSet = async (item, data) => {
    try {
      const entry = await addSet(item.id, data);
      setSession(current => withItem(current, item.id, it => ({ ...it, sets: [...it.sets, entry] })));
      return true;
    } catch (err) {
      return fail(err, 'Não foi possível salvar a série. Tente de novo.');
    }
  };

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

  const removeSet = async (item, entry) => {
    try {
      await deleteSet(entry.id);
      setSession(current => withItem(current, item.id, it => ({
        ...it,
        sets: it.sets.filter(e => e.id !== entry.id).map((e, i) => ({ ...e, position: i + 1 })),
      })));
      return true;
    } catch (err) {
      return fail(err, 'Não foi possível excluir a série.');
    }
  };

  const changeRest = async (item, seconds) => {
    setSheet(null);
    try {
      setSession(await updateSessionExercise(item.id, { rest_seconds: seconds }));
    } catch (err) {
      fail(err, 'Não foi possível salvar o descanso.');
    }
  };

  const startRest = (item) => startRestTimer(item.rest_seconds, item.exercise_name, session.id);

  const addExercises = async (selected) => {
    setSheet(null);
    try {
      let latest = session;
      for (const exercise of selected) latest = await addSessionExercise(session.id, exercise.id);
      setSession(latest);
    } catch (err) {
      fail(err, 'Não foi possível adicionar o exercício.');
      load();
    }
  };

  const swapExercise = async (item, [exercise]) => {
    setSheet(null);
    try {
      setSession(await updateSessionExercise(item.id, { exercise_id: exercise.id }));
    } catch (err) {
      fail(err, 'Não foi possível trocar o exercício.');
    }
  };

  const removeExercise = async (item) => {
    setSheet(null);
    if (item.sets.length) {
      const ok = await confirmAction({
        title: 'Remover exercício',
        message: [<><strong>{item.exercise_name}</strong> sai deste treino junto com {plural(item.sets.length, 'série registrada', 'séries registradas')}.</>],
        confirmLabel: 'Remover',
      });
      if (!ok) return;
    }
    try {
      setSession(await removeSessionExercise(item.id));
    } catch (err) {
      fail(err, 'Não foi possível remover o exercício.');
    }
  };

  const finish = async (completedAt) => {
    setBusy(true);
    try {
      const data = await finishSession(session.id, completedAt);
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
      if (getRestTimer()?.sessionId === session.id) stopRestTimer();
      toast('Treino descartado');
      router.push('/gym/workouts');
    } catch (err) {
      fail(err, 'Não foi possível descartar o treino.');
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
      <div className={styles.page}>
        <header className={styles.doneHeader}>
          <span className={styles.trophy}><Trophy size={26} /></span>
          <p className={styles.kicker}>Treino concluído</p>
          <h1 className={styles.title}>{session.name}</h1>
        </header>
        <SessionSummary session={session} />
        <div className={s.actions}>
          <Link href="/gym" className={s.primary}>Voltar ao início</Link>
          <Link href="/gym/workouts" className={s.secondary}>Ver fichas</Link>
        </div>
      </div>
    );
  }

  const { sets: totalSets, volume } = totals(session);
  const elapsed = now ? (now - new Date(session.started_at).getTime()) / 1000 : null;
  const lastAt = lastActivity(session);
  const pending = session.exercises.filter(item => item.sets.length === 0).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.live}><span className={styles.dot} aria-hidden="true" /> Em andamento</span>
          <button type="button" className={styles.more} onClick={() => setSheet({ type: 'options' })} aria-label="Mais opções">
            <MoreHorizontal size={20} />
          </button>
        </div>
        <h1 className={styles.title}>{session.name}</h1>
        <div className={styles.headerStats}>
          <span className={styles.clock}>{elapsed === null ? '—' : formatClock(elapsed)}</span>
          <span className={styles.headerMeta}>
            {plural(totalSets, 'série', 'séries')} · {formatVolume(volume)}
          </span>
        </div>
      </header>

      {session.exercises.length === 0 ? (
        <button type="button" className={styles.empty} onClick={() => openPicker('add')}>
          <Dumbbell size={30} aria-hidden="true" />
          <span className={styles.emptyTitle}>Treino livre</span>
          <span className={styles.emptyText}>Adicione o primeiro exercício para começar a registrar</span>
        </button>
      ) : (
        <div className={styles.cards}>
          {session.exercises.map((item, index) => (
            <SessionExerciseCard
              key={item.id}
              item={item}
              index={index}
              onLogSet={logSet}
              onEditSet={editSet}
              onDeleteSet={removeSet}
              onStartRest={startRest}
              onOpenRest={it => setSheet({ type: 'rest', item: it })}
              onOpenMenu={it => setSheet({ type: 'menu', item: it })}
            />
          ))}
        </div>
      )}

      {session.exercises.length > 0 && (
        <button type="button" className={styles.add} onClick={() => openPicker('add')}>
          <Plus size={18} strokeWidth={2.4} /> Adicionar exercício
        </button>
      )}

      <button type="button" className={styles.finish} onClick={() => setSheet({ type: 'finish' })}>
        <Flag size={18} /> Finalizar treino
      </button>

      <RestTimer />

      <GymSheet
        open={!!sheet}
        onClose={closeSheet}
        title={{
          add: 'Adicionar exercício',
          swap: 'Trocar exercício',
          menu: sheet?.item?.exercise_name,
          rest: 'Tempo de descanso',
          finish: 'Finalizar treino',
          forgotten: 'Esse treino ficou aberto',
          options: 'Treino',
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
            onConfirm={selected => swapExercise(sheet.item, selected)}
          />
        )}

        {sheet?.type === 'menu' && (
          <div className={s.actions}>
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

        {sheet?.type === 'options' && (
          <div className={s.actions}>
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
