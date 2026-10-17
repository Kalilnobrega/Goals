'use client';
import { useState } from 'react';
import { Users, Trophy } from 'lucide-react';
import f from '../styles/forms.module.css';

const KINDS = [
  {
    key: 'collaborative',
    icon: Users,
    title: 'Colaborativa',
    desc: 'Uma meta só, com progresso de todos juntos. O que alguém marca vale para o grupo.',
  },
  {
    key: 'challenge',
    icon: Trophy,
    title: 'Desafio',
    desc: 'Cada pessoa recebe uma cópia e tem o próprio progresso. Vocês competem no ranking.',
  },
];

export default function ShareGoalForm({ onSubmit, onCancel, loading }) {
  const [kind, setKind] = useState('collaborative');

  return (
    <form
      className={f.form}
      onSubmit={(e) => { e.preventDefault(); onSubmit(kind); }}
    >
      <div className={f.field}>
        <label className={f.label}>Tipo de compartilhamento</label>
        <div className={`${f.typeGrid} ${f.typeGridWide}`}>
          {KINDS.map(({ key, icon: Icon, title, desc }) => (
            <button
              key={key}
              type="button"
              className={`${f.typeCard} ${kind === key ? f.typeCardActive : ''}`}
              onClick={() => setKind(key)}
              aria-pressed={kind === key}
            >
              <Icon size={22} className={f.typeIcon} />
              <span className={f.typeTitle}>{title}</span>
              <span className={f.typeDesc}>{desc}</span>
            </button>
          ))}
        </div>
        <p className={f.hint}>
          Você vira o líder: só você e os moderadores que escolher podem editar a meta e as tarefas. O tipo não pode ser mudado depois.
        </p>
      </div>

      <div className={f.submitRow}>
        <button type="button" className={f.btnCancel} onClick={onCancel}>Cancelar</button>
        <button type="submit" className={f.btnSubmit} disabled={loading}>
          {loading ? 'Compartilhando...' : 'Compartilhar'}
        </button>
      </div>
    </form>
  );
}
