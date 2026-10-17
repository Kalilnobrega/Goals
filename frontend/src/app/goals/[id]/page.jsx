'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import Modal from '../../../components/Modal';
import GoalForm from '../../../components/GoalForm';
import TaskItem from '../../../components/TaskItem';
import NumericGoalChart from '../../../components/NumericGoalChart';
import GoalForecast from '../../../components/GoalForecast';
import CycleChart, { buildCycleBars } from '../../../components/CycleChart';
import GroupPanel from '../../../components/GroupPanel';
import ShareGoalForm from '../../../components/ShareGoalForm';
import { SortableList, SortableItem, moveSubset } from '../../../components/Sortable';
import {
  getGoal, updateGoal, deleteGoal,
  getTasks, createTask, updateTask, deleteTask, toggleTask, getStreak, reorderTasks,
  getGoalCycles, getGoalEntries, addGoalEntry, deleteGoalEntry, getGoalProgress,
  getGroup, createGroup
} from '../../../lib/api';
import { deleteGoalConfirm } from '../../../lib/sharing';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useLateGoals } from '../../../lib/LateGoalsContext';
import { formatDeadline, formatDateTime, WEEKDAYS, cycleNotStarted } from '../../../lib/date';
import { formatValue, formatProgressValue } from '../../../lib/numeric';
import { celebrateGoal } from '../../../lib/celebrate';
import {
  ArrowLeft, Plus, Pencil, Trash2,
  CheckCircle2, Circle, ListTodo, Calendar,
  Target, RefreshCw, XCircle, History, TrendingUp, ArrowRight, Share2, Eye
} from 'lucide-react';import f from '../../../styles/forms.module.css';
import styles from './page.module.css';

// GoalStatus do backend: 'open' | 'completed' | 'paused' | 'late'
const ENTRIES_PREVIEW = 5;

const STATUS_META = {
  open:      { label: 'Em aberto',  color: '#3b82f6', banner: '#1d4ed8' },
  completed: { label: 'Concluída',  color: '#10b981', banner: '#059669' },
  late:      { label: 'Atrasada',   color: '#ef4444', banner: '#d97706' },
};

function consistencyClass(value) {
  if (value >= 70) return styles.consistencyGood;
  if (value >= 40) return styles.consistencyMid;
  return styles.consistencyLow;
}

