'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { STATUS_SECTIONS } from './GoalSections';
import f from '../styles/forms.module.css';
import styles from './SuperGoal.module.css';

const STATUS_COLOR = Object.fromEntries(STATUS_SECTIONS.map(s => [s.status, s.color]));

export default function SuperGoalForm({
  initialTitle = '',
  showTitle = true,
  goals,
  superGoals = [],
  currentSuperGoalId = null,
  submitLabel,
  onSubmit,
  onCancel,
  loading,
}) {
  const [title, setTitle] = useState(initialTitle);
  const [selected, setSelected] = useState([]);
  const titles = Object.fromEntries(superGoals.map(sg => [sg.id, sg.title]));

  const toggle = (id) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const canSubmit = showTitle ? title.trim().length > 0 : selected.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ title: title.trim(), goal_ids: selected });
  };

  return (
    <form className={f.form} onSubmit={handleSubmit}>
      {showTitle && (
        <div className={f.field}>
          <label className={f.label}>Nome *</label>
          <input
            className={f.input}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Vida saudável"
            maxLength={60}
            autoFocus
            required
          />
        </div>
      )}

      <div className={f.field}>
        <label className={f.label}>{showTitle ? 'Metas (opcional)' : 'Escolha as metas'}</label>
        {goals.length === 0 ? (
          <p className={f.hint}>Não há metas disponíveis para adicionar.</p>
        ) : (
          <div className={styles.pickList}>
            {goals.map(goal => {
              const checked = selected.includes(goal.id);
              const elsewhere = goal.super_goal_id != null && goal.super_goal_id !== currentSuperGoalId;
              return (
                <button
                  type="button"
                  key={goal.id}
                  className={`${styles.pickItem} ${checked ? styles.pickItemActive : ''}`}
                  onClick={() => toggle(goal.id)}
                  aria-pressed={checked}
                >
                  <span className={styles.pickCheck}>{checked && <Check size={13} strokeWidth={3} />}</span>
                  <span className={styles.pickText}>
                    <span className={styles.pickTitle}>
                      <span className={styles.pickDot} style={{ '--dot': STATUS_COLOR[goal.status] }} />
                      {goal.title}
                    </span>
                    {elsewhere && (
                      <span className={styles.pickHint}>Sai de “{titles[goal.super_goal_id]}”</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={f.submitRow}>
        <button type="button" className={f.btnCancel} onClick={onCancel}>Cancelar</button>
        <button type="submit" className={f.btnSubmit} disabled={loading || !canSubmit}>
          {loading ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
