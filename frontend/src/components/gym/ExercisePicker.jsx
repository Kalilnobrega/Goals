'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X, Check, ChevronDown } from 'lucide-react';
import { equipmentLabel, plural, groupsLabel, groupFamilies } from '../../lib/gym';
import ExerciseFilters, { ROLE_LABEL, useExerciseFilters } from './ExerciseFilters';
import UnilateralTag from './UnilateralTag';
import styles from './ExercisePicker.module.css';

export default function ExercisePicker({ exercises, loadError, onRetry, onConfirm, single = false }) {
  const filters = useExerciseFilters(exercises);
  const { query, setQuery, muscle, roleOf, visible, signature } = filters;
  const [selected, setSelected] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const families = useMemo(() => groupFamilies(visible, !muscle), [visible, muscle]);

  const toggle = (exercise) => {
    if (single) return onConfirm([exercise]);
    setSelected(list => (list.some(e => e.id === exercise.id)
      ? list.filter(e => e.id !== exercise.id)
      : [...list, exercise]));
  };

  const order = (id) => selected.findIndex(e => e.id === id) + 1;

  return (
    <div className={styles.picker}>
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

      <div className={styles.filtersWrap}>
        <ExerciseFilters filters={filters} exercises={exercises} />
      </div>

      {loadError && !exercises && (
        <div className={styles.state}>
          <p>Não foi possível carregar os exercícios.</p>
          <button type="button" className={styles.retry} onClick={onRetry}>Tentar de novo</button>
        </div>
      )}

      {!exercises && !loadError && <div className={styles.state} aria-busy="true">Carregando exercícios…</div>}

      {exercises && visible.length === 0 && (
        <div className={styles.state}>
          <p>Nenhum exercício encontrado.</p>
          <Link href="/gym/exercises" className={styles.link}>Cadastrar na biblioteca</Link>
        </div>
      )}

      <ul key={signature} className={styles.list}>
        {families.map((family, index) => {
          const first = family.variants[0];
          const many = family.variants.length > 1;
          const chosen = family.variants.filter(variant => order(variant.id));
          const position = !many ? order(first.id) : 0;
          const open = many && expanded === family.key;
          const details = (
            <span className={styles.itemText}>
              <span className={styles.itemName}>{family.name}</span>
              <span className={styles.itemMeta}>
                {muscle ? `${ROLE_LABEL[roleOf(first)]} · ${groupsLabel(first)}` : groupsLabel(first)}
              </span>
              <span className={`${styles.itemMeta} ${styles.itemEquipment}`}>
                {many
                  ? family.variants.map((variant, i) => (
                    <span key={variant.id}>
                      {i > 0 && ' · '}
                      <span className={order(variant.id) ? styles.equipmentChosen : undefined}>{equipmentLabel(variant.equipment)}</span>
                    </span>
                  ))
                  : equipmentLabel(first.equipment)}
                {family.variants.every(variant => variant.is_unilateral) && <>{' '}<UnilateralTag /></>}
              </span>
            </span>
          );
          return (
            <li key={family.key} className={styles.row} style={{ '--i': Math.min(index, 14) }}>
              {many ? (
                <div className={`${styles.family} ${chosen.length ? styles.familySelected : ''} ${open ? styles.familyOpen : ''}`}>
                  <button
                    type="button"
                    className={styles.familyHead}
                    aria-expanded={open}
                    onClick={() => setExpanded(current => (current === family.key ? null : family.key))}
                  >
                    {details}
                    <ChevronDown size={18} className={`${styles.expand} ${open ? styles.expandOpen : ''}`} aria-hidden="true" />
                  </button>
                  <div className={styles.drawer} inert={!open}>
                    <div className={styles.drawerInner}>
                      <div className={styles.equipments} role="group" aria-label={`Equipamento para ${family.name}`}>
                        {family.variants.map(variant => {
                          const variantPosition = order(variant.id);
                          return (
                            <button
                              key={variant.id}
                              type="button"
                              className={`${styles.equipment} ${variantPosition ? styles.equipmentOn : ''}`}
                              aria-pressed={!!variantPosition}
                              onClick={() => toggle(variant)}
                            >
                              <span className={styles.equipmentName}>{equipmentLabel(variant.equipment)}</span>
                              <span className={styles.equipmentMark} aria-hidden="true">
                                {variantPosition > 0 && (selected.length > 1
                                  ? <span className={styles.equipmentOrder}>{variantPosition}</span>
                                  : <Check size={16} strokeWidth={2.8} />)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={`${styles.item} ${position ? styles.itemSelected : ''}`}
                  aria-pressed={!!position}
                  onClick={() => toggle(first)}
                >
                  {details}
                  <span className={styles.check} aria-hidden="true">
                    {position ? (selected.length > 1 ? position : <Check size={16} strokeWidth={3} />) : null}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {!single && (
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.confirm}
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}
          >
            {selected.length ? `Adicionar ${plural(selected.length, 'exercício', 'exercícios')}` : 'Selecione exercícios'}
          </button>
        </div>
      )}
    </div>
  );
}
