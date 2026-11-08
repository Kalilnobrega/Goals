'use client';
import { useState, useEffect, startTransition, addTransitionType, ViewTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import Modal from '../../../../components/Modal';
import GoalSections from '../../../../components/GoalSections';
import SuperGoalForm from '../../../../components/SuperGoalForm';
import SuperGoalPicker from '../../../../components/SuperGoalPicker';
import SuperGoalIcon from '../../../../components/SuperGoalIcon';
import { moveSubset } from '../../../../components/Sortable';
import { useConfirm } from '../../../../components/ConfirmDialog';
import { useToast } from '../../../../components/Toast';
import { restoreSuperGoal, superGoalTitle } from '../../../../lib/superGoals';
import {
  getGoals, updateGoal, deleteGoal, reorderGoals,
  getSuperGoals, createSuperGoal, renameSuperGoal, deleteSuperGoal,
  addGoalsToSuperGoal, removeGoalFromSuperGoal, peekCache,
} from '../../../../lib/api';
import { celebrateGoal } from '../../../../lib/celebrate';
import { deleteGoalConfirm } from '../../../../lib/sharing';
import styles from './page.module.css';

const fetchAll = () => Promise.all([getGoals(), getSuperGoals()]);

export default function SuperGoalPage() {
  const { id } = useParams();
  const superGoalId = Number(id);
  const router = useRouter();
  const confirmAction = useConfirm();
  const toast = useToast();
  const [goals,      setGoals]      = useState(() => peekCache('goals') ?? []);
  const [superGoals, setSuperGoals] = useState(() => peekCache('superGoals') ?? []);
  const [loading,    setLoading]    = useState(() => !peekCache('goals') || !peekCache('superGoals'));
  const [notFound,   setNotFound]   = useState(false);
  const [error,      setError]      = useState('');
  const [modal,      setModal]      = useState(null);
  const [moving,     setMoving]     = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [editing,    setEditing]    = useState(false);
  const [draft,      setDraft]      = useState('');
  const [collapsed,  setCollapsed]  = useState({ completed: true });

  const load = () =>
    fetchAll()
      .then(([goalList, superList]) => {
        startTransition(() => {
          addTransitionType('goal-change');
          setGoals(goalList);
          setSuperGoals(superList);
        });
      })
      .catch(() => setError('Erro ao carregar a supermeta.'));

  useEffect(() => {
    fetchAll()
      .then(([goalList, superList]) => {
        setGoals(goalList);
        setSuperGoals(superList);
        setNotFound(!superList.some(sg => sg.id === superGoalId));
      })
      .catch(() => setError('Erro ao carregar a supermeta.'))
      .finally(() => setLoading(false));
  }, [superGoalId]);

  const superGoal = superGoals.find(sg => sg.id === superGoalId);
  const inside = goals.filter(g => g.super_goal_id === superGoalId);
  const candidates = goals.filter(g => g.super_goal_id !== superGoalId);

  const closeModal = () => {
    setModal(null);
    setMoving(null);
  };

  const run = async (action, message, success) => {
    setSaving(true);
    try {
      await action();
      closeModal();
      await load();
      if (success) toast(success);
    } catch {
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const startRename = () => {
    setDraft(superGoal.title);
    setEditing(true);
  };

  const saveRename = async (e) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title || title === superGoal.title) return setEditing(false);
    try {
      await renameSuperGoal(superGoalId, title);
      setSuperGoals(prev => prev.map(sg => (sg.id === superGoalId ? { ...sg, title } : sg)));
      setEditing(false);
      toast('Nome atualizado');
    } catch { setError('Erro ao renomear supermeta.'); }
  };

  const handleDeleteSuperGoal = async () => {
    const ok = await confirmAction({
      title: 'Excluir supermeta',
      message: [
        <><strong>{superGoal.title}</strong> será excluída.</>,
        'As metas dentro dela voltam para a lista principal. Nenhuma meta é excluída.',
      ],
      confirmLabel: 'Excluir supermeta',
    });
    if (!ok) return;
    try {
      await deleteSuperGoal(superGoalId);
      toast(`Supermeta “${superGoal.title}” excluída`);
      router.push('/goals');
    } catch { setError('Erro ao excluir supermeta.'); }
  };

  const handleComplete = async (goalId) => {
    try {
      await updateGoal(goalId, { status: 'completed' });
      load();
      celebrateGoal();
      toast({
        message: 'Meta concluída',
        action: {
          label: 'Desfazer',
          onClick: () => updateGoal(goalId, { status: 'open' }).then(load).catch(() => setError('Erro ao reabrir meta.')),
        },
      });
    } catch { setError('Erro ao concluir meta.'); }
  };

  const handleDelete = async (goalId) => {
    if (!(await confirmAction(deleteGoalConfirm(goals.find(g => g.id === goalId))))) return;
    try {
      await deleteGoal(goalId);
      load();
      toast('Meta excluída');
    } catch { setError('Erro ao excluir meta.'); }
  };

  const handleReorder = async (ids) => {
    setGoals(prev => moveSubset(prev, ids));
    try {
      await reorderGoals(ids);
    } catch {
      setError('Erro ao salvar a nova ordem.');
      load();
    }
  };

  const cardProps = {
    onDelete: handleDelete,
    onComplete: handleComplete,
    onMoveToSuperGoal: (goal) => { setMoving(goal); setModal('move'); },
    onRemoveFromSuperGoal: (goal) =>
      run(() => removeGoalFromSuperGoal(superGoalId, goal.id), 'Erro ao tirar meta da supermeta.', {
        message: `Removida de “${superGoal?.title}”`,
        action: { label: 'Desfazer', onClick: () => addGoalsToSuperGoal(superGoalId, [goal.id]).then(load) },
      }),
  };

  if (!loading && notFound) {
    return (
      <>
        <main className={styles.main}>
          <div className={`${styles.empty} glass`}>
            <p className={styles.emptyTitle}>Supermeta não encontrada.</p>
            <button className={styles.btnPrimary} onClick={() => router.push('/goals')}>
              <ArrowLeft size={15} /> Voltar para metas
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className={styles.main}>
        <button className={styles.backLink} onClick={() => router.push('/goals')}>
          <ArrowLeft size={16} /> Todas as metas
        </button>

        <ViewTransition name={`super-${superGoalId}`} share="goal-morph" default="none">
        <div className={`${styles.hero} glass`}>
          <span className={styles.heroIcon}><SuperGoalIcon size={24} /></span>
          <div className={styles.heroText}>
            <span className={styles.eyebrow}>Supermeta</span>
            {editing ? (
              <form className={styles.renameForm} onSubmit={saveRename}>
                <input
                  className={styles.renameInput}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  maxLength={60}
                  autoFocus
                />
                <button type="submit" className={styles.iconBtn} aria-label="Salvar nome"><Check size={16} /></button>
                <button type="button" className={styles.iconBtn} onClick={() => setEditing(false)} aria-label="Cancelar"><X size={16} /></button>
              </form>
            ) : (
              <h1 className={styles.title}>{superGoal?.title ?? ' '}</h1>
            )}
            <span className={styles.count}>
              {inside.length} meta{inside.length !== 1 ? 's' : ''}
            </span>
          </div>
          {superGoal && !editing && (
            <div className={styles.heroActions}>
              <button className={styles.iconBtn} onClick={startRename} aria-label="Renomear supermeta" title="Renomear">
                <Pencil size={16} />
              </button>
              <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={handleDeleteSuperGoal} aria-label="Excluir supermeta" title="Excluir">
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>
        </ViewTransition>

        {superGoal && (
          <button className={styles.btnAdd} onClick={() => setModal('add')}>
            <Plus size={16} /> Adicionar metas
          </button>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {loading ? (
          <div className={styles.grid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`${styles.cardSkeleton} glass`} />
            ))}
          </div>
        ) : inside.length === 0 ? (
          <div className={`${styles.empty} glass`}>
            <p className={styles.emptyTitle}>Nenhuma meta aqui ainda.</p>
            <p>Junte metas parecidas para encontrá-las mais rápido.</p>
            <button className={styles.btnPrimary} onClick={() => setModal('add')}>
              <Plus size={15} /> Adicionar metas
            </button>
          </div>
        ) : (
          <GoalSections
            goals={inside}
            collapsed={collapsed}
            onCollapsedChange={(status, value) => setCollapsed(prev => ({ ...prev, [status]: value }))}
            onReorder={handleReorder}
            cardProps={cardProps}
          />
        )}

        <Modal open={modal === 'add'} onClose={closeModal} title="Adicionar metas">
          <SuperGoalForm
            showTitle={false}
            goals={candidates}
            superGoals={superGoals}
            currentSuperGoalId={superGoalId}
            submitLabel="Adicionar"
            onSubmit={({ goal_ids }) => run(
              () => addGoalsToSuperGoal(superGoalId, goal_ids),
              'Erro ao adicionar metas.',
              `${goal_ids.length} meta${goal_ids.length !== 1 ? 's' : ''} adicionada${goal_ids.length !== 1 ? 's' : ''}`,
            )}
            onCancel={closeModal}
            loading={saving}
          />
        </Modal>

        <Modal open={modal === 'move' && !!moving} onClose={closeModal} title="Mover para supermeta" size="sm">
          {moving && (
            <SuperGoalPicker
              goal={moving}
              goals={goals}
              superGoals={superGoals}
              onPick={(targetId) => {
                const goal = moving;
                run(() => addGoalsToSuperGoal(targetId, [goal.id]), 'Erro ao mover meta.', {
                  message: `Movida para “${superGoalTitle(superGoals, targetId)}”`,
                  action: { label: 'Desfazer', onClick: () => restoreSuperGoal(goal.id, goal.super_goal_id, targetId).then(load) },
                });
              }}
              onCreate={(title) => run(
                () => createSuperGoal({ title, goal_ids: [moving.id] }),
                'Erro ao criar supermeta.',
                `Movida para a nova supermeta “${title}”`,
              )}
              loading={saving}
            />
          )}
        </Modal>
      </main>
    </>
  );
}
