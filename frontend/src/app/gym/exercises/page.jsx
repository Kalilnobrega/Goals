'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, ChevronRight, SearchX } from 'lucide-react';
import { getExercises, createExercise, updateExercise, deleteExercise, peekCache } from '../../../lib/api';
import { MUSCLE_GROUPS, muscleLabel, equipmentLabel, normalize, apiError } from '../../../lib/gym';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';
import GymSheet from '../../../components/gym/GymSheet';
import ExerciseForm from '../../../components/gym/ExerciseForm';
import SegmentTabs, { WORKOUT_TABS } from '../../../components/gym/SegmentTabs';
import styles from './page.module.css';

const FILTERS = [{ value: 'all', label: 'Todos' }, { value: 'mine', label: 'Meus' }, ...MUSCLE_GROUPS];

const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');

export default function ExercisesPage() {
  const [exercises, setExercises] = useState(() => peekCache('fitnessExercises') ?? null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sheet, setSheet] = useState(null);
  const toast = useToast();
  const confirmAction = useConfirm();

  const fetchExercises = useCallback(() => getExercises().then(setExercises).catch(() => setLoadError(true)), []);

  useEffect(() => { fetchExercises(); }, [fetchExercises]);

  const retry = () => {
    setLoadError(false);
    fetchExercises();
  };

  const visible = useMemo(() => {
    if (!exercises) return [];
    const term = normalize(query);
    return exercises
      .filter(e => filter === 'all' || (filter === 'mine' ? e.is_custom : e.muscle_group === filter))
      .filter(e => !term || normalize(e.name).includes(term))
      .sort(byName);
  }, [exercises, query, filter]);

  const sections = useMemo(() => {
    if (filter !== 'all' && filter !== 'mine') return [{ key: filter, title: null, items: visible }];
    return MUSCLE_GROUPS
      .map(group => ({ key: group.value, title: group.label, items: visible.filter(e => e.muscle_group === group.value) }))
      .filter(section => section.items.length > 0);
  }, [visible, filter]);

  const closeSheet = useCallback(() => setSheet(null), []);

  const save = async (data) => {
    try {
      if (sheet.exercise) {
        const updated = await updateExercise(sheet.exercise.id, data);
        setExercises(list => list.map(e => (e.id === updated.id ? updated : e)));
        toast('Exercício atualizado');
      } else {
        const created = await createExercise(data);
        setExercises(list => [...list, created]);
        toast('Exercício criado');
      }
      setSheet(null);
      return null;
    } catch (err) {
      return apiError(err, 'Não foi possível salvar o exercício.');
    }
  };

  const remove = async () => {
    const exercise = sheet.exercise;
    const ok = await confirmAction({
      title: 'Excluir exercício',
      message: [<><strong>{exercise.name}</strong> será excluído da sua biblioteca.</>],
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteExercise(exercise.id);
      setExercises(list => list.filter(e => e.id !== exercise.id));
      setSheet(null);
      toast('Exercício excluído');
    } catch (err) {
      toast({ tone: 'danger', message: apiError(err, 'Não foi possível excluir o exercício.') });
    }
  };

  const openNew = () => setSheet({ exercise: null, initialName: query.trim() });
  const customCount = exercises?.filter(e => e.is_custom).length ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.title}>Exercícios</h1>
          <p className={styles.subtitle}>
            {exercises
              ? `${exercises.length} na biblioteca${customCount ? ` · ${customCount} seus` : ''}`
              : 'Sua biblioteca de movimentos'}
          </p>
        </div>
        <button type="button" className={styles.newDesktop} onClick={openNew}>
          <Plus size={18} strokeWidth={2.4} /> Novo exercício
        </button>
      </header>

      <SegmentTabs tabs={WORKOUT_TABS} label="Treinos" />

      <div className={styles.searchBox}>
        <Search size={18} className={styles.searchIcon} aria-hidden="true" />
        <input
          type="search"
          className={styles.search}
          placeholder="Buscar exercício"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Buscar exercício"
          enterKeyHint="search"
        />
        {query && (
          <button type="button" className={styles.clear} onClick={() => setQuery('')} aria-label="Limpar busca">
            <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.filters} role="tablist" aria-label="Filtrar por grupo muscular">
        {FILTERS.map(f => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            className={`${styles.filter} ${filter === f.value ? styles.filterActive : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError && !exercises && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Não foi possível carregar os exercícios.</p>
          <button type="button" className={styles.stateAction} onClick={retry}>Tentar de novo</button>
        </div>
      )}

      {!exercises && !loadError && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando exercícios">
          {Array.from({ length: 7 }).map((_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
      )}

      {exercises && visible.length === 0 && (
        <div className={styles.state}>
          <SearchX size={32} className={styles.stateIcon} aria-hidden="true" />
          {filter === 'mine' && !query ? (
            <>
              <p className={styles.stateTitle}>Você ainda não criou exercícios.</p>
              <p className={styles.stateText}>Não achou um movimento na biblioteca? Cadastre do seu jeito e use nas suas fichas.</p>
              <button type="button" className={styles.stateAction} onClick={openNew}>Criar exercício</button>
            </>
          ) : (
            <>
              <p className={styles.stateTitle}>Nenhum exercício encontrado.</p>
              {query.trim() && (
                <button type="button" className={styles.stateAction} onClick={openNew}>
                  Criar “{query.trim()}”
                </button>
              )}
            </>
          )}
        </div>
      )}

      {sections.map(section => (
        <section key={section.key} className={styles.section}>
          {section.title && (
            <h2 className={styles.sectionTitle}>
              {section.title}
              <span>{section.items.length}</span>
            </h2>
          )}
          <ul className={styles.list}>
            {section.items.map(exercise => {
              const meta = (
                <>
                  <span className={styles.itemText}>
                    <span className={styles.itemName}>{exercise.name}</span>
                    <span className={styles.itemMeta}>
                      {filter !== 'all' && filter !== 'mine' ? '' : `${muscleLabel(exercise.muscle_group)} · `}
                      {equipmentLabel(exercise.equipment)}
                    </span>
                  </span>
                  {exercise.is_custom && <span className={styles.badge}>Seu</span>}
                </>
              );
              return (
                <li key={exercise.id}>
                  {exercise.is_custom ? (
                    <button type="button" className={`${styles.item} ${styles.itemButton}`} onClick={() => setSheet({ exercise })}>
                      {meta}
                      <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
                    </button>
                  ) : (
                    <div className={styles.item}>{meta}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <button type="button" className={styles.fab} onClick={openNew} aria-label="Novo exercício">
        <Plus size={26} strokeWidth={2.4} />
      </button>

      <GymSheet open={!!sheet} onClose={closeSheet} title={sheet?.exercise ? 'Editar exercício' : 'Novo exercício'}>
        {sheet && (
          <ExerciseForm
            key={sheet.exercise?.id ?? 'new'}
            initial={sheet.exercise ?? (sheet.initialName ? { name: sheet.initialName } : null)}
            onSubmit={save}
            onDelete={sheet.exercise ? remove : null}
          />
        )}
      </GymSheet>
    </div>
  );
}
