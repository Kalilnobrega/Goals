'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X, Check } from 'lucide-react';
import { MUSCLE_GROUPS, muscleLabel, equipmentLabel, normalize, plural } from '../../lib/gym';
import styles from './ExercisePicker.module.css';

const FILTERS = [{ value: 'all', label: 'Todos' }, ...MUSCLE_GROUPS];

export default function ExercisePicker({ exercises, loadError, onRetry, onConfirm }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState([]);

  const visible = useMemo(() => {
    if (!exercises) return [];
    const term = normalize(query);
    return exercises
      .filter(e => filter === 'all' || e.muscle_group === filter)
      .filter(e => !term || normalize(e.name).includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [exercises, query, filter]);

  const toggle = (exercise) => {
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

      <ul className={styles.list}>
        {visible.map(exercise => {
          const position = order(exercise.id);
          return (
            <li key={exercise.id}>
              <button
                type="button"
                className={`${styles.item} ${position ? styles.itemSelected : ''}`}
                aria-pressed={!!position}
                onClick={() => toggle(exercise)}
              >
                <span className={styles.itemText}>
                  <span className={styles.itemName}>{exercise.name}</span>
                  <span className={styles.itemMeta}>
                    {muscleLabel(exercise.muscle_group)} · {equipmentLabel(exercise.equipment)}
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
    </div>
  );
}
