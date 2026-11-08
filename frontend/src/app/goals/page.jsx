'use client';
import { useState, useEffect, useRef, startTransition, addTransitionType } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import Modal from '../../components/Modal';
import GoalForm from '../../components/GoalForm';
import GoalSections, { CollapsibleSection } from '../../components/GoalSections';
import SuperGoalTile from '../../components/SuperGoalTile';
import SuperGoalForm from '../../components/SuperGoalForm';
import SuperGoalPicker from '../../components/SuperGoalPicker';
import SuperGoalIcon from '../../components/SuperGoalIcon';
import { SortableList, SortableItem, DragHandle, moveSubset } from '../../components/Sortable';
import {
  getGoals, createGoal, updateGoal, deleteGoal, reorderGoals,
  getSuperGoals, createSuperGoal, reorderSuperGoals, addGoalsToSuperGoal, removeGoalFromSuperGoal,
  peekCache,
} from '../../lib/api';
import { celebrateGoal } from '../../lib/celebrate';
import { deleteGoalConfirm } from '../../lib/sharing';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { restoreSuperGoal, superGoalTitle } from '../../lib/superGoals';
import { Plus, Search, X } from 'lucide-react';
import styles from './page.module.css';

const KIND_FILTERS = [
  { value: 'all',           label: 'Todas',         color: '#94a3b8' },
  { value: 'personal',      label: 'Pessoais',      color: '#3b82f6' },
  { value: 'collaborative', label: 'Colaborativas', color: '#8b5cf6' },
  { value: 'challenge',     label: 'Desafios',      color: '#d97706' },
];

const EMPTY_BY_KIND = {
  personal:      { title: 'Você não tem metas pessoais.',                       hint: 'Crie uma meta só sua para começar.' },
  collaborative: { title: 'Você não participa de nenhuma meta colaborativa.',   hint: 'Compartilhe uma meta com alguém ou entre por um convite.' },
  challenge:     { title: 'Você não participa de nenhum desafio.',              hint: 'Transforme uma meta em desafio ou entre por um convite.' },
};

const PREFS_KEY = 'goals-page-prefs';
let loadedPrefs = null;

function readPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY));
    loadedPrefs = prefs && typeof prefs === 'object' ? prefs : null;
  } catch {
    loadedPrefs = null;
  }
  return loadedPrefs;
}

