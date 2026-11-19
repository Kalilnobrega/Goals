'use client';
import { useEffect, useState } from 'react';
import { Check, ChevronDown, Minus, Pause, Play, Plus, RotateCcw, Timer, Trash2 } from 'lucide-react';
import { cleanKgInput, formatClock, formatRest, kgInput, parseKg } from '../../lib/gym';
import useNow from './useNow';
import styles from './TimedEntry.module.css';

const STORAGE_PREFIX = 'gymStopwatch:';

function readWatch(key) {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key)) ?? null;
  } catch {
    return null;
  }
}

function writeWatch(key, value) {
  try {
    if (value) localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    return;
  }
}

const decimal = (value) => value.replace(/[^\d,.]/g, '').replace('.', ',').slice(0, 6);
const toNumber = (value) => (value ? Number(value.replace(',', '.')) || null : null);
const splitClock = (seconds) => ({ minutes: String(Math.floor(seconds / 60)), seconds: String(seconds % 60).padStart(2, '0') });

function DurationField({ seconds, onChange, step, watchKey }) {
  const now = useNow();
  const [watch, setWatch] = useState(() => (watchKey ? readWatch(watchKey) : null));
  const [confirming, setConfirming] = useState(false);
  const running = !!watch?.startedAt;
  const live = running && now ? seconds + Math.max(0, Math.round((now - watch.startedAt) / 1000)) : seconds;
  const parts = splitClock(live);

  useEffect(() => {
    if (watchKey) writeWatch(watchKey, watch);
  }, [watch, watchKey]);

  const start = () => setWatch({ startedAt: Date.now() });
  const pause = () => {
    onChange(live);
    setWatch(null);
  };
  const reset = () => {
    setWatch(null);
    onChange(0);
    setConfirming(false);
  };

  useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(timer);
  }, [confirming]);
  const setPart = (part, value) => {
    const digits = value.replace(/\D/g, '').slice(0, part === 'minutes' ? 3 : 2);
    const minutes = part === 'minutes' ? Number(digits || 0) : Number(parts.minutes);
    const secs = part === 'seconds' ? Math.min(59, Number(digits || 0)) : Number(parts.seconds);
    onChange(minutes * 60 + secs);
  };

  return (
    <div className={styles.watch}>
      <div className={styles.clock}>
        <button type="button" className={styles.step} onClick={() => onChange(Math.max(0, live - step))} disabled={running} aria-label={`Menos ${formatRest(step)}`}>
          <Minus size={16} strokeWidth={2.6} />
        </button>
        {running ? (
          <span className={`${styles.display} ${styles.running}`} aria-live="off">{formatClock(live)}</span>
        ) : (
          <span className={styles.display}>
            <input value={parts.minutes} onChange={e => setPart('minutes', e.target.value)} inputMode="numeric" aria-label="Minutos" />
            <span>:</span>
            <input value={parts.seconds} onChange={e => setPart('seconds', e.target.value)} inputMode="numeric" aria-label="Segundos" />
          </span>
        )}
        <button type="button" className={styles.step} onClick={() => onChange(live + step)} disabled={running} aria-label={`Mais ${formatRest(step)}`}>
          <Plus size={16} strokeWidth={2.6} />
        </button>
      </div>
      {confirming ? (
        <div className={styles.controls} role="group" aria-label="Confirmar zerar cronômetro">
          <span className={styles.confirmText}>Zerar o cronômetro?</span>
          <button type="button" className={styles.confirmCancel} onClick={() => setConfirming(false)}>Cancelar</button>
          <button type="button" className={styles.confirmReset} onClick={reset} autoFocus><RotateCcw size={16} /> Zerar</button>
        </div>
      ) : (
      <div className={styles.controls}>
        {running ? (
          <button type="button" className={styles.pause} onClick={pause}><Pause size={17} fill="currentColor" /> Pausar</button>
        ) : (
          <button type="button" className={styles.start} onClick={start}><Play size={17} fill="currentColor" /> {seconds ? 'Continuar' : 'Iniciar cronômetro'}</button>
        )}
        <button type="button" className={styles.reset} onClick={() => setConfirming(true)} disabled={!live} aria-label="Zerar cronômetro"><RotateCcw size={17} /></button>
      </div>
      )}
    </div>
  );
}

function initialValues(tracking, reference, item) {
  const target = tracking === 'cardio' ? (item.reps_min ?? 0) * 60 : item.reps_min ?? 0;
  return {
    seconds: reference?.duration_seconds ?? (item.target_sets ? target : 0),
    weight: reference?.weight_kg ? kgInput(reference.weight_kg) : '',
    distance: reference?.distance_km ? kgInput(reference.distance_km) : '',
    speed: reference?.speed_kmh ? kgInput(reference.speed_kmh) : '',
    level: reference?.level ? String(reference.level) : '',
  };
}

