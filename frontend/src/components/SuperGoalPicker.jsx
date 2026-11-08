'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import SuperGoalIcon from './SuperGoalIcon';
import f from '../styles/forms.module.css';
import styles from './SuperGoal.module.css';
import { shakeInvalid } from '../lib/formMotion';

export default function SuperGoalPicker({ goal, superGoals, goals, onPick, onCreate, loading }) {
  const [title, setTitle] = useState('');
  const countOf = (id) => goals.filter(g => g.super_goal_id === id).length;

  const handleCreate = (e) => {
    e.preventDefault();
    if (title.trim()) onCreate(title.trim());
  };

  return (
    <div className={f.form}>
      {superGoals.length > 0 && (
        <div className={styles.pickList}>
          {superGoals.map(sg => {
            const current = sg.id === goal.super_goal_id;
            return (
              <button
                type="button"
                key={sg.id}
                className={`${styles.pickItem} ${current ? styles.pickItemActive : ''}`}
                onClick={() => onPick(sg.id)}
                disabled={current || loading}
              >
                <span className={styles.iconBadgeSm}><SuperGoalIcon size={15} /></span>
                <span className={styles.pickText}>
                  <span className={styles.pickTitle}>{sg.title}</span>
                  <span className={styles.pickHint}>
                    {current ? 'Supermeta atual' : `${countOf(sg.id)} meta${countOf(sg.id) !== 1 ? 's' : ''}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <form onInvalidCapture={shakeInvalid} className={f.field} onSubmit={handleCreate}>
        <label className={f.label}>{superGoals.length ? 'Ou crie uma nova' : 'Crie sua primeira supermeta'}</label>
        <div className={styles.inlineCreate}>
          <input
            className={f.input}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Vida saudável"
            maxLength={60}
          />
          <button type="submit" className={f.btnSubmit} disabled={loading || !title.trim()}>
            <Plus size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
