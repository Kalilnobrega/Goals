'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search, X, Check } from 'lucide-react';
import { muscleLabel, equipmentLabel, plural } from '../../lib/gym';
import ExerciseFilters, { ROLE_LABEL, useExerciseFilters } from './ExerciseFilters';
import UnilateralTag from './UnilateralTag';
import styles from './ExercisePicker.module.css';

export default function ExercisePicker({ exercises, loadError, onRetry, onConfirm, single = false }) {
  const filters = useExerciseFilters(exercises);
  const { query, setQuery, muscle, roleOf, visible, signature } = filters;
  const [selected, setSelected] = useState([]);

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
        {visible.map((exercise, index) => {
          const position = order(exercise.id);
          return (
            <li key={exercise.id} className={styles.row} style={{ '--i': Math.min(index, 14) }}>
              <button
                type="button"
                className={`${styles.item} ${position ? styles.itemSelected : ''}`}
                aria-pressed={!!position}
                onClick={() => toggle(exercise)}
              >
                <span className={styles.itemText}>
                  <span className={styles.itemName}>{exercise.name}</span>
                  <span className={styles.itemMeta}>
                    {muscle ? ROLE_LABEL[roleOf(exercise)] : muscleLabel(exercise.muscle_group)} · {equipmentLabel(exercise.equipment)}
                    {exercise.is_unilateral && <>{' '}<UnilateralTag /></>}
                  </span>
                </span>
                <span className={styles.check} aria-hidden="true">
                  {position ? (selected.length > 1 ? position : <Check size={16} strokeWidth={3} />) : null}
                </span>
              </button>
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
