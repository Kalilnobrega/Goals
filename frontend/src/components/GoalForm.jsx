'use client';
import { useState } from 'react';
import { formatDeadline } from '../lib/date';
import f from '../styles/forms.module.css';

const CYCLE_PRESETS = [
  { value: '1',  label: 'Dia'   },
  { value: '7',  label: 'Semana'  },
  { value: '30', label: 'Mês'   },
  { value: 'custom', label: 'Personalizado' },
];

function parseDateOnly(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateOnly(date) {
  return date.toISOString().split('T')[0];
}

function addDaysToDateOnly(dateOnlyStr, days) {
  return formatDateOnly(new Date(parseDateOnly(dateOnlyStr).getTime() + days * 86400000));
}

function daysBetweenDateOnly(fromStr, toStr) {
  return Math.round((parseDateOnly(toStr) - parseDateOnly(fromStr)) / 86400000);
}

function todayDateOnly() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function GoalForm({ initial = {}, onSubmit, onCancel, loading }) {
  const isEdit = !!initial.id;
  const initialInterval = initial.recurrence_interval_days || null;
  const initialIsPreset = initialInterval && CYCLE_PRESETS.some(p => p.value === String(initialInterval));
  const initialDeadline = initial.deadline ? initial.deadline.split('T')[0] : '';
  const cycleBaseDate = initial.cycle_start_date ? initial.cycle_start_date.split('T')[0] : todayDateOnly();
  const initialCycleCount = (initial.is_recurring && initialDeadline && initialInterval)
    ? (() => {
        const days = daysBetweenDateOnly(cycleBaseDate, initialDeadline);
        return days > 0 ? String(Math.max(1, Math.floor(days / initialInterval))) : '';
      })()
    : '';

  const [form, setForm] = useState({
    title:       initial.title       || '',
    description: initial.description || '',
    status:      initial.status      || 'open',
    deadline:    initialDeadline,
    is_recurring: initial.is_recurring ?? false,
    cyclePreset: initialInterval
      ? (initialIsPreset ? String(initialInterval) : 'custom')
      : '7',
    recurrence_interval_days: initialInterval || 7,
    recurrence_target: initial.recurrence_target || initial.total_tasks || 1,
    cycleCount: initialCycleCount,
  });

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleDeadlineChange = (e) => {
    const value = e.target.value;
    setForm(prev => {
      const next = { ...prev, deadline: value };
      if (prev.is_recurring && value && prev.recurrence_interval_days) {
        const days = daysBetweenDateOnly(cycleBaseDate, value);
        next.cycleCount = days > 0 ? String(Math.max(1, Math.floor(days / Number(prev.recurrence_interval_days)))) : '';
      }
      return next;
    });
  };

  const handleCycleCountChange = (e) => {
    const value = e.target.value;
    setForm(prev => {
      const next = { ...prev, cycleCount: value };
      if (value && Number(value) > 0 && prev.recurrence_interval_days) {
        next.deadline = addDaysToDateOnly(cycleBaseDate, Number(value) * Number(prev.recurrence_interval_days));
      }
      return next;
    });
  };

  const handleIntervalDaysChange = (e) => {
    const value = e.target.value;
    setForm(prev => {
      const next = { ...prev, recurrence_interval_days: value };
      if (prev.cycleCount && Number(prev.cycleCount) > 0 && value) {
        next.deadline = addDaysToDateOnly(cycleBaseDate, Number(prev.cycleCount) * Number(value));
      }
      return next;
    });
  };

  const handleCyclePresetChange = (e) => {
    const preset = e.target.value;
    setForm(prev => {
      const interval = preset === 'custom' ? prev.recurrence_interval_days : Number(preset);
      const next = { ...prev, cyclePreset: preset, recurrence_interval_days: interval };
      if (prev.cycleCount && Number(prev.cycleCount) > 0 && interval) {
        next.deadline = addDaysToDateOnly(cycleBaseDate, Number(prev.cycleCount) * Number(interval));
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      title:       form.title,
      description: form.description || null,
      deadline:    form.deadline    || null,
      is_recurring: form.is_recurring,
      recurrence_interval_days: form.is_recurring ? Number(form.recurrence_interval_days) : null,
      recurrence_target: form.is_recurring ? Number(form.recurrence_target) || 1 : null,
    };

    if (isEdit) data.status = form.status;
    onSubmit(data);
  };

  return (
    <form className={f.form} onSubmit={handleSubmit}>
      <div className={f.field}>
        <label className={f.label}>Título *</label>
        <input
          className={f.input}
          value={form.title}
          onChange={set('title')}
          placeholder="Ex: Aprender Next.js"
          required
        />
      </div>

      <div className={f.field}>
        <label className={f.label}>Descrição</label>
        <textarea
          className={f.textarea}
          value={form.description}
          onChange={set('description')}
          placeholder="Descreva sua meta..."
        />
      </div>

      <div className={f.row}>
        {/* Status só no modo edição */}
        {isEdit && (
          <div className={f.field}>
            <label className={f.label}>Status</label>
            <select className={f.select} value={form.status} onChange={set('status')}>
              <option value="open">Em aberto</option>
              <option value="completed">Concluída</option>
              <option value="late">Atrasada</option>
            </select>
          </div>
        )}

        <div className={f.field}>
          <label className={f.label}>Prazo (Opcional)</label>
          <input
            type="date"
            className={f.input}
            value={form.deadline}
            onChange={handleDeadlineChange}
          />
          {form.is_recurring && form.deadline && form.cycleCount && (
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              ≈ {form.cycleCount} ciclo{form.cycleCount !== '1' ? 's' : ''} até lá
            </span>
          )}
        </div>
      </div>

      <div className={f.field}>
        <label className={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', fontSize: '0.875rem' }}>
          <input
            type="checkbox"
            checked={form.is_recurring}
            onChange={e => setForm(prev => ({ ...prev, is_recurring: e.target.checked }))}
          />
          É uma meta recorrente? (ex: treinar 4x por semana)
        </label>
      </div>

      {form.is_recurring && (
        <>
          <div className={f.row}>
            <div className={f.field}>
              <label className={f.label}>Ciclo se repete a cada</label>
              <select
                className={f.select}
                value={form.cyclePreset}
                onChange={handleCyclePresetChange}
              >
                {CYCLE_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {form.cyclePreset === 'custom' && (
              <div className={f.field}>
                <label className={f.label}>Dias por ciclo</label>
                <input
                  type="number"
                  min="1"
                  className={f.input}
                  placeholder="Ex: 14"
                  value={form.recurrence_interval_days}
                  onChange={handleIntervalDaysChange}
                />
              </div>
            )}
          </div>

          <div className={f.field}>
            <label className={f.label}>Tarefas por ciclo</label>
            <input
              type="number"
              min="1"
              className={f.input}
              placeholder="Ex: 4"
              value={form.recurrence_target}
              onChange={set('recurrence_target')}
            />
            {initial.total_tasks > 0 && (
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Sugestão baseada nas {initial.total_tasks} tarefa{initial.total_tasks !== 1 ? 's' : ''} atuais da meta — ajuste se quiser.
              </span>
            )}
          </div>

          <div className={f.field}>
            <label className={f.label}>Termina depois de quantos ciclos (Opcional)</label>
            <input
              type="number"
              min="1"
              className={f.input}
              placeholder="Ex: 2"
              value={form.cycleCount}
              onChange={handleCycleCountChange}
            />
            {form.cycleCount && form.deadline && (
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Termina em {formatDeadline(form.deadline)}
              </span>
            )}
          </div>
        </>
      )}

      <div className={f.submitRow}>
        <button type="button" className={f.btnCancel} onClick={onCancel}>Cancelar</button>
        <button type="submit" className={f.btnSubmit} disabled={loading}>
          {loading ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar meta'}
        </button>
      </div>
    </form>
  );
}