export default function GoalDetailPage() {
  const { id } = useParams();
  const router  = useRouter();
  const confirmAction = useConfirm();

  const { setStreak } = useLateGoals();

  const [goal,       setGoal]       = useState(null);
  const [tasks,      setTasks]      = useState([]);
  const [cycles,     setCycles]     = useState([]);
  const [entries,    setEntries]    = useState([]);
  const [progressData, setProgressData] = useState(null);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [entryValue, setEntryValue] = useState('');
  const [entryNote,  setEntryNote]  = useState('');
  const [addingEntry, setAddingEntry] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [editModal,  setEditModal]  = useState(false);
  const [taskModal,  setTaskModal]  = useState(false);
  const [editTask,   setEditTask]   = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [newTask,      setNewTask]      = useState('');
  const [addingTask,   setAddingTask]   = useState(false);
  const [error,      setError]      = useState('');
  const [group,      setGroup]      = useState(null);
  const [shareModal, setShareModal] = useState(false);

  const loadGroup = (current) => {
    if (!current?.group_id) {
      setGroup(null);
      return Promise.resolve();
    }
    return getGroup(current.group_id).then(setGroup).catch(() => setGroup(null));
  };
  // GET /goals/{id}
  const loadGoal  = () => getGoal(Number(id)).then(g => { setGoal(g); return loadGroup(g); });
  // GET /tasks/goal/{goal_id}
  const loadTasks = () => getTasks(Number(id)).then(setTasks);
  const loadCycles = () => getGoalCycles(Number(id)).then(setCycles).catch(() => {});
  const loadEntries = () => getGoalEntries(Number(id)).then(setEntries).catch(() => {});
  const loadProgress = (current) => {
    if (!current?.is_numeric || current.is_recurring) {
      setProgressData(null);
      return Promise.resolve();
    }
    return getGoalProgress(Number(id)).then(setProgressData).catch(() => setProgressData(null));
  };

  useEffect(() => {
    Promise.all([
      getGoal(Number(id)).then(g => { setGoal(g); return Promise.all([loadProgress(g), loadGroup(g)]); }),
      loadTasks(), loadCycles(), loadEntries(),
    ])
      .catch(() => setError('Erro ao carregar dados.'))
      .finally(() => setLoading(false));
  }, [id]);

  // PUT /goals/{id}
  const handleUpdateGoal = async (data) => {
    setSaving(true);
    try {
      await updateGoal(id, { ...data, id: Number(id) });
      const [updatedGoal] = await Promise.all([getGoal(Number(id)), loadCycles()]);
      setGoal(updatedGoal);
      await Promise.all([loadProgress(updatedGoal), loadGroup(updatedGoal)]);
      setEditModal(false);
    } catch { setError('Erro ao atualizar meta.'); }
    finally { setSaving(false); }
  };

  const handleDeleteGoal = async () => {
    if (!(await confirmAction(deleteGoalConfirm(goal)))) return;
    try { await deleteGoal(id); router.push('/goals'); }
    catch { setError('Erro ao excluir meta.'); }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    setAddingTask(true);
    try {
      await createTask(Number(id), { title: newTask.trim(), is_recurring: false });
      setNewTask('');
      await Promise.all([loadTasks(), loadGoal()]);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erro ao criar tarefa.');
    } finally { setAddingTask(false); }
  };

  // Toggle: PUT /tasks/{id}
  const handleToggleTask = async (taskId) => {
    try {
      const prevProgress = goal?.progress ?? 0;
      await toggleTask(taskId);
      const [, updatedGoal] = await Promise.all([loadTasks(), getGoal(Number(id)), loadCycles()]);
      setGoal(updatedGoal);
      loadGroup(updatedGoal);
      if (prevProgress < 100 && updatedGoal.progress >= 100) celebrateGoal();
      getStreak().then(s => setStreak(s.current_streak ?? 0)).catch(() => {});
    } catch (err) { setError(err?.response?.data?.detail || 'Erro ao atualizar tarefa.'); }
  };

  const refreshAfterEntryChange = async () => {
    const prevProgress = goal?.progress ?? 0;
    const [updatedGoal] = await Promise.all([getGoal(Number(id)), loadEntries(), loadCycles()]);
    setGoal(updatedGoal);
    await Promise.all([loadProgress(updatedGoal), loadGroup(updatedGoal)]);
    if (prevProgress < 100 && updatedGoal.progress >= 100) celebrateGoal();
    getStreak().then(s => setStreak(s.current_streak ?? 0)).catch(() => {});
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (entryValue === '') return;
    setAddingEntry(true);
    try {
      await addGoalEntry(Number(id), { value: Number(entryValue), note: entryNote.trim() || null });
      setEntryValue('');
      setEntryNote('');
      await refreshAfterEntryChange();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erro ao registrar valor.');
    } finally { setAddingEntry(false); }
  };

  const handleDeleteEntry = async (entryId) => {
    const confirmed = await confirmAction({
      title: 'Excluir registro',
      message: 'O registro sai do histórico e o progresso da meta é recalculado.',
      confirmLabel: 'Excluir',
    });
    if (!confirmed) return;
    try {
      await deleteGoalEntry(Number(id), entryId);
      await refreshAfterEntryChange();
    } catch { setError('Erro ao excluir registro.'); }
  };

  // DELETE /tasks/{id}
  const handleDeleteTask = async (taskId) => {
    try {
      await deleteTask(taskId);
      await Promise.all([loadTasks(), loadGoal()]);
    } catch { setError('Erro ao excluir tarefa.'); }
  };

  const handleReorderTasks = async (ids) => {
    setTasks(prev => moveSubset(prev, ids));
    try {
      await reorderTasks(Number(id), ids);
    } catch {
      setError('Erro ao salvar a nova ordem.');
      loadTasks();
    }
  };

  const handleShare = async (kind) => {
    setSaving(true);
    try {
      setGroup(await createGroup(id, kind));
      setGoal(await getGoal(Number(id)));
      setShareModal(false);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erro ao compartilhar meta.');
    } finally { setSaving(false); }
  };

  const handleGroupChange = async (updated) => {
    const updatedGoal = await getGoal(Number(id)).catch(() => null);
    if (!updatedGoal) { router.push('/goals'); return; }
    setGoal(updatedGoal);
    if (updated) setGroup(updated);
    else await loadGroup(updatedGoal);
  };

  const handleLeftGroup = async () => {
    if (group?.kind === 'challenge' && group.goal_id !== Number(id)) {
      router.push(`/goals/${group.goal_id}`);
      return;
    }
    if (group?.kind === 'challenge') {
      await handleGroupChange(null);
      return;
    }
    router.push('/goals');
  };

  const taskItemProps = (t) => ({
    task: t,
    onToggle: handleToggleTask,
    onDelete: handleDeleteTask,
    onEdit: openEditTask,
    canAct: goal.can_act,
    canEdit: goal.can_edit,
    showAuthor: goal.group_kind === 'collaborative',
  });

  const renderTaskGroup = (items) => goal.can_edit ? (
    <SortableList ids={items.map(t => t.id)} onReorder={handleReorderTasks}>
      <ul className={styles.taskList}>
        {items.map(t => (
          <SortableItem key={t.id} id={t.id}>
            {(sortable) => <TaskItem {...taskItemProps(t)} sortable={sortable} />}
          </SortableItem>
        ))}
      </ul>
    </SortableList>
  ) : (
    <ul className={styles.taskList}>
      {items.map(t => <TaskItem key={t.id} {...taskItemProps(t)} />)}
    </ul>
  );

  const openEditTask = (task) => {
    setEditTask({ ...task, repeat_mode: task.recurrence_weekdays?.length ? 'weekdays' : 'interval' });
    setTaskModal(true);
  };

  // PUT /tasks/{id} com EditTaskschema
  const handleEditTask = async (data) => {
    setSaving(true);
    try {
      await updateTask(editTask.id, data);
      setEditTask(null);
      setTaskModal(false);
      await Promise.all([loadTasks(), loadGoal()]);
    } catch { setError('Erro ao editar tarefa.'); }
    finally { setSaving(false); }
  };

  // progress vem do @property serializado pelo GoalResponseSchema
  const progress = typeof goal?.progress === 'number' ? Math.round(goal.progress) : 0;
  const meta     = goal ? (STATUS_META[goal.status] || STATUS_META.open) : null;

  // Separa pendentes / concluídas / hábitos
  const pending   = tasks.filter(t => t.status === false);
  const completed = tasks.filter(t => t.status === true);
  const habits    = tasks.filter(t => t.is_recurring);

  const cycleBars = goal ? buildCycleBars(goal, cycles) : [];
  const visibleEntries = showAllEntries ? entries : entries.slice(0, ENTRIES_PREVIEW);

  const cyclesCompleted = cycles.filter(c => c.completed).length;
  const consistency = cycles.length > 0 ? Math.round((cyclesCompleted / cycles.length) * 100) : null;

  if (loading) return (
    <>
      <Navbar />
      <main className={styles.main}>
        <div className={`${styles.skeleton} ${styles.skeletonHeader} glass`} />
        <div className={`${styles.skeleton} ${styles.skeletonBody} glass`} />
      </main>
    </>
  );

  if (!goal) return (
    <>
      <Navbar />
      <main className={styles.main}>
        <div className={`${styles.notFound} glass`}>
          <Target size={40} />
          <p>Meta não encontrada.</p>
          <button className={styles.backBtn} onClick={() => router.push('/goals')}>
            <ArrowLeft size={15} /> Voltar
          </button>
        </div>
      </main>
    </>
  );

  return (
    <>
      <Navbar />
      <main className={styles.main}>

        <button className={styles.backLink} onClick={() => router.push('/goals')}>
          <ArrowLeft size={16} /> Todas as metas
        </button>

        {error && <p className={styles.error}>{error}</p>}

        {goal.group_kind === 'challenge' && !goal.is_mine && (
          <div className={`${styles.viewingBanner} glass`}>
            <Eye size={16} />
            <span>Você está vendo o progresso de <strong>{goal.owner_name}</strong>.</span>
            {group?.goal_id && (
              <Link href={`/goals/${group.goal_id}`} className={styles.viewingLink}>
                Ver a minha <ArrowRight size={13} />
              </Link>
            )}
          </div>
        )}

        {/* Goal header card */}
        <div className={`${styles.goalCard} glass`}>
          {/* Faixa colorida no topo baseada no status */}
          <div
            className={styles.goalBanner}
            style={{ '--banner-a': meta.color, '--banner-b': meta.banner }}
          />
          <div className={styles.goalCardBody}>
            <div className={styles.goalTop}>
              <div className={styles.statusBadge} style={{ '--badge-color': meta.color }}>
                <span className={styles.badgeDot} />
                {meta.label}
              </div>
              <div className={styles.goalActions}>
                {goal.status !== 'completed' && goal.can_complete && (
                  <button
                    className={styles.btnComplete}
                    onClick={async () => {
                      try {
                        await updateGoal(id, { status: 'completed' });
                        await loadGoal();
                        celebrateGoal();
                      }
                      catch { setError('Erro ao concluir meta.'); }
                    }}
                    title="Marcar como concluída"
                  >
                    <CheckCircle2 size={15} />
                  </button>
                )}
                {!goal.group_id && goal.can_edit && (
                  <button className={styles.iconBtn} onClick={() => setShareModal(true)} title="Compartilhar" aria-label="Compartilhar">
                    <Share2 size={15} />
                  </button>
                )}
                {goal.can_edit && (
                  <button className={styles.iconBtn} onClick={() => setEditModal(true)} title="Editar" aria-label="Editar">
                    <Pencil size={15} />
                  </button>
                )}
                {goal.can_delete && (
                  <button className={`${styles.iconBtn} ${styles.danger}`} onClick={handleDeleteGoal} title="Excluir" aria-label="Excluir">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            <h1 className={styles.goalTitle}>{goal.title}</h1>
            {goal.description && <p className={styles.goalDesc}>{goal.description}</p>}

            <div className={styles.goalMeta}>
              {goal.deadline && (
                <span className={styles.metaChip}>
                  <Calendar size={13} />
                  {formatDeadline(goal.deadline)}
                </span>
              )}
              <span className={styles.metaChip}>
                <ListTodo size={13} />
                {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''}
              </span>
              {habits.length > 0 && (
                <span className={`${styles.metaChip} ${styles.metaChipHabit}`}>
                  <RefreshCw size={13} />
                  {habits.length} hábito{habits.length !== 1 ? 's' : ''}
                </span>
              )}
              {goal.is_numeric && !goal.is_recurring && (
                <span className={styles.metaChip}>
                  <Target size={13} />
                  {formatProgressValue(goal)}
                </span>
              )}
              {goal.is_recurring && (
                <span className={`${styles.metaChip} ${styles.metaChipHabit}`}>
                  <RefreshCw size={13} />
                  {cycleNotStarted(goal) ? (
                    `Ciclo começa em ${formatDeadline(goal.cycle_start_date)}`
                  ) : (
                    <>
                      {goal.is_numeric
                        ? formatProgressValue(goal)
                        : `${goal.current_cycle_progress ?? 0}/${goal.recurrence_target ?? 1}`} neste ciclo
                      {goal.cycle_ends_at && ` · reseta ${formatDeadline(goal.cycle_ends_at)}`}
                    </>
                  )}
                </span>
              )}
            </div>

            <div className={styles.progressWrap}>
              <div className={styles.progressInfo}>
                <span className={styles.progressLabel}>Progresso geral</span>
                <span className={`${styles.progressPct} ${progress >= 100 ? styles.progressPctComplete : ''}`}>{progress}%</span>
              </div>
              <div className={styles.progressTrack}>
                <div className={`${styles.progressFill} ${progress >= 100 ? styles.progressFillComplete : ''}`} style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>

        {group && (
          <GroupPanel
            group={group}
            goalId={goal.id}
            onChange={handleGroupChange}
            onLeft={handleLeftGroup}
          />
        )}

        {goal.is_numeric && goal.can_act && (
          <div className={styles.tasksSection}>
            <div className={styles.taskHeader}>
              <Plus size={16} />
              <h2 className={styles.taskTitle}>Registrar progresso</h2>
            </div>

            <form className={`${styles.addTask} glass`} onSubmit={handleAddEntry}>
              <input
                type="number"
                step="any"
                className={`${styles.taskInput} ${styles.valueInput}`}
                placeholder={goal.numeric_mode === 'latest'
                  ? `Valor atual${goal.unit ? ` (${goal.unit})` : ''}`
                  : `Quanto somar${goal.unit ? ` (${goal.unit})` : ''}`}
                value={entryValue}
                onChange={e => setEntryValue(e.target.value)}
                disabled={addingEntry}
                required
              />
              <input
                className={styles.taskInput}
                placeholder="Observação (opcional)"
                maxLength={100}
                value={entryNote}
                onChange={e => setEntryNote(e.target.value)}
                disabled={addingEntry}
              />
              <button type="submit" className={styles.addBtn} disabled={addingEntry || entryValue === ''}>
                <Plus size={18} />
              </button>
            </form>
          </div>
        )}

        {progressData && (
          <div className={styles.tasksSection}>
            <div className={styles.taskHeader}>
              <TrendingUp size={16} />
              <h2 className={styles.taskTitle}>Evolução</h2>
              <Link href="/stats" className={styles.seeStats}>
                Ver todas as estatísticas <ArrowRight size={14} />
              </Link>
            </div>
            <div className={`${styles.chartCard} glass`}>
              {progressData.points.length > 1 ? (
                <NumericGoalChart goal={progressData} />
              ) : (
                <p className={styles.chartEmpty}>Adicione registros para ver o gráfico.</p>
              )}
              <GoalForecast goal={progressData} />
            </div>
          </div>
        )}

        {cycleBars.length > 0 && (
          <div className={styles.tasksSection}>
            <div className={styles.taskHeader}>
              <RefreshCw size={16} />
              <h2 className={styles.taskTitle}>Ciclos</h2>
              {consistency !== null && (
                <span className={`${styles.taskCount} ${styles.consistency} ${consistencyClass(consistency)}`}>
                  {consistency}% consistência
                </span>
              )}
              <Link href="/stats" className={styles.seeStats}>
                Ver todas as estatísticas <ArrowRight size={14} />
              </Link>
            </div>
            <div className={`${styles.chartCard} glass`}>
              <CycleChart goal={goal} bars={cycleBars} />
            </div>
          </div>
        )}

        {goal.is_numeric && (
          <div className={styles.tasksSection}>
            <div className={styles.taskHeader}>
              <Target size={16} />
              <h2 className={styles.taskTitle}>Registros</h2>
              <span className={styles.taskCount}>{entries.length}</span>
            </div>

            {entries.length === 0 ? (
              <div className={`${styles.emptyTasks} glass`}>
                <Target size={24} />
                <p>Nenhum registro ainda. Adicione o primeiro acima!</p>
              </div>
            ) : (
              <ul className={styles.taskList}>
                {visibleEntries.map(entry => (
                  <li key={entry.id} className={`${styles.listItem} glass`}>
                    <span className={styles.entryText}>
                      <strong className={styles.entryValue}>
                        {goal.numeric_mode === 'sum' && entry.value > 0 ? '+' : ''}
                        {formatValue(entry.value, goal.unit)}
                      </strong>
                      {entry.note && <span className={styles.entryNote}>{entry.note}</span>}
                      {goal.group_kind === 'collaborative' && entry.user_name && (
                        <span className={styles.entryAuthor}>por {entry.user_name}</span>
                      )}
                    </span>
                    <span className={styles.listItemSide}>
                      <span className={styles.entryDate}>{formatDateTime(entry.created_at)}</span>
                      {entry.can_delete && (
                        <button
                          className={`${styles.iconBtn} ${styles.danger}`}
                          onClick={() => handleDeleteEntry(entry.id)}
                          aria-label="Excluir registro"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {entries.length > ENTRIES_PREVIEW && (
              <button type="button" className={styles.showMore} onClick={() => setShowAllEntries(v => !v)}>
                {showAllEntries ? 'Mostrar menos' : `Ver todos os ${entries.length} registros`}
              </button>
            )}
          </div>
        )}

        {(goal.is_recurring || cycles.length > 0) && (
          <div className={styles.tasksSection}>
            <div className={styles.taskHeader}>
              <History size={16} />
              <h2 className={styles.taskTitle}>Histórico de ciclos</h2>
              <span className={styles.taskCount}>{cycles.length}</span>
            </div>

            {cycles.length === 0 ? (
              <div className={`${styles.emptyTasks} glass`}>
                <RefreshCw size={24} />
                <p>Nenhum ciclo fechado ainda.</p>
              </div>
            ) : (
              <ul className={styles.taskList}>
                {cycles.map(c => (
                  <li key={c.id} className={`${styles.listItem} glass`}>
                    <span className={styles.cycleRange}>
                      {c.completed
                        ? <CheckCircle2 size={16} className={styles.cycleDone} />
                        : <XCircle size={16} className={styles.cycleMissed} />}
                      {formatDeadline(c.cycle_start)} – {formatDeadline(c.cycle_end)}
                    </span>
                    <span className={`${styles.cycleScore} ${c.completed ? styles.cycleDone : styles.cycleMissed}`}>
                      {c.achieved_value !== null && c.achieved_value !== undefined
                        ? `${formatValue(c.achieved_value)}/${formatValue(c.target_value, goal.unit)}`
                        : `${c.achieved_count}/${c.target_count}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Tasks */}
        <div className={styles.tasksSection}>
          <div className={styles.taskHeader}>
            <h2 className={styles.taskTitle}>Tarefas</h2>
            <span className={styles.taskCount}>{tasks.length}</span>
          </div>

          {goal.can_edit && (
            <form className={`${styles.addTask} glass`} onSubmit={handleAddTask}>
              <input
                className={styles.taskInput}
                placeholder="Nova tarefa... (Enter para adicionar)"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                disabled={addingTask}
              />
              <button type="submit" className={styles.addBtn} disabled={addingTask || !newTask.trim()}>
                <Plus size={18} />
              </button>
            </form>
          )}

          {tasks.length === 0 ? (
            <div className={`${styles.emptyTasks} glass`}>
              <CheckCircle2 size={28} />
              <p>{goal.can_edit ? 'Nenhuma tarefa ainda. Adicione acima!' : 'Nenhuma tarefa ainda.'}</p>
            </div>
          ) : (
            <div className={styles.taskGroups}>
              {pending.length > 0 && (
                <div className={styles.taskGroup}>
                  <div className={styles.groupLabel}>
                    <Circle size={13} /> Pendentes ({pending.length})
                  </div>
                  {renderTaskGroup(pending)}
                </div>
              )}
              {completed.length > 0 && (
                <div className={styles.taskGroup}>
                  <div className={`${styles.groupLabel} ${styles.groupLabelDone}`}>
                    <CheckCircle2 size={13} /> Concluídas ({completed.length})
                  </div>
                  {renderTaskGroup(completed)}
                </div>
              )}
            </div>
          )}
        </div>

        <Modal open={shareModal} onClose={() => setShareModal(false)} title="Compartilhar meta">
          <ShareGoalForm
            onSubmit={handleShare}
            onCancel={() => setShareModal(false)}
            loading={saving}
          />
        </Modal>

        {/* Edit goal modal */}
        <Modal open={editModal} onClose={() => setEditModal(false)} title="Editar meta">
          <GoalForm
            initial={goal}
            onSubmit={handleUpdateGoal}
            onCancel={() => setEditModal(false)}
            loading={saving}
          />
        </Modal>

        {/* Edit task modal */}
        <Modal open={taskModal} onClose={() => { setTaskModal(false); setEditTask(null); }} title="Editar tarefa">
          <form
            className={f.form}
            onSubmit={(e) => {
              e.preventDefault();
              handleEditTask({
                title:                    editTask?.title,
                is_recurring:             editTask?.is_recurring ?? false,
                recurrence_interval_days: editTask?.recurrence_interval_days || null,
                recurrence_weekdays:      editTask?.repeat_mode === 'weekdays' ? editTask.recurrence_weekdays : [],
                end_of_goal:              editTask?.end_of_goal ?? false,
                max_recurrences:          editTask?.end_of_goal ? null : (editTask?.max_recurrences || null),
              });
            }}
          >
            <div className={f.field}>
              <label className={f.label}>Título</label>
              <input
                className={f.input}
                value={editTask?.title || ''}
                onChange={e => setEditTask(t => ({ ...t, title: e.target.value }))}
                required
              />
            </div>

            <div className={f.field}>
              <label className={`${f.label} ${f.checkLabel}`}>
                <input
                  type="checkbox"
                  checked={editTask?.is_recurring ?? false}
                  onChange={e => setEditTask(t => ({ ...t, is_recurring: e.target.checked, end_of_goal: false }))}
                />
                É um hábito recorrente?
              </label>
            </div>

            {editTask?.is_recurring && (
              <>
                <div className={f.field}>
                  <label className={f.label}>Repetir</label>
                  <div className={f.optionRow}>
                    <label className={`${f.endOption} ${editTask?.repeat_mode !== 'weekdays' ? f.endOptionActive : ''}`}>
                      <input
                        type="radio"
                        name="edit_repeat_mode"
                        checked={editTask?.repeat_mode !== 'weekdays'}
                        onChange={() => setEditTask(t => ({ ...t, repeat_mode: 'interval' }))}
                      />
                      A cada N dias
                    </label>
                    <label className={`${f.endOption} ${editTask?.repeat_mode === 'weekdays' ? f.endOptionActive : ''}`}>
                      <input
                        type="radio"
                        name="edit_repeat_mode"
                        checked={editTask?.repeat_mode === 'weekdays'}
                        onChange={() => setEditTask(t => ({ ...t, repeat_mode: 'weekdays', recurrence_weekdays: t.recurrence_weekdays || [] }))}
                      />
                      Dias da semana
                    </label>
                  </div>
                </div>

                {editTask?.repeat_mode === 'weekdays' ? (
                  <div className={f.field}>
                    <label className={f.label}>Quais dias</label>
                    <div className={`${f.optionRow} ${f.optionRowTight}`}>
                      {WEEKDAYS.map(day => {
                        const selected = editTask.recurrence_weekdays?.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            className={`${f.endOption} ${f.dayOption} ${selected ? f.endOptionActive : ''}`}
                            aria-pressed={selected}
                            onClick={() => setEditTask(t => ({
                              ...t,
                              recurrence_weekdays: selected
                                ? t.recurrence_weekdays.filter(d => d !== day.value)
                                : [...(t.recurrence_weekdays || []), day.value].sort(),
                            }))}
                          >
                            {day.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className={f.field}>
                    <label className={f.label}>Repetir a cada (dias)</label>
                    <input
                      type="number"
                      min="1"
                      className={f.input}
                      placeholder="Ex: 1 = todo dia"
                      value={editTask?.recurrence_interval_days || ''}
                      onChange={e => setEditTask(t => ({ ...t, recurrence_interval_days: e.target.value ? Number(e.target.value) : null }))}
                    />
                  </div>
                )}

                <div className={f.field}>
                  <label className={f.label}>Até quando</label>
                  <div className={f.optionRow}>
                    <label className={`${f.endOption} ${editTask?.end_of_goal ? f.endOptionActive : ''}`}>
                      <input
                        type="radio"
                        name="edit_end_type"
                        checked={editTask?.end_of_goal ?? false}
                        onChange={() => setEditTask(t => ({ ...t, end_of_goal: true, max_recurrences: null }))}
                      />
                      Até a meta terminar
                    </label>
                    <label className={`${f.endOption} ${!editTask?.end_of_goal ? f.endOptionActive : ''}`}>
                      <input
                        type="radio"
                        name="edit_end_type"
                        checked={!editTask?.end_of_goal}
                        onChange={() => setEditTask(t => ({ ...t, end_of_goal: false }))}
                      />
                      Quantidade de vezes
                    </label>
                  </div>
                </div>

                {!editTask?.end_of_goal && (
                  <div className={f.field}>
                    <label className={f.label}>Quantas vezes</label>
                    <input
                      type="number"
                      min="1"
                      className={f.input}
                      placeholder="Ex: 30 (opcional)"
                      value={editTask?.max_recurrences || ''}
                      onChange={e => setEditTask(t => ({ ...t, max_recurrences: e.target.value ? Number(e.target.value) : null }))}
                    />
                  </div>
                )}
              </>
            )}

            <div className={f.submitRow}>
              <button type="button" className={f.btnCancel} onClick={() => { setTaskModal(false); setEditTask(null); }}>
                Cancelar
              </button>
              <button
                type="submit"
                className={f.btnSubmit}
                disabled={saving || (editTask?.is_recurring && editTask?.repeat_mode === 'weekdays' && !editTask?.recurrence_weekdays?.length)}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      </main>
    </>
  );
}