function savePrefs(prefs) {
  loadedPrefs = prefs;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

const matchesKind = (goal, kind) =>
  kind === 'all' || (kind === 'personal' ? !goal.group_kind : goal.group_kind === kind);

export default function GoalsPage() {
  const router = useRouter();
  const confirmAction = useConfirm();
  const toast = useToast();
  const [goals,      setGoals]      = useState(() => peekCache('goals') ?? []);
  const [superGoals, setSuperGoals] = useState(() => peekCache('superGoals') ?? []);
  const [loading,    setLoading]    = useState(() => !peekCache('goals') || !peekCache('superGoals'));
  const [modal,      setModal]      = useState(null);
  const [moving,     setMoving]     = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState(() => loadedPrefs?.filter ?? 'all');
  const [error,      setError]      = useState('');
  const [collapsed,  setCollapsed]  = useState(() => loadedPrefs?.collapsed ?? { completed: true });
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef(null);

  const fetchAll = () => Promise.all([getGoals(), getSuperGoals()]);

  const load = () =>
    fetchAll()
      .then(([goalList, superList]) => {
        startTransition(() => {
          addTransitionType('goal-change');
          setGoals(goalList);
          setSuperGoals(superList);
        });
      })
      .catch(() => setError('Erro ao carregar metas.'));

  useEffect(() => {
    fetchAll()
      .then(([goalList, superList]) => {
        const prefs = readPrefs();
        if (KIND_FILTERS.some(f => f.value === prefs?.filter)) setFilter(prefs.filter);
        if (prefs?.collapsed && typeof prefs.collapsed === 'object') setCollapsed(prefs.collapsed);
        setGoals(goalList);
        setSuperGoals(superList);
      })
      .catch(() => setError('Erro ao carregar metas.'))
      .finally(() => setLoading(false));
  }, []);

  const changeFilter = (value) => {
    startTransition(() => {
      addTransitionType('goal-change');
      setFilter(value);
    });
    savePrefs({ filter: value, collapsed });
  };

  const setSectionCollapsed = (key, value) => {
    const next = { ...collapsed, [key]: value };
    setCollapsed(next);
    savePrefs({ filter, collapsed: next });
  };

  const openSearch = () => {
    flushSync(() => setSearchOpen(true));
    searchInput.current?.focus();
  };

  const closeSearch = () => {
    setSearch('');
    setSearchOpen(false);
  };

  const closeModal = () => {
    setModal(null);
    setMoving(null);
  };

  const handleCreate = async ({ super_goal_id, ...data }) => {
    setSaving(true);
    try {
      const goal = await createGoal(data);
      if (super_goal_id) await addGoalsToSuperGoal(super_goal_id, [goal.id]);
      router.push(`/goals/${goal.id}`);
    } catch {
      setError('Erro ao criar meta.');
      setSaving(false);
    }
  };

  const handleCreateSuperGoal = async (data) => {
    setSaving(true);
    try {
      const superGoal = await createSuperGoal(data);
      closeModal();
      toast(`Supermeta “${superGoal.title}” criada`);
      if (data.goal_ids.length === 0) router.push(`/goals/super/${superGoal.id}`);
      else load();
    } catch {
      setError('Erro ao criar supermeta.');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (id) => {
    try {
      await updateGoal(id, { status: 'completed' });
      load();
      celebrateGoal();
      toast({
        message: 'Meta concluída',
        action: {
          label: 'Desfazer',
          onClick: () => updateGoal(id, { status: 'open' }).then(load).catch(() => setError('Erro ao reabrir meta.')),
        },
      });
    } catch { setError('Erro ao concluir meta.'); }
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction(deleteGoalConfirm(goals.find(g => g.id === id))))) return;
    try {
      await deleteGoal(id);
      load();
      toast('Meta excluída');
    } catch { setError('Erro ao excluir meta.'); }
  };

  const openMove = (goal) => {
    setMoving(goal);
    setModal('move');
  };

  const moveTo = async (superGoalId) => {
    setSaving(true);
    try {
      const goal = moving;
      await addGoalsToSuperGoal(superGoalId, [goal.id]);
      closeModal();
      load();
      toast({
        message: `Movida para “${superGoalTitle(superGoals, superGoalId)}”`,
        action: {
          label: 'Desfazer',
          onClick: () => restoreSuperGoal(goal.id, goal.super_goal_id, superGoalId).then(load),
        },
      });
    } catch {
      setError('Erro ao mover meta.');
    } finally {
      setSaving(false);
    }
  };

  const moveToNew = async (title) => {
    setSaving(true);
    try {
      await createSuperGoal({ title, goal_ids: [moving.id] });
      closeModal();
      load();
      toast(`Movida para a nova supermeta “${title}”`);
    } catch {
      setError('Erro ao criar supermeta.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromSuperGoal = async (goal) => {
    try {
      await removeGoalFromSuperGoal(goal.super_goal_id, goal.id);
      load();
      toast({
        message: `Removida de “${superGoalTitle(superGoals, goal.super_goal_id)}”`,
        action: {
          label: 'Desfazer',
          onClick: () => addGoalsToSuperGoal(goal.super_goal_id, [goal.id]).then(load),
        },
      });
    } catch { setError('Erro ao tirar meta da supermeta.'); }
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

  const handleReorderSuperGoals = async (ids) => {
    setSuperGoals(prev => moveSubset(prev, ids));
    try {
      await reorderSuperGoals(ids);
    } catch {
      setError('Erro ao salvar a nova ordem.');
      load();
    }
  };

  const query = search.toLowerCase();
  const filtered = goals.filter(g =>
    matchesKind(g, filter) && (
      !query ||
      g.title.toLowerCase().includes(query) ||
      (g.description || '').toLowerCase().includes(query)
    )
  );

  const looseGoals = query ? filtered : filtered.filter(g => g.super_goal_id == null);
  const visibleSuperGoals = query ? [] : superGoals
    .map(sg => ({ ...sg, goals: filtered.filter(g => g.super_goal_id === sg.id) }))
    .filter(sg => filter === 'all' || sg.goals.length > 0);
  const isEmpty = looseGoals.length === 0 && visibleSuperGoals.length === 0;

  const cardProps = {
    onDelete: handleDelete,
    onComplete: handleComplete,
    onMoveToSuperGoal: openMove,
    onRemoveFromSuperGoal: handleRemoveFromSuperGoal,
  };

  return (
    <>
      <Navbar />
      <main className={styles.main}>

        <div className={`${styles.pageHero} glass`}>
          <div className={styles.heroLeft}>
            <div className={styles.heroText}>
              <h1 className={styles.title}>Minhas metas</h1>
              <p className={styles.sub}>
                <span className={styles.countBadge}>{goals.length}</span>
                <span className={styles.subLabel}>
                  meta{goals.length !== 1 ? 's' : ''} cadastrada{goals.length !== 1 ? 's' : ''}
                </span>
              </p>
            </div>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.btnSuper} onClick={() => setModal('super')}>
              <SuperGoalIcon size={16} /> <span>Supermeta</span>
            </button>
            <button className={styles.btnNew} onClick={() => setModal('goal')}>
              <Plus size={16} /> Nova meta
            </button>
          </div>
        </div>

        <div className={`${styles.toolbar} ${searchOpen ? styles.toolbarSearching : ''} glass`}>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Buscar metas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              ref={searchInput}
            />
            <button className={styles.searchClose} onClick={closeSearch} aria-label="Fechar busca">
              <X size={16} />
            </button>
          </div>
          <button className={styles.searchToggle} onClick={openSearch} aria-label="Buscar metas">
            <Search size={17} />
          </button>
          <div className={styles.divider} />
          <div className={styles.filters}>
            {KIND_FILTERS.map(f => (
              <button
                key={f.value}
                className={`${styles.filterBtn} ${filter === f.value ? styles.filterActive : ''}`}
                onClick={() => changeFilter(f.value)}
              >
                <span className={styles.filterDot} style={{ '--dot': f.color }} />
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {loading ? (
          <div className={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${styles.cardSkeleton} glass`} />
            ))}
          </div>
        ) : isEmpty ? (
          <div className={`${styles.empty} glass`}>
            {goals.length === 0 ? (
              <>
                <p className={styles.emptyTitle}>Você ainda não tem metas.</p>
                <p>Crie a primeira e comece a acompanhar seu progresso.</p>
                <button className={styles.emptyBtn} onClick={() => setModal('goal')}>
                  <Plus size={15} /> Criar primeira meta
                </button>
              </>
            ) : search ? (
              <>
                <p className={styles.emptyTitle}>Nada encontrado para “{search}”.</p>
                <p>Confira a grafia ou tente outra palavra.</p>
                <button className={styles.emptyBtnGhost} onClick={closeSearch}>Limpar busca</button>
              </>
            ) : (
              <>
                <p className={styles.emptyTitle}>{EMPTY_BY_KIND[filter]?.title}</p>
                <p>{EMPTY_BY_KIND[filter]?.hint}</p>
                <div className={styles.emptyActions}>
                  {filter === 'personal' && (
                    <button className={styles.emptyBtn} onClick={() => setModal('goal')}>
                      <Plus size={15} /> Nova meta
                    </button>
                  )}
                  <button className={styles.emptyBtnGhost} onClick={() => changeFilter('all')}>Ver todas as metas</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {visibleSuperGoals.length > 0 && (
              <CollapsibleSection
                label="Supermetas"
                color="#4f46e5"
                count={visibleSuperGoals.length}
                open={!collapsed.super}
                onToggle={(open) => setSectionCollapsed('super', !open)}
              >
                <SortableList ids={visibleSuperGoals.map(sg => sg.id)} onReorder={handleReorderSuperGoals} layout="grid">
                  <div className={styles.grid}>
                    {visibleSuperGoals.map((sg, i) => (
                      <SortableItem key={sg.id} id={sg.id}>
                        {({ itemProps, isDragging, handleProps }) => (
                          <div {...itemProps} style={{ ...itemProps.style, '--enter-delay': `calc(var(--stagger) * ${Math.min(i, 8)})` }}>
                            <SuperGoalTile
                              superGoal={sg}
                              goals={sg.goals}
                              dragging={isDragging}
                              dragHandle={<DragHandle handleProps={handleProps} />}
                            />
                          </div>
                        )}
                      </SortableItem>
                    ))}
                  </div>
                </SortableList>
              </CollapsibleSection>
            )}
            <GoalSections
              goals={looseGoals}
              collapsed={collapsed}
              onCollapsedChange={setSectionCollapsed}
              forceOpen={!!query}
              onReorder={handleReorder}
              cardProps={cardProps}
            />
          </>
        )}

        <button className={styles.fab} onClick={() => setModal('goal')} aria-label="Nova meta">
          <Plus size={24} />
        </button>

        <Modal open={modal === 'goal'} onClose={closeModal} title="Nova meta">
          <GoalForm superGoals={superGoals} onSubmit={handleCreate} onCancel={closeModal} loading={saving} />
        </Modal>

        <Modal open={modal === 'super'} onClose={closeModal} title="Nova supermeta">
          <SuperGoalForm
            goals={goals}
            superGoals={superGoals}
            submitLabel="Criar supermeta"
            onSubmit={handleCreateSuperGoal}
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
              onPick={moveTo}
              onCreate={moveToNew}
              loading={saving}
            />
          )}
        </Modal>
      </main>
    </>
  );
}
