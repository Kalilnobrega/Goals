'use client';
import { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import GoalCard from '../../components/GoalCard';
import Modal from '../../components/Modal';
import GoalForm from '../../components/GoalForm';
import { getGoals, createGoal, deleteGoal } from '../../lib/api';
import { Plus, Search } from 'lucide-react';
import styles from './page.module.css';

const STATUS_FILTERS = [
  { value: 'all',       label: 'Todas'      },
  { value: 'completed', label: 'Concluídas' },
  { value: 'open',      label: 'Em aberto'  },
  { value: 'late',      label: 'Atrasadas'  },
];

export default function GoalsPage() {
  const [goals,   setGoals]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all');
  const [error,   setError]   = useState('');

  const load = (status) => {
    setLoading(true);
    // Passa o status para o backend se não for 'all'
    getGoals(status !== 'all' ? status : undefined)
      .then(setGoals)
      .catch(() => setError('Erro ao carregar metas.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(filter); }, [filter]);

  const handleCreate = async (data) => {
    setSaving(true);
    try {
      await createGoal(data);
      setModal(false);
      load(filter);
    } catch { setError('Erro ao criar meta.'); }
    finally { setSaving(false); }
  };

  const handleComplete = async (id) => {
    try {
      await updateGoal(id, { status: 'completed' });
      load(filter);
    } catch { setError('Erro ao concluir meta.'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta meta e todas as suas tarefas?')) return;
    try {
      await deleteGoal(id);
      load(filter);
    } catch { setError('Erro ao excluir meta.'); }
  };

  // Filtro de busca local — late goals ficam no topo
  const filtered = goals.filter(g =>
      !search ||
      g.title.toLowerCase().includes(search.toLowerCase()) ||
      (g.description || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (a.status === 'late' && b.status !== 'late') return -1;
      if (b.status === 'late' && a.status !== 'late') return 1;
      return 0;
    });

  return (
    <>
      <Navbar />
      <main className={styles.main}>

        {/* Hero header */}
        <div className={`${styles.pageHero} glass`}>
          <div className={styles.heroLeft}>
            <div>
              <h1 className={styles.title}>Minhas metas</h1>
              <p className={styles.sub}>
                <span className={styles.countBadge}>{goals.length}</span>
                meta{goals.length !== 1 ? 's' : ''} cadastrada{goals.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button className={styles.btnNew} onClick={() => setModal(true)}>
            <Plus size={16} /> Nova meta
          </button>
        </div>

        {/* Toolbar */}
        <div className={`${styles.toolbar} glass`}>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Buscar metas..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className={styles.divider} />
          <div className={styles.filters}>
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                className={`${styles.filterBtn} ${filter === f.value ? styles.filterActive : ''}`}
                onClick={() => setFilter(f.value)}
              >
                <span className={styles.filterDot} style={{ '--dot': f.value === 'all' ? '#3b82f6' : f.value === 'completed' ? '#10b981' : f.value === 'open' ? '#f59e0b' : '#ef4444' }} />
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {/* Grid */}
        {loading ? (
          <div className={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${styles.cardSkeleton} glass`} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${styles.empty} glass`}>
            <p>Nenhuma meta encontrada.</p>
            {goals.length === 0 && (
              <button className={styles.emptyBtn} onClick={() => setModal(true)}>
                <Plus size={15} /> Criar primeira meta
              </button>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((g, i) => (
              <div key={g.id} style={{ animationDelay: `${i * 60}ms` }}>
                <GoalCard goal={g} onDelete={handleDelete} onComplete={handleComplete} />
              </div>
            ))}
          </div>
        )}

        <Modal open={modal} onClose={() => setModal(false)} title="Nova meta">
          <GoalForm onSubmit={handleCreate} onCancel={() => setModal(false)} loading={saving} />
        </Modal>
      </main>
    </>
  );
}