'use client';
import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import GoalCard from '../../components/GoalCard';
import Modal from '../../components/Modal';
import GoalForm from '../../components/GoalForm';
import { SortableList, SortableItem, DragHandle, moveSubset } from '../../components/Sortable';
import { getGoals, createGoal, updateGoal, deleteGoal, reorderGoals } from '../../lib/api';
import { celebrateGoal } from '../../lib/celebrate';
import { deleteGoalConfirm } from '../../lib/sharing';
import { useConfirm } from '../../components/ConfirmDialog';
import { Plus, Search, ChevronDown, X } from 'lucide-react';
import styles from './page.module.css';

const KIND_FILTERS = [
  { value: 'all',           label: 'Todas',         color: '#94a3b8' },
  { value: 'personal',      label: 'Pessoais',      color: '#3b82f6' },
  { value: 'collaborative', label: 'Colaborativas', color: '#8b5cf6' },
  { value: 'challenge',     label: 'Desafios',      color: '#d97706' },
];

const SECTIONS = [
  { status: 'late',      label: 'Atrasadas',    color: '#ef4444' },
  { status: 'open',      label: 'Em aberto',    color: '#3b82f6' },
  { status: 'completed', label: 'Concluídas',   color: '#10b981' },
];

const EMPTY_BY_KIND = {
  personal:      { title: 'Você não tem metas pessoais.',                       hint: 'Crie uma meta só sua para começar.' },
  collaborative: { title: 'Você não participa de nenhuma meta colaborativa.',   hint: 'Compartilhe uma meta com alguém ou entre por um convite.' },
  challenge:     { title: 'Você não participa de nenhum desafio.',              hint: 'Transforme uma meta em desafio ou entre por um convite.' },
};

const PREFS_KEY = 'goals-page-prefs';

function readPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY));
    return prefs && typeof prefs === 'object' ? prefs : null;
  } catch {
    return null;
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

const matchesKind = (goal, kind) =>
  kind === 'all' || (kind === 'personal' ? !goal.group_kind : goal.group_kind === kind);

export default function GoalsPage() {
  const router = useRouter();
  const confirmAction = useConfirm();
  const [goals,   setGoals]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all');
  const [error,   setError]   = useState('');
  const [collapsed, setCollapsed] = useState({ completed: true });
  const [closing,   setClosing]   = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef(null);

  const load = () => {
    getGoals()
      .then(setGoals)
      .catch(() => setError('Erro ao carregar metas.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getGoals()
      .then(data => {
        const prefs = readPrefs();
        if (KIND_FILTERS.some(f => f.value === prefs?.filter)) setFilter(prefs.filter);
        if (prefs?.collapsed && typeof prefs.collapsed === 'object') setCollapsed(prefs.collapsed);
        setGoals(data);
      })
      .catch(() => setError('Erro ao carregar metas.'))
      .finally(() => setLoading(false));
  }, []);

  const changeFilter = (value) => {
    setFilter(value);
    savePrefs({ filter: value, collapsed });
  };

  const setSectionCollapsed = (status, value) => {
    const next = { ...collapsed, [status]: value };
    setCollapsed(next);
    savePrefs({ filter, collapsed: next });
  };

  const toggleSection = (status) => {
    if (closing[status]) return;
    if (collapsed[status]) {
      setSectionCollapsed(status, false);
    } else {
      setClosing(prev => ({ ...prev, [status]: true }));
    }
  };

  const finishClosing = (status, event) => {
    if (event.target !== event.currentTarget) return;
    setClosing(prev => ({ ...prev, [status]: false }));
    setSectionCollapsed(status, true);
  };

  const openSearch = () => {
    flushSync(() => setSearchOpen(true));
    searchInput.current?.focus();
  };

  const closeSearch = () => {
    setSearch('');
    setSearchOpen(false);
  };

  const handleCreate = async (data) => {
    setSaving(true);
    try {
      const goal = await createGoal(data);
      router.push(`/goals/${goal.id}`);
    } catch {
      setError('Erro ao criar meta.');
      setSaving(false);
    }
  };

  const handleComplete = async (id) => {
    try {
      await updateGoal(id, { status: 'completed' });
      load();
      celebrateGoal();
    } catch { setError('Erro ao concluir meta.'); }
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction(deleteGoalConfirm(goals.find(g => g.id === id))))) return;
    try {
      await deleteGoal(id);
      load();
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

  const query = search.toLowerCase();
  const filtered = goals.filter(g =>
    matchesKind(g, filter) && (
      !query ||
      g.title.toLowerCase().includes(query) ||
      (g.description || '').toLowerCase().includes(query)
    )
  );

  const sections = SECTIONS
    .map(section => ({ ...section, goals: filtered.filter(g => g.status === section.status) }))
    .filter(section => section.goals.length > 0);

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
          <button className={styles.btnNew} onClick={() => setModal(true)}>
            <Plus size={16} /> Nova meta
          </button>
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
        ) : sections.length === 0 ? (
          <div className={`${styles.empty} glass`}>
            {goals.length === 0 ? (
              <>
                <p className={styles.emptyTitle}>Você ainda não tem metas.</p>
                <p>Crie a primeira e comece a acompanhar seu progresso.</p>
                <button className={styles.emptyBtn} onClick={() => setModal(true)}>
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
                    <button className={styles.emptyBtn} onClick={() => setModal(true)}>
                      <Plus size={15} /> Nova meta
                    </button>
                  )}
                  <button className={styles.emptyBtnGhost} onClick={() => changeFilter('all')}>Ver todas as metas</button>
                </div>
              </>
            )}
          </div>
        ) : (
          sections.map(section => {
            const isOpen = search || !collapsed[section.status];
            const isClosing = !search && closing[section.status];
            return (
              <section key={section.status} className={styles.section} style={{ '--section-color': section.color }}>
                <button
                  className={styles.sectionHeader}
                  onClick={() => toggleSection(section.status)}
                  aria-expanded={!!isOpen && !isClosing}
                >
                  <ChevronDown size={18} className={`${styles.chevron} ${isOpen && !isClosing ? '' : styles.chevronClosed}`} />
                  <span className={styles.sectionTitle}>{section.label}</span>
                  <span className={styles.sectionCount}>{section.goals.length}</span>
                  <span className={styles.sectionLine} />
                </button>
                {isOpen && (
                  <div
                    className={`${styles.sectionBody} ${isClosing ? styles.sectionBodyClosing : ''}`}
                    onAnimationEnd={isClosing ? (e) => finishClosing(section.status, e) : undefined}
                  >
                    <div className={styles.sectionInner}>
                      <SortableList ids={section.goals.map(g => g.id)} onReorder={handleReorder} layout="grid">
                        <div className={styles.grid}>
                          {section.goals.map((g, i) => (
                            <SortableItem key={g.id} id={g.id}>
                              {({ itemProps, isDragging, handleProps }) => (
                                <div {...itemProps} style={{ ...itemProps.style, animationDelay: `${Math.min(i, 8) * 50}ms` }}>
                                  <GoalCard
                                    goal={g}
                                    onDelete={handleDelete}
                                    onComplete={handleComplete}
                                    dragging={isDragging}
                                    dragHandle={<DragHandle handleProps={handleProps} />}
                                  />
                                </div>
                              )}
                            </SortableItem>
                          ))}
                        </div>
                      </SortableList>
                    </div>
                  </div>
                )}
              </section>
            );
          })
        )}

        <button className={styles.fab} onClick={() => setModal(true)} aria-label="Nova meta">
          <Plus size={24} />
        </button>

        <Modal open={modal} onClose={() => setModal(false)} title="Nova meta">
          <GoalForm onSubmit={handleCreate} onCancel={() => setModal(false)} loading={saving} />
        </Modal>
      </main>
    </>
  );
}