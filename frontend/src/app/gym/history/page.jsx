'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { History, Search, X, ChevronDown, SearchX } from 'lucide-react';
import { getHistory, getWorkouts, peekCache, HISTORY_PAGE } from '../../../lib/api';
import {
  addDays, formatDay, formatDuration, formatMonth, formatVolume, formatWeekday, monthKey, muscleLabel, plural, todayIso,
  MUSCLE_GROUPS,
} from '../../../lib/gym';
import ActiveSessionBanner from '../../../components/gym/ActiveSessionBanner';
import GymSheet from '../../../components/gym/GymSheet';
import sheetStyles from '../../../components/gym/sheet.module.css';
import styles from './page.module.css';

const PERIODS = [
  { key: 'all', label: 'Tudo' },
  { key: '7', label: 'Últimos 7 dias', days: 7 },
  { key: '30', label: 'Últimos 30 dias', days: 30 },
  { key: '90', label: 'Últimos 3 meses', days: 90 },
  { key: 'year', label: 'Este ano' },
  { key: 'custom', label: 'Escolher datas' },
];

const BODY_GROUPS = MUSCLE_GROUPS.filter(group => !['cardio', 'other'].includes(group.value));

function periodRange(period, custom) {
  const today = todayIso();
  if (period === 'year') return { date_from: `${today.slice(0, 4)}-01-01`, date_to: null };
  if (period === 'custom') return { date_from: custom.from || null, date_to: custom.to || null };
  const option = PERIODS.find(p => p.key === period);
  return option?.days ? { date_from: addDays(today, -(option.days - 1)), date_to: null } : { date_from: null, date_to: null };
}

function periodLabel(period, custom) {
  if (period !== 'custom') return PERIODS.find(p => p.key === period).label;
  if (custom.from && custom.to) return `${formatDay(custom.from)} – ${formatDay(custom.to)}`;
  if (custom.from) return `Desde ${formatDay(custom.from)}`;
  if (custom.to) return `Até ${formatDay(custom.to)}`;
  return 'Período';
}

function groupByMonth(items) {
  const groups = [];
  items.forEach(item => {
    const key = monthKey(item.started_at);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: formatMonth(item.started_at), items: [item] });
  });
  return groups;
}

