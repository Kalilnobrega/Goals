'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import styles from './ActivityHeatmap.module.css';

const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const ROW_LABELS = ['Seg', '', 'Qua', '', 'Sex', '', ''];
const LEVELS = [0, 1, 2, 3, 4];

function parseDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function levelFor(count) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

function countText(tasks, entries) {
  const parts = [];
  if (tasks) parts.push(`${tasks} tarefa${tasks > 1 ? 's' : ''}`);
  if (entries) parts.push(`${entries} registro${entries > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

function describe(day) {
  const total = day.tasks + day.entries;
  const date = parseDay(day.date).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC',
  });
  return { date, text: total ? countText(day.tasks, day.entries) : 'Nenhuma atividade' };
}

function filterDay(day, goalId) {
  const goals = day.goals || [];
  const completed = day.completed_goals || [];
  if (goalId === 'all') return { ...day, goals, completed_goals: completed };
  const match = goals.find(g => g.goal_id === goalId);
  return {
    date: day.date,
    tasks: match?.tasks || 0,
    entries: match?.entries || 0,
    goals: match ? [match] : [],
    completed_goals: completed.filter(id => id === goalId),
  };
}

export default function ActivityHeatmap({ days, goals = [] }) {
  const scrollRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [goalId, setGoalId] = useState('all');

  const goalTitles = useMemo(() => Object.fromEntries(goals.map(g => [g.id, g.title])), [goals]);

  const goalOptions = useMemo(() => {
    const seen = new Set();
    days.forEach(day => {
      (day.goals || []).forEach(g => seen.add(g.goal_id));
      (day.completed_goals || []).forEach(id => seen.add(id));
    });
    return goals.filter(g => seen.has(g.id));
  }, [days, goals]);

  const visibleDays = useMemo(() => days.map(day => filterDay(day, goalId)), [days, goalId]);

  const { weeks, monthLabels } = useMemo(() => {
    if (!visibleDays.length) return { weeks: [], monthLabels: [] };
    const offset = (parseDay(visibleDays[0].date).getUTCDay() + 6) % 7;
    const cells = [...Array(offset).fill(null), ...visibleDays];
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const monthLabels = [];
    let lastMonth = null;
    weeks.forEach((week, index) => {
      const first = week.find(Boolean);
      if (!first) return;
      const month = parseDay(first.date).getUTCMonth();
      if (month !== lastMonth) {
        if (index > 0 || offset < 4) monthLabels.push({ index, label: MONTHS[month] });
        lastMonth = month;
      }
    });
    return { weeks, monthLabels };
  }, [visibleDays]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [weeks]);

  const showTooltip = (event, day) => {
    const wrap = event.currentTarget.closest(`.${styles.wrap}`).getBoundingClientRect();
    const cell = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(cell.left - wrap.left + cell.width / 2, 110), wrap.width - 110);
    setHover({ day, x, y: cell.top - wrap.top });
  };

  const tooltip = hover && describe(hover.day);

  const filteredTotals = useMemo(() => visibleDays.reduce(
    (acc, day) => ({
      activities: acc.activities + day.tasks + day.entries,
      completed: acc.completed + day.completed_goals.length,
    }),
    { activities: 0, completed: 0 },
  ), [visibleDays]);

  return (
    <div className={styles.wrap} onMouseLeave={() => setHover(null)}>
      {goalOptions.length > 0 && (
        <div className={styles.toolbar}>
          <select
            className={styles.filter}
            value={goalId}
            onChange={e => {
              setHover(null);
              setGoalId(e.target.value === 'all' ? 'all' : Number(e.target.value));
            }}
            aria-label="Filtrar atividade por meta"
          >
            <option value="all">Todas as metas</option>
            {goalOptions.map(g => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
          {goalId !== 'all' && (
            <span className={styles.filterSummary}>
              {filteredTotals.activities} atividade{filteredTotals.activities !== 1 ? 's' : ''} no período
              {filteredTotals.completed > 0 && ' · concluída'}
            </span>
          )}
        </div>
      )}

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.grid} style={{ '--weeks': weeks.length }}>
          <div className={styles.months}>
            {monthLabels.map(m => (
              <span key={m.index} style={{ gridColumn: m.index + 1 }}>{m.label}</span>
            ))}
          </div>
          <div className={styles.rowLabels}>
            {ROW_LABELS.map((label, i) => <span key={i}>{label}</span>)}
          </div>
          <div className={styles.cells}>
            {weeks.map((week, w) => (
              <div key={w} className={styles.week}>
                {Array.from({ length: 7 }).map((_, d) => {
                  const day = week[d];
                  if (!day) return <span key={d} className={styles.empty} />;
                  const level = levelFor(day.tasks + day.entries);
                  const { date, text } = describe(day);
                  const completedNames = day.completed_goals.map(id => goalTitles[id]).filter(Boolean);
                  return (
                    <span
                      key={d}
                      className={styles.cell}
                      data-level={level}
                      data-completed={day.completed_goals.length > 0 || undefined}
                      aria-label={`${date}: ${text}${completedNames.length ? ` · concluiu ${completedNames.join(', ')}` : ''}`}
                      onMouseEnter={e => showTooltip(e, day)}
                      onClick={e => showTooltip(e, day)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {tooltip && (
        <div className={styles.tooltip} style={{ left: hover.x, top: hover.y }}>
          <strong>{tooltip.text}</strong>
          {goalId === 'all' && hover.day.goals.length > 0 && (
            <ul className={styles.tooltipGoals}>
              {hover.day.goals.map(g => (
                <li key={g.goal_id}>
                  <b>{goalTitles[g.goal_id] || 'Meta'}</b>
                  <i>{countText(g.tasks, g.entries)}</i>
                </li>
              ))}
            </ul>
          )}
          {hover.day.completed_goals.map(id => (
            <em key={id} className={styles.tooltipCompleted}>
              <Trophy size={12} />
              Concluiu {goalTitles[id] || 'uma meta'}
            </em>
          ))}
          <span className={styles.tooltipDate}>{tooltip.date}</span>
        </div>
      )}

      <div className={styles.legend}>
        <span className={styles.legendCompleted}>
          <span className={styles.cell} data-level={0} data-completed />
          Meta concluída
        </span>
        <span>Menos</span>
        {LEVELS.map(level => <span key={level} className={styles.cell} data-level={level} />)}
        <span>Mais</span>
      </div>
    </div>
  );
}
