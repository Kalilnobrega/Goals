'use client';
import { useCallback, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Flag, Minus, Pencil, Target, Trash2, X } from 'lucide-react';
import { cleanKgInput, formatKg, kgInput, parseKg, parseDay, todayIso } from '../../lib/gym';
import GymSheet from './GymSheet';
import sheet from './sheet.module.css';
import styles from './TargetGoal.module.css';

const kg = (value) => `${formatKg(Math.round(value * 10) / 10)} kg`;
const longDate = (iso) => parseDay(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDate = (iso) => parseDay(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

function Forecast({ goal, dataWord }) {
  const weekly = (perDay) => kg(Math.abs(perDay * 7));

  if (goal.status === 'reached') {
    return <p className={`${styles.forecast} ${styles.good}`}><CheckCircle2 size={15} /> Meta alcançada!</p>;
  }
  if (goal.status === 'no_data') {
    return <p className={styles.forecast}><CircleDashed size={15} /> Registre mais {dataWord} para ver a previsão.</p>;
  }
  if (goal.status === 'no_trend') {
    return <p className={`${styles.forecast} ${styles.bad}`}><Minus size={15} /> Sem avanço em direção à meta até agora.</p>;
  }
  if (goal.status === 'on_track') {
    return (
      <p className={`${styles.forecast} ${styles.good}`}>
        <Target size={15} />
        <span>
          No ritmo atual (~{weekly(goal.rate_per_day)}/semana), você chega lá em <strong>{longDate(goal.eta)}</strong>
          {goal.deadline && <>, antes do prazo</>}.
        </span>
      </p>
    );
  }
  return (
    <p className={`${styles.forecast} ${styles.bad}`}>
      <AlertTriangle size={15} />
      <span>
        No ritmo atual (~{weekly(goal.rate_per_day)}/semana), você chega lá só em <strong>{longDate(goal.eta)}</strong>, depois do prazo.
        {goal.needed_per_day !== null && <> Para cumprir, precisa de ~{weekly(goal.needed_per_day)}/semana.</>}
      </span>
    </p>
  );
}

function GoalForm({ goal, suggestion, unitHint, onSubmit, onDelete }) {
  const [target, setTarget] = useState(goal ? kgInput(goal.target_kg) : suggestion ? kgInput(suggestion) : '');
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const value = parseKg(target);
    if (value === null || value <= 0) return setError(`Informe a meta em kg, ex.: ${unitHint}.`);
    if (deadline && deadline < todayIso()) return setError('O prazo não pode ser no passado.');
    setError('');
    setSaving(true);
    const problem = await onSubmit({ target_kg: value, deadline: deadline || null });
    setSaving(false);
    if (problem) setError(problem);
  };

  return (
    <form className={sheet.stack} onSubmit={submit} noValidate>
      <label className={styles.field}>
        <span className={styles.label}>Meta</span>
        <span className={styles.inputWrap}>
          <input
            className={styles.input}
            value={target}
            onChange={e => setTarget(cleanKgInput(e.target.value))}
            inputMode="decimal"
            placeholder={unitHint}
            autoFocus
          />
          <span className={styles.unit}>kg</span>
        </span>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Prazo <em>opcional</em></span>
        <span className={styles.inputWrap}>
          <input
            type="date"
            className={styles.input}
            value={deadline}
            min={todayIso()}
            onChange={e => setDeadline(e.target.value)}
          />
          {deadline && (
            <button type="button" className={styles.clearDate} onClick={() => setDeadline('')} aria-label="Remover prazo">
              <X size={16} />
            </button>
          )}
        </span>
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={sheet.actions}>
        <button type="submit" className={sheet.primary} disabled={saving}>
          {saving ? 'Salvando…' : goal ? 'Salvar meta' : 'Definir meta'}
        </button>
        {goal && (
          <button type="button" className={sheet.danger} onClick={onDelete} disabled={saving}>
            <Trash2 size={18} /> Remover meta
          </button>
        )}
      </div>
    </form>
  );
}

export default function TargetGoal({ goal, title, addLabel, addText, dataWord, suggestion, unitHint = '75', onSave, onDelete }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const submit = async (data) => {
    const problem = await onSave(data);
    if (!problem) setOpen(false);
    return problem;
  };

  const remove = async () => {
    const ok = await onDelete();
    if (ok) setOpen(false);
  };

  const formSheet = (
    <GymSheet open={open} onClose={close} title={title}>
      {open && <GoalForm goal={goal} suggestion={suggestion} unitHint={unitHint} onSubmit={submit} onDelete={remove} />}
    </GymSheet>
  );

  if (!goal) {
    return (
      <>
        <button type="button" className={styles.empty} onClick={() => setOpen(true)}>
          <span className={styles.emptyIcon}><Flag size={18} /></span>
          <span className={styles.emptyText}>
            <strong>{addLabel}</strong>
            <span>{addText}</span>
          </span>
        </button>
        {formSheet}
      </>
    );
  }

  const remaining = goal.current_kg !== null ? Math.abs(goal.target_kg - goal.current_kg) : null;
  const progress = Math.round((goal.progress ?? 0) * 100);

  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.top}>
        <span className={styles.icon}><Flag size={16} /></span>
        <span className={styles.heading}>
          <span className={styles.title}>{title}: {kg(goal.target_kg)}</span>
          <span className={styles.meta}>
            {goal.deadline ? `até ${shortDate(goal.deadline)}` : 'sem prazo'}
            {goal.start_kg !== null && ` · começou em ${kg(goal.start_kg)}`}
          </span>
        </span>
        <button type="button" className={styles.edit} onClick={() => setOpen(true)} aria-label="Editar meta">
          <Pencil size={16} />
        </button>
      </div>

      {goal.current_kg !== null && (
        <>
          <span className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progresso da meta">
            <span className={styles.fill} style={{ width: `${progress}%` }} />
          </span>
          <p className={styles.numbers}>
            <span>Agora <strong>{kg(goal.current_kg)}</strong></span>
            <span>{goal.status === 'reached' ? 'Pronto' : <>Faltam <strong>{kg(remaining)}</strong></>} · {progress}%</span>
          </p>
        </>
      )}

      <Forecast goal={goal} dataWord={dataWord} />
      {formSheet}
    </section>
  );
}
