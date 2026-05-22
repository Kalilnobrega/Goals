'use client';
import { useState } from 'react';
import f from '../styles/forms.module.css';

export default function GoalForm({ initial = {}, onSubmit, onCancel, loading }) {
  const isEdit = !!initial.id;

  const [form, setForm] = useState({
    title:       initial.title       || '',
    description: initial.description || '',
    status:      initial.status      || 'open',
    deadline:    initial.deadline    ? initial.deadline.split('T')[0] : '',
  });

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      title:       form.title,
      description: form.description || null,
      deadline:    form.deadline    || null,
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
          <label className={f.label}>Prazo</label>
          <input
            type="date"
            className={f.input}
            value={form.deadline}
            onChange={set('deadline')}
          />
        </div>
      </div>

      <div className={f.submitRow}>
        <button type="button" className={f.btnCancel} onClick={onCancel}>Cancelar</button>
        <button type="submit" className={f.btnSubmit} disabled={loading}>
          {loading ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar meta'}
        </button>
      </div>
    </form>
  );
}