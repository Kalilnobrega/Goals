'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, ChevronRight, SearchX, Pencil } from 'lucide-react';
import { getExercises, createExercise, updateExercise, deleteExercise, peekCache } from '../../../lib/api';
import { MUSCLE_GROUPS, equipmentLabel, gripLabel, apiError, groupsLabel, exerciseGroups, groupFamilies, familyOptions } from '../../../lib/gym';
import { useToast } from '../../../components/Toast';
import { useConfirm } from '../../../components/ConfirmDialog';
import GymSheet from '../../../components/gym/GymSheet';
import ExerciseIntensity from '../../../components/gym/ExerciseIntensity';
import ExerciseForm from '../../../components/gym/ExerciseForm';
import ExerciseMuscles from '../../../components/gym/ExerciseMuscles';
import sheetStyles from '../../../components/gym/sheet.module.css';
import SegmentTabs, { WORKOUT_TABS } from '../../../components/gym/SegmentTabs';
import Floating from '../../../components/gym/Floating';
import ExerciseFilters, { ROLE_LABEL, useExerciseFilters } from '../../../components/gym/ExerciseFilters';
import UnilateralTag from '../../../components/gym/UnilateralTag';
import VariantChoices from '../../../components/gym/VariantChoices';
import styles from './page.module.css';


export default function ExercisesPage() {
  const [exercises, setExercises] = useState(() => peekCache('fitnessExercises') ?? null);
  const [loadError, setLoadError] = useState(false);
  const filters = useExerciseFilters(exercises);
  const { query, setQuery, group: filter, muscle, roleOf, visible, signature } = filters;
  const [sheet, setSheet] = useState(null);
  const toast = useToast();
  const confirmAction = useConfirm();

  const fetchExercises = useCallback(() => getExercises().then(setExercises).catch(() => setLoadError(true)), []);

  useEffect(() => { fetchExercises(); }, [fetchExercises]);

  const retry = () => {
    setLoadError(false);
    fetchExercises();
  };

  const sections = useMemo(() => {
    const families = groupFamilies(visible, !muscle);
    if (muscle || (filter !== 'all' && filter !== 'mine')) return [{ key: muscle ?? filter, title: null, items: families }];
    return MUSCLE_GROUPS
      .map(group => ({
        key: group.value,
        title: group.label,
        items: families.filter(family => family.variants.some(variant => exerciseGroups(variant).includes(group.value))),
      }))
      .filter(section => section.items.length > 0);
  }, [visible, filter, muscle]);

  const closeSheet = useCallback(() => setSheet(null), []);
  const detail = sheet?.mode === 'detail'
    ? sheet.family.variants.find(variant => variant.id === sheet.variantId) ?? sheet.family.variants[0]
    : null;

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

      <ExerciseFilters filters={filters} exercises={exercises} allowMine />

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

      <div className={styles.results}>
        {sections.map(section => (
          <section key={`${signature}-${section.key}`} className={styles.section}>
            {section.title && (
              <h2 className={styles.sectionTitle}>
                {section.title}
                <span>{section.items.length}</span>
              </h2>
            )}
            <ul className={styles.list}>
              {section.items.map((family, index) => {
                const first = family.variants[0];
                const many = family.variants.length > 1;
                return (
                  <li key={family.key} className={styles.row} style={{ '--i': Math.min(index, 14) }}>
                    <button
                      type="button"
                      className={`${styles.item} ${styles.itemButton}`}
                      onClick={() => setSheet({ mode: 'detail', family, variantId: first.id })}
                    >
                      <span className={styles.itemText}>
                        <span className={styles.itemName}>{family.name}</span>
                        <span className={styles.itemMeta}>
                          {muscle ? `${ROLE_LABEL[roleOf(first)]} · ${groupsLabel(first)}` : groupsLabel(first)}
                        </span>
                        <span className={`${styles.itemMeta} ${styles.itemEquipment}`}>
                          {many ? familyOptions(family.variants) : equipmentLabel(first.equipment)}
                          {family.variants.every(variant => variant.is_unilateral) && <>{' '}<UnilateralTag /></>}
                        </span>
                      </span>
                      {family.variants.some(variant => variant.is_custom) && <span className={styles.badge}>Seu</span>}
                      <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <Floating>
        <button type="button" className={styles.fab} onClick={openNew} aria-label="Novo exercício">
          <Plus size={26} strokeWidth={2.4} />
        </button>
      </Floating>

      <GymSheet
        open={!!sheet}
        onClose={closeSheet}
        title={sheet?.mode === 'detail' ? sheet.family.name : sheet?.exercise ? 'Editar exercício' : 'Novo exercício'}
      >
        {sheet?.mode === 'detail' && detail && (
          <div className={sheetStyles.stack}>
            <VariantChoices
              variants={sheet.family.variants}
              current={detail}
              onSelect={variant => setSheet(current => ({ ...current, variantId: variant.id }))}
              chipClassName={styles.variant}
              activeClassName={styles.variantActive}
            />
            <p className={sheetStyles.text}>
              {sheet.family.variants.length > 1 && <><strong>{detail.name}</strong><br /></>}
              {groupsLabel(detail)}{detail.grip ? ` · pegada ${gripLabel(detail.grip).toLowerCase()}` : ''} · {equipmentLabel(detail.equipment)}{detail.is_custom ? ' · seu' : ''}
              {detail.is_unilateral && <>{' '}<UnilateralTag /></>}
            </p>
            {detail.tracking === 'time' && (
              <p className={sheetStyles.text}>Registrado por <strong>tempo</strong>, com cronômetro no treino.</p>
            )}
            {detail.equipment === 'bodyweight' && detail.tracking !== 'cardio' && (
              <p className={sheetStyles.text}>
                Conta <strong>{Math.round((detail.bodyweight_factor ?? 1) * 100)}% do peso corporal</strong> no volume e no 1RM, mais a carga extra que você registrar.
              </p>
            )}
            <ExerciseIntensity
              exerciseId={detail.id}
              name={detail.name}
              intensity={detail.intensity}
              defaultIntensity={detail.default_intensity}
              onChange={updated => {
                setExercises(list => list.map(e => (e.id === updated.id ? updated : e)));
                setSheet(current => ({
                  ...current,
                  family: { ...current.family, variants: current.family.variants.map(v => (v.id === updated.id ? updated : v)) },
                }));
              }}
            />
            <ExerciseMuscles key={detail.id} muscles={detail.muscles ?? []} />
            {detail.is_custom && (
              <button type="button" className={sheetStyles.secondary} onClick={() => setSheet({ exercise: detail, mode: 'edit' })}>
                <Pencil size={18} /> Editar exercício
              </button>
            )}
          </div>
        )}
        {sheet && sheet.mode !== 'detail' && (
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