function HistoryCard({ item }) {
  const duration = new Date(item.completed_at) - new Date(item.started_at);
  const muscles = item.muscle_groups.slice(0, 3);
  const extra = item.muscle_groups.length - muscles.length;

  return (
    <li>
      <Link href={`/gym/history/${item.id}`} className={styles.card}>
        <span className={styles.day}>
          <span className={styles.dayNumber}>{new Date(item.started_at).getDate()}</span>
          <span className={styles.dayName}>{formatWeekday(item.started_at)}</span>
        </span>
        <span className={styles.cardMain}>
          <span className={styles.cardName}>{item.name}</span>
          <span className={styles.cardMeta}>
            {formatDuration(duration)} · {plural(item.exercise_count, 'exercício', 'exercícios')} · {plural(item.total_sets, 'série', 'séries')}
          </span>
          <span className={styles.cardBottom}>
            <span className={styles.muscles}>
              {muscles.map(group => <span key={group} className={styles.muscle}>{muscleLabel(group)}</span>)}
              {extra > 0 && <span className={styles.muscle}>+{extra}</span>}
            </span>
            <span className={styles.volume}>{formatVolume(item.volume_kg)}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function HistoryPage() {
  const [data, setData] = useState(() => peekCache('fitnessHistory') ?? null);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [workout, setWorkout] = useState(null);
  const [group, setGroup] = useState(null);
  const [period, setPeriod] = useState('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [sheet, setSheet] = useState(null);
  const [workouts, setWorkouts] = useState(() => peekCache('fitnessWorkouts') ?? null);
  const request = useRef(0);

  const filters = {
    q: search.trim() || null,
    workout_id: workout?.id ?? null,
    muscle_group: group,
    ...periodRange(period, custom),
  };
  const filtersKey = JSON.stringify(filters);
  const filtered = Object.values(filters).some(value => value !== null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchFirst = useCallback(() => {
    const id = ++request.current;
    setLoadError(false);
    return getHistory(0, JSON.parse(filtersKey))
      .then(result => { if (id === request.current) setData(result); })
      .catch(() => { if (id === request.current) setLoadError(true); });
  }, [filtersKey]);

  useEffect(() => {
    const id = ++request.current;
    getHistory(0, JSON.parse(filtersKey))
      .then(result => { if (id === request.current) { setData(result); setLoadError(false); } })
      .catch(() => { if (id === request.current) setLoadError(true); });
  }, [filtersKey]);

  const openSheet = (type) => {
    if (type === 'workout') getWorkouts().then(setWorkouts).catch(() => {});
    setSheet(type);
  };
  const closeSheet = useCallback(() => setSheet(null), []);

  const clearAll = () => {
    setQuery('');
    setSearch('');
    setWorkout(null);
    setGroup(null);
    setPeriod('all');
    setCustom({ from: '', to: '' });
  };

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await getHistory(data.items.length, JSON.parse(filtersKey));
      setData(current => {
        const seen = new Set(current.items.map(item => item.id));
        return { ...page, items: [...current.items, ...page.items.filter(item => !seen.has(item.id))] };
      });
    } catch {
      setMoreError(true);
    }
    setLoadingMore(false);
  };

  const groups = data ? groupByMonth(data.items) : [];
  const chips = [
    { key: 'workout', label: workout ? workout.name : 'Ficha', active: !!workout, clear: () => setWorkout(null) },
    { key: 'group', label: group ? muscleLabel(group) : 'Grupo muscular', active: !!group, clear: () => setGroup(null) },
    { key: 'period', label: period === 'all' ? 'Período' : periodLabel(period, custom), active: period !== 'all', clear: () => { setPeriod('all'); setCustom({ from: '', to: '' }); } },
  ];

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Histórico</h1>
        <p className={styles.subtitle}>
          {data
            ? filtered
              ? plural(data.total, 'treino encontrado', 'treinos encontrados')
              : data.total ? plural(data.total, 'treino concluído', 'treinos concluídos') : 'Seus treinos concluídos'
            : 'Seus treinos concluídos'}
        </p>
      </header>

      <ActiveSessionBanner />

      <div className={styles.searchBox}>
        <Search size={18} className={styles.searchIcon} aria-hidden="true" />
        <input
          type="search"
          className={styles.search}
          placeholder="Buscar treino ou exercício"
          value={query}
          onChange={e => setQuery(e.target.value.slice(0, 60))}
          aria-label="Buscar treino ou exercício"
          enterKeyHint="search"
        />
        {query && (
          <button type="button" className={styles.searchClear} onClick={() => setQuery('')} aria-label="Limpar busca">
            <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.filters} role="group" aria-label="Filtros">
        {chips.map(chip => (
          <span key={chip.key} className={`${styles.filter} ${chip.active ? styles.filterActive : ''}`}>
            <button type="button" className={styles.filterMain} onClick={() => openSheet(chip.key)}>
              {chip.label}
              {!chip.active && <ChevronDown size={15} aria-hidden="true" />}
            </button>
            {chip.active && (
              <button type="button" className={styles.filterClear} onClick={chip.clear} aria-label={`Remover filtro ${chip.label}`}>
                <X size={14} />
              </button>
            )}
          </span>
        ))}
        {filtered && (
          <button type="button" className={styles.clearAll} onClick={clearAll}>Limpar</button>
        )}
      </div>

      {loadError && !data && (
        <div className={styles.state}>
          <p className={styles.stateTitle}>Não foi possível carregar o histórico.</p>
          <button type="button" className={styles.stateAction} onClick={fetchFirst}>Tentar de novo</button>
        </div>
      )}

      {!data && !loadError && (
        <div className={styles.skeletonList} aria-busy="true" aria-label="Carregando histórico">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.skeleton} />)}
        </div>
      )}

      {data?.items.length === 0 && !filtered && (
        <div className={styles.state}>
          <History size={34} className={styles.stateIcon} aria-hidden="true" />
          <p className={styles.stateTitle}>Nenhum treino concluído ainda.</p>
          <p className={styles.stateText}>Quando você finalizar um treino, ele aparece aqui com as séries, cargas e o volume.</p>
          <Link href="/gym/workouts" className={styles.stateAction}>Começar um treino</Link>
        </div>
      )}

      {data?.items.length === 0 && filtered && (
        <div className={styles.state}>
          <SearchX size={32} className={styles.stateIcon} aria-hidden="true" />
          <p className={styles.stateTitle}>Nenhum treino com esses filtros.</p>
          <button type="button" className={styles.stateAction} onClick={clearAll}>Limpar filtros</button>
        </div>
      )}

      {groups.map(month => (
        <section key={month.key} className={styles.month}>
          <h2 className={styles.monthTitle}>
            {month.label}
            <span>{plural(month.items.length, 'treino', 'treinos')}</span>
          </h2>
          <ul className={styles.list}>
            {month.items.map(item => <HistoryCard key={item.id} item={item} />)}
          </ul>
        </section>
      ))}

      {data?.has_more && (
        <button type="button" className={styles.more} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Carregando…' : moreError ? 'Tentar de novo' : `Ver mais ${Math.min(HISTORY_PAGE, data.total - data.items.length)}`}
        </button>
      )}

      <GymSheet
        open={!!sheet}
        onClose={closeSheet}
        title={{ workout: 'Filtrar por ficha', group: 'Filtrar por grupo muscular', period: 'Filtrar por período' }[sheet] ?? ''}
      >
        {sheet === 'workout' && (
          <div className={sheetStyles.actions}>
            <button type="button" className={`${sheetStyles.option} ${!workout ? styles.optionActive : ''}`} onClick={() => { setWorkout(null); closeSheet(); }}>
              <span>Todas as fichas</span>
            </button>
            {!workouts && <p className={sheetStyles.text}>Carregando fichas…</p>}
            {workouts?.map(item => (
              <button
                key={item.id}
                type="button"
                className={`${sheetStyles.option} ${workout?.id === item.id ? styles.optionActive : ''}`}
                onClick={() => { setWorkout({ id: item.id, name: item.name }); closeSheet(); }}
              >
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        )}

        {sheet === 'group' && (
          <div className={sheetStyles.chips}>
            <button type="button" className={`${sheetStyles.chip} ${!group ? sheetStyles.chipActive : ''}`} onClick={() => { setGroup(null); closeSheet(); }}>
              Todos
            </button>
            {BODY_GROUPS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`${sheetStyles.chip} ${group === option.value ? sheetStyles.chipActive : ''}`}
                onClick={() => { setGroup(option.value); closeSheet(); }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {sheet === 'period' && (
          <div className={sheetStyles.stack}>
            <div className={sheetStyles.actions}>
              {PERIODS.map(option => (
                <button
                  key={option.key}
                  type="button"
                  className={`${sheetStyles.option} ${period === option.key ? styles.optionActive : ''}`}
                  onClick={() => { setPeriod(option.key); if (option.key !== 'custom') closeSheet(); }}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className={styles.dates}>
                <label className={styles.dateField}>
                  <span>De</span>
                  <input type="date" value={custom.from} max={custom.to || todayIso()} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
                </label>
                <label className={styles.dateField}>
                  <span>Até</span>
                  <input type="date" value={custom.to} min={custom.from || undefined} max={todayIso()} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
                </label>
                <button type="button" className={sheetStyles.primary} onClick={closeSheet}>Aplicar</button>
              </div>
            )}
          </div>
        )}
      </GymSheet>
    </div>
  );
}