function TimedFields({ tracking, extra, values, setValues, watchKey }) {
  const [details, setDetails] = useState(Boolean(values.distance || values.speed || values.level));
  const set = (key) => (value) => setValues(current => ({ ...current, [key]: value }));
  return (
    <>
      <DurationField seconds={values.seconds} onChange={set('seconds')} step={tracking === 'cardio' ? 60 : 5} watchKey={watchKey} />
      {tracking === 'time' && (
        <label className={styles.optional}>
          <span>{extra ? 'Carga extra' : 'Carga'} <em>opcional</em></span>
          <span className={styles.inputWrap}>
            <input value={values.weight} onChange={e => set('weight')(cleanKgInput(e.target.value))} inputMode="decimal" placeholder="0" />
            <small>{extra ? '+kg' : 'kg'}</small>
          </span>
        </label>
      )}
      {tracking === 'cardio' && (
        <>
          <button type="button" className={styles.detailsToggle} onClick={() => setDetails(open => !open)} aria-expanded={details}>
            Velocidade, nível e distância <em>opcional</em>
            <ChevronDown size={16} className={details ? styles.open : ''} />
          </button>
          {details && (
            <div className={styles.details}>
              <label className={styles.optional}>
                <span>Velocidade</span>
                <span className={styles.inputWrap}>
                  <input value={values.speed} onChange={e => set('speed')(decimal(e.target.value))} inputMode="decimal" placeholder="—" />
                  <small>km/h</small>
                </span>
              </label>
              <label className={styles.optional}>
                <span>Nível</span>
                <span className={styles.inputWrap}>
                  <input value={values.level} onChange={e => set('level')(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" placeholder="—" />
                </span>
              </label>
              <label className={styles.optional}>
                <span>Distância</span>
                <span className={styles.inputWrap}>
                  <input value={values.distance} onChange={e => set('distance')(decimal(e.target.value))} inputMode="decimal" placeholder="—" />
                  <small>km</small>
                </span>
              </label>
            </div>
          )}
        </>
      )}
    </>
  );
}

function payload(tracking, values) {
  if (!values.seconds) return { error: 'Informe a duração ou use o cronômetro.' };
  const data = { duration_seconds: values.seconds };
  if (tracking === 'time') {
    const weight = values.weight ? parseKg(values.weight) : 0;
    if (weight === null) return { error: 'Carga inválida. Use até 2 casas decimais.' };
    data.weight_kg = weight;
  } else {
    data.distance_km = toNumber(values.distance);
    data.speed_kmh = toNumber(values.speed);
    data.level = values.level ? Number(values.level) : null;
  }
  return { data };
}

export function TimedNewSet({ item, extra, onLogSet, onStartRest, onCancel }) {
  const tracking = item.tracking;
  const done = item.sets.length;
  const reference = item.previous[done] ?? item.sets.at(-1) ?? null;
  const [values, setValues] = useState(() => initialValues(tracking, reference, item));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const watchKey = `${item.id}:${done}`;

  const submit = async (event) => {
    event.preventDefault();
    const { data, error: problem } = payload(tracking, values);
    if (problem) return setError(problem);
    setError('');
    setSaving(true);
    const ok = await onLogSet(item, data);
    if (ok) writeWatch(watchKey, null);
    else setSaving(false);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TimedFields tracking={tracking} extra={extra} values={values} setValues={setValues} watchKey={watchKey} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.log} disabled={saving}>
          <Check size={18} strokeWidth={2.8} />
          {saving ? 'Salvando…' : tracking === 'cardio' ? 'Registrar cardio' : `Registrar série ${done + 1}`}
        </button>
        {tracking === 'time' && onStartRest && (
          <button type="button" className={styles.rest} onClick={() => onStartRest(item)} aria-label="Iniciar descanso">
            <Timer size={18} /> {formatClock(item.rest_seconds ?? 0)}
          </button>
        )}
      </div>
      {onCancel && (
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={saving}>Cancelar série extra</button>
      )}
    </form>
  );
}

export function TimedEditSet({ entry, tracking, extra, onSave, onDelete, onCancel }) {
  const [values, setValues] = useState(() => initialValues(tracking, entry, {}));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const { data, error: problem } = payload(tracking, values);
    if (problem) return setError(problem);
    setBusy(true);
    const ok = await onSave(entry, data);
    if (!ok) setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    const ok = await onDelete(entry);
    if (!ok) setBusy(false);
  };

  return (
    <li className={styles.edit}>
      <TimedFields tracking={tracking} extra={extra} values={values} setValues={setValues} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.editActions}>
        <button type="button" className={styles.editDelete} onClick={remove} disabled={busy} aria-label="Excluir"><Trash2 size={18} /></button>
        <button type="button" className={styles.editCancel} onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="button" className={styles.editSave} onClick={save} disabled={busy}>Salvar</button>
      </div>
    </li>
  );
}
