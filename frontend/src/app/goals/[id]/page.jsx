'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Navbar from '../../../components/Navbar';
import Modal from '../../../components/Modal';
import GoalForm from '../../../components/GoalForm';
import TaskItem from '../../../components/TaskItem';
import {
  getGoal, updateGoal, deleteGoal,
  getTasks, createTask, updateTask, deleteTask, toggleTask
} from '../../../lib/api';
import {
  ArrowLeft, Plus, Pencil, Trash2,
  CheckCircle2, Circle, ListTodo, Calendar,
  Target, RefreshCw
} from 'lucide-react';import f from '../../../styles/forms.module.css';
import styles from './page.module.css';

// GoalStatus do backend: 'open' | 'completed' | 'paused' | 'late'
const STATUS_META = {
  open:      { label: 'Em aberto',  color: '#3b82f6' },
  completed: { label: 'Concluída',  color: '#10b981' },
  paused:    { label: 'Pausada',    color: '#f59e0b' },
  late:      { label: 'Atrasada',   color: '#ef4444' },
};

export default function GoalDetailPage() {
  const { id } = useParams();
  const router  = useRouter();

  const [goal,       setGoal]       = useState(null);
  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editModal,  setEditModal]  = useState(false);
  const [taskModal,  setTaskModal]  = useState(false);
  const [editTask,   setEditTask]   = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [newTask,      setNewTask]      = useState('');
  const [addingTask,   setAddingTask]   = useState(false);
  const [error,      setError]      = useState('');

  // GET /goals/{id}
  const loadGoal  = () => getGoal(Number(id)).then(setGoal);
  // GET /tasks/goal/{goal_id}
  const loadTasks = () => getTasks(Number(id)).then(setTasks);

  useEffect(() => {
    Promise.all([loadGoal(), loadTasks()])
      .catch(() => setError('Erro ao carregar dados.'))
      .finally(() => setLoading(false));
  }, [id]);

  // PUT /goals/{id}
  const handleUpdateGoal = async (data) => {
    setSaving(true);
    try {
      await updateGoal(id, { ...data, id: Number(id) });
      await loadGoal();
      setEditModal(false);
    } catch { setError('Erro ao atualizar meta.'); }
    finally { setSaving(false); }
  };

  const handleDeleteGoal = async () => {
    if (!confirm('Excluir esta meta permanentemente?')) return;
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
      await toggleTask(taskId);
      await Promise.all([loadTasks(), loadGoal()]);
    } catch { setError('Erro ao atualizar tarefa.'); }
  };

  // DELETE /tasks/{id}
  const handleDeleteTask = async (taskId) => {
    try {
      await deleteTask(taskId);
      await Promise.all([loadTasks(), loadGoal()]);
    } catch { setError('Erro ao excluir tarefa.'); }
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

  if (loading) return (
    <>
      <Navbar />
      <main className={styles.main}>
        <div className={`${styles.skeleton} glass`} style={{ height: 200 }} />
        <div className={`${styles.skeleton} glass`} style={{ height: 300 }} />
      </main>
    </>
  );

  if (!goal) return (
    <>
      <Navbar />
      <main className={styles.main}>
        <div className={`${styles.notFound} glass`}>
          <Target size={40} style={{ color: 'var(--b300)' }} />
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

        {/* Goal header card */}
        <div className={`${styles.goalCard} glass`}>
          {/* Faixa colorida no topo baseada no status */}
          <div
            className={styles.goalBanner}
            style={{
              '--banner-a': meta.color,
              '--banner-b': meta.color === '#3b82f6' ? '#1d4ed8' : meta.color === '#10b981' ? '#059669' : '#d97706',
            }}
          />
          <div className={styles.goalCardBody}>
            <div className={styles.goalTop}>
              <div className={styles.statusBadge} style={{ '--badge-color': meta.color }}>
                <span className={styles.badgeDot} />
                {meta.label}
              </div>
              <div className={styles.goalActions}>
                {goal.status !== 'completed' && (
                  <button
                    className={styles.btnComplete}
                    onClick={async () => {
                      try { await updateGoal(id, { ...goal, status: 'completed' }); await loadGoal(); }
                      catch { setError('Erro ao concluir meta.'); }
                    }}
                    title="Marcar como concluída"
                  >
                    <CheckCircle2 size={15} />
                  </button>
                )}
                <button className={styles.iconBtn} onClick={() => setEditModal(true)}>
                  <Pencil size={15} />
                </button>
                <button className={`${styles.iconBtn} ${styles.danger}`} onClick={handleDeleteGoal}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <h1 className={styles.goalTitle}>{goal.title}</h1>
            {goal.description && <p className={styles.goalDesc}>{goal.description}</p>}

            <div className={styles.goalMeta}>
              {goal.deadline && (
                <span className={styles.metaChip}>
                  <Calendar size={13} />
                  {new Date(goal.deadline).toLocaleDateString('pt-BR')}
                </span>
              )}
              <span className={styles.metaChip}>
                <ListTodo size={13} />
                {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''}
              </span>
              {habits.length > 0 && (
                <span className={styles.metaChip} style={{ color: '#8b5cf6', borderColor: 'rgba(139,92,246,.2)', background: 'rgba(139,92,246,.07)' }}>
                  <RefreshCw size={13} />
                  {habits.length} hábito{habits.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className={styles.progressWrap}>
              <div className={styles.progressInfo}>
                <span className={styles.progressLabel}>Progresso geral</span>
                <span className={styles.progressPct}>{progress}%</span>
              </div>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className={styles.tasksSection}>
          <div className={styles.taskHeader}>
            <h2 className={styles.taskTitle}>Tarefas</h2>
            <span className={styles.taskCount}>{tasks.length}</span>
          </div>

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

          {tasks.length === 0 ? (
            <div className={`${styles.emptyTasks} glass`}>
              <CheckCircle2 size={28} style={{ color: 'var(--b200)' }} />
              <p>Nenhuma tarefa ainda. Adicione acima!</p>
            </div>
          ) : (
            <div className={styles.taskGroups}>
              {pending.length > 0 && (
                <div className={styles.taskGroup}>
                  <div className={styles.groupLabel}>
                    <Circle size={13} /> Pendentes ({pending.length})
                  </div>
                  <ul className={styles.taskList}>
                    {pending.map(t => (
                      <TaskItem
                        key={t.id}
                        task={t}
                        onToggle={handleToggleTask}
                        onDelete={handleDeleteTask}
                        onEdit={(task) => { setEditTask(task); setTaskModal(true); }}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {completed.length > 0 && (
                <div className={styles.taskGroup}>
                  <div className={styles.groupLabel} style={{ color: '#10b981' }}>
                    <CheckCircle2 size={13} /> Concluídas ({completed.length})
                  </div>
                  <ul className={styles.taskList}>
                    {completed.map(t => (
                      <TaskItem
                        key={t.id}
                        task={t}
                        onToggle={handleToggleTask}
                        onDelete={handleDeleteTask}
                        onEdit={(task) => { setEditTask(task); setTaskModal(true); }}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

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
              <label className={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', fontSize: '0.875rem' }}>
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

                <div className={f.field}>
                  <label className={f.label}>Até quando</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <label className={`${f.endOption} ${editTask?.end_of_goal ? f.endOptionActive : ''}`}>
                      <input
                        type="radio"
                        name="edit_end_type"
                        checked={editTask?.end_of_goal ?? false}
                        onChange={() => setEditTask(t => ({ ...t, end_of_goal: true, max_recurrences: null }))}
                      />
                      🎯 Até a meta vencer
                    </label>
                    <label className={`${f.endOption} ${!editTask?.end_of_goal ? f.endOptionActive : ''}`}>
                      <input
                        type="radio"
                        name="edit_end_type"
                        checked={!editTask?.end_of_goal}
                        onChange={() => setEditTask(t => ({ ...t, end_of_goal: false }))}
                      />
                      🔢 Número de vezes
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
              <button type="submit" className={f.btnSubmit} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      </main>
    </>
  );
}