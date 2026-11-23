'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, Dumbbell, Minus, Plus } from 'lucide-react';
import { createChallenge, getExercises } from '../../../../../lib/api';
import { addDays, apiError, todayIso } from '../../../../../lib/gym';
import {
  CHALLENGE_MUSCLE_GROUPS, EXERCISE_KEYS, EXERCISE_MEASURES, METRIC_OPTIONS, WEIGHT_KEYS, formatRange,
} from '../../../../../lib/challenges';
import GymSheet from '../../../../../components/gym/GymSheet';
import ExercisePicker from '../../../../../components/gym/ExercisePicker';
import styles from './new.module.css';

const DURATIONS = [
  { days: 7, label: '1 semana' },
  { days: 14, label: '2 semanas' },
  { days: 30, label: '1 mês' },
  { days: 90, label: '3 meses' },
];

const MIN_RULES = [
  { kind: 'none', label: 'Qualquer treino' },
  { kind: 'minutes', label: 'Minutos', unit: 'min', initial: 30, min: 5, max: 240 },
  { kind: 'exercises', label: 'Exercícios', unit: 'exercícios', initial: 3, min: 1, max: 20 },
];

const MAX_METRICS = 4;

function daysBetween(start, end) {
  return Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000) + 1;
}

export default function NewChallengePage() {
  const router = useRouter();
  const today = todayIso();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 6));
  const [selected, setSelected] = useState(['days']);
  const [weights, setWeights] = useState({});
  const [picks, setPicks] = useState({});
  const [measure, setMeasure] = useState('max_weight');
  const [unit, setUnit] = useState('pct');
  const [direction, setDirection] = useState('lose');
  const [muscleGroup, setMuscleGroup] = useState(null);
  const [consent, setConsent] = useState(false);
  const [hideWeight, setHideWeight] = useState(false);
  const [rule, setRule] = useState({ kind: 'none', value: null });
  const [pickingFor, setPickingFor] = useState(null);
  const [exercises, setExercises] = useState(null);
  const [exercisesError, setExercisesError] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const length = start && end && end >= start ? daysBetween(start, end) : 0;

  const loadExercises = useCallback(() => {
    setExercisesError(false);
    getExercises()
      .then((list) => setExercises(list.filter((item) => !item.is_custom && (item.tracking ?? 'reps') === 'reps')))
      .catch(() => setExercisesError(true));
  }, []);

  const openPicker = (key) => {
    if (!exercises) loadExercises();
    setPickingFor(key);
  };

  const closePicker = useCallback(() => setPickingFor(null), []);

  const toggleMetric = (key) => {
    setError('');
    if (selected.includes(key)) {
      setSelected((list) => list.filter((item) => item !== key));
      return;
    }
    if (selected.length >= MAX_METRICS) {
      setError(`Escolha no máximo ${MAX_METRICS} métricas.`);
      return;
    }
    setSelected((list) => [...list, key]);
    if (EXERCISE_KEYS.includes(key) && !picks[key]) openPicker(key);
  };

  const pickExercise = ([item]) => {
    setPicks((current) => ({ ...current, [pickingFor]: { item, scope: 'exact' } }));
    setPickingFor(null);
  };

  const setScopeFor = (key, value) => setPicks((current) => ({ ...current, [key]: { ...current[key], scope: value } }));
  const usesWeight = selected.some((key) => WEIGHT_KEYS.includes(key));

  const setDuration = (days) => setEnd(addDays(start, days - 1));

  const changeStart = (value) => {
    if (!value) return;
    const span = length || 7;
    setStart(value);
    setEnd(addDays(value, span - 1));
  };

  const weightOf = (key) => weights[key] ?? 1;
  const changeWeight = (key, delta) => setWeights((current) => ({
    ...current,
    [key]: Math.min(5, Math.max(1, (current[key] ?? 1) + delta)),
  }));

  const chooseRule = (option) => setRule({ kind: option.kind, value: option.initial ?? null });
  const ruleOption = MIN_RULES.find((option) => option.kind === rule.kind);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Dê um nome ao desafio.');
    if (!selected.length) return setError('Escolha pelo menos uma métrica.');
    if (EXERCISE_KEYS.some((key) => selected.includes(key) && !picks[key])) return setError('Escolha o exercício de cada métrica.');
    if (selected.includes('muscle') && !muscleGroup) return setError('Escolha o grupo muscular do desafio.');
    if (!length) return setError('O fim precisa ser depois do início.');
    if (usesWeight && !consent) return setError('Aceite compartilhar seu peso corporal para criar esse desafio.');
    if (ruleOption.unit && !(rule.value >= ruleOption.min && rule.value <= ruleOption.max)) {
      return setError(`O treino mínimo deve ficar entre ${ruleOption.min} e ${ruleOption.max} ${ruleOption.unit}.`);
    }
    setError('');
    setSaving(true);
    try {
      const metrics = METRIC_OPTIONS.filter((option) => selected.includes(option.key)).map((option) => ({
        key: option.key,
        weight: selected.length > 1 ? weightOf(option.key) : 1,
        ...(EXERCISE_KEYS.includes(option.key)
          ? { exercise_id: picks[option.key].item.id, scope: picks[option.key].item.family ? picks[option.key].scope : 'exact' }
          : {}),
        ...(option.key === 'exercise' ? { measure } : {}),
        ...(option.key === 'progress' ? { unit } : {}),
        ...(option.key === 'body_weight' ? { direction } : {}),
        ...(option.key === 'muscle' ? { muscle_group: muscleGroup } : {}),
      }));
      const challenge = await createChallenge({
        name: name.trim(),
        description: description.trim() || null,
        start_date: start,
        end_date: end,
        metrics,
        min_rule: rule,
        accept_weight: usesWeight && consent,
        hide_weight: usesWeight && hideWeight,
      });
      router.replace(`/gym/social/desafios/${challenge.id}?novo=1`);
    } catch (err) {
      setError(apiError(err, 'Não foi possível criar o desafio.'));
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <Link href="/gym/social/desafios" className={styles.back}><ChevronLeft size={18} /> Desafios</Link>
      <h1 className={styles.title}>Novo desafio</h1>

      <form className={styles.form} onSubmit={submit} noValidate>
        <section className={styles.card}>
          <label className={styles.field}>
            <span className={styles.label}>Nome</span>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Ex.: Desafio de dezembro"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Descrição <small>opcional</small></span>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Regras combinadas, prêmio, recado para a galera..."
            />
          </label>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Quando</h2>
          <div className={styles.chips}>
            {DURATIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                className={`${styles.chip} ${length === option.days ? styles.chipActive : ''}`}
                onClick={() => setDuration(option.days)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Início</span>
              <input type="date" className={styles.input} value={start} min={addDays(today, -7)} onChange={(e) => changeStart(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Fim</span>
              <input type="date" className={styles.input} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          {length > 0 && <p className={styles.hint}>{length} {length === 1 ? 'dia' : 'dias'} · {formatRange(start, end)}</p>}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>O que vale ponto</h2>
          <p className={styles.hint}>
            Com uma métrica, o ranking mostra a quantidade. Com mais de uma, quem lidera cada métrica ganha 100 pontos nela e os outros, proporcional.
          </p>
          <div className={styles.metrics}>
            {METRIC_OPTIONS.map((option) => {
              const active = selected.includes(option.key);
              return (
                <div key={option.key} className={`${styles.metric} ${active ? styles.metricActive : ''}`}>
                  <button type="button" className={styles.metricToggle} onClick={() => toggleMetric(option.key)} aria-pressed={active}>
                    <span className={styles.metricCheck}>{active && <Check size={14} strokeWidth={3} />}</span>
                    <span className={styles.metricText}>
                      <span className={styles.metricLabel}>{option.label}</span>
                      <span className={styles.metricDescription}>{option.description}</span>
                    </span>
                  </button>
                  {active && EXERCISE_KEYS.includes(option.key) && (
                    <div className={styles.metricExtra}>
                      <button type="button" className={styles.exerciseButton} onClick={() => openPicker(option.key)}>
                        <Dumbbell size={16} /> {picks[option.key] ? picks[option.key].item.name : 'Escolher exercício'}
                      </button>
                      {picks[option.key]?.item.family && (
                        <div className={styles.chips}>
                          <button
                            type="button"
                            className={`${styles.chip} ${picks[option.key].scope === 'exact' ? styles.chipActive : ''}`}
                            onClick={() => setScopeFor(option.key, 'exact')}
                          >
                            Só esta variação
                          </button>
                          <button
                            type="button"
                            className={`${styles.chip} ${picks[option.key].scope === 'family' ? styles.chipActive : ''}`}
                            onClick={() => setScopeFor(option.key, 'family')}
                          >
                            Todas as variações de {picks[option.key].item.family}
                          </button>
                        </div>
                      )}
                      {option.key === 'exercise' && (
                        <div className={styles.chips}>
                          {EXERCISE_MEASURES.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              className={`${styles.chip} ${measure === item.key ? styles.chipActive : ''}`}
                              onClick={() => setMeasure(item.key)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {option.key === 'progress' && (
                        <div className={styles.chips}>
                          {[{ key: 'pct', label: 'Em %' }, { key: 'kg', label: 'Em kg' }].map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              className={`${styles.chip} ${unit === item.key ? styles.chipActive : ''}`}
                              onClick={() => setUnit(item.key)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {option.key === 'progress' && (
                        <p className={styles.hint}>Compara o melhor 1RM estimado no desafio com o melhor de antes. Quem nunca fez o exercício parte do primeiro treino dele no desafio.</p>
                      )}
                      {option.key === 'relative_strength' && (
                        <p className={styles.hint}>Maior carga levantada dividida pelo peso corporal do dia. Ex.: 100 kg pesando 80 kg = 1,25×.</p>
                      )}
                    </div>
                  )}
                  {active && option.key === 'body_weight' && (
                    <div className={styles.metricExtra}>
                      <div className={styles.chips}>
                        {[{ key: 'lose', label: 'Perder peso' }, { key: 'gain', label: 'Ganhar peso' }].map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className={`${styles.chip} ${direction === item.key ? styles.chipActive : ''}`}
                            onClick={() => setDirection(item.key)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                      <p className={styles.hint}>Compara a última pesagem com a pesagem do início (ou a primeira depois dele).</p>
                    </div>
                  )}
                  {active && option.key === 'muscle' && (
                    <div className={styles.metricExtra}>
                      <div className={styles.chips}>
                      {CHALLENGE_MUSCLE_GROUPS.map((group) => (
                        <button
                          key={group.value}
                          type="button"
                          className={`${styles.chip} ${muscleGroup === group.value ? styles.chipActive : ''}`}
                          onClick={() => setMuscleGroup(group.value)}
                        >
                          {group.label}
                        </button>
                      ))}
                      </div>
                    </div>
                  )}
                  {active && option.key === 'plan' && (
                    <p className={`${styles.metricExtra} ${styles.hint}`}>Cada um compete contra o próprio plano ativo. Quem não tem plano fica com 0%.</p>
                  )}
                  {active && selected.length > 1 && (
                    <div className={styles.weight}>
                      <span>Peso</span>
                      <button type="button" onClick={() => changeWeight(option.key, -1)} disabled={weightOf(option.key) <= 1} aria-label="Diminuir peso"><Minus size={14} /></button>
                      <strong>{weightOf(option.key)}×</strong>
                      <button type="button" onClick={() => changeWeight(option.key, 1)} disabled={weightOf(option.key) >= 5} aria-label="Aumentar peso"><Plus size={14} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {usesWeight && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Peso corporal</h2>
            <p className={styles.hint}>
              Esse desafio usa o peso corporal de cada participante. Todo mundo precisa aceitar compartilhar o peso ao entrar.
            </p>
            <label className={styles.check}>
              <input type="checkbox" checked={hideWeight} onChange={(e) => setHideWeight(e.target.checked)} />
              <span>
                <strong>Esconder o peso</strong>
                <small>O ranking mostra só a porcentagem ou a razão, nunca os quilos.</small>
              </span>
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                <strong>Aceito compartilhar meu peso corporal neste desafio</strong>
                <small>{hideWeight ? 'Os outros participantes veem só a sua porcentagem.' : 'Os outros participantes veem seu peso inicial e o atual.'}</small>
              </span>
            </label>
          </section>
        )}

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Treino mínimo</h2>
          <p className={styles.hint}>Só treinos que cumprirem a regra contam no desafio.</p>
          <div className={styles.chips}>
            {MIN_RULES.map((option) => (
              <button
                key={option.kind}
                type="button"
                className={`${styles.chip} ${rule.kind === option.kind ? styles.chipActive : ''}`}
                onClick={() => chooseRule(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {ruleOption.unit && (
            <label className={styles.ruleValue}>
              <span>Pelo menos</span>
              <input
                className={`${styles.input} ${styles.number}`}
                inputMode="numeric"
                value={rule.value ?? ''}
                onChange={(e) => setRule((current) => ({ ...current, value: Number(e.target.value.replace(/\D/g, '')) || null }))}
                aria-label={`Mínimo de ${ruleOption.unit}`}
              />
              <span>{ruleOption.unit}</span>
            </label>
          )}
        </section>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submit} disabled={saving}>
          {saving ? 'Criando...' : 'Criar desafio'}
        </button>
      </form>

      <GymSheet open={!!pickingFor} onClose={closePicker} title="Exercício do desafio">
        <ExercisePicker single exercises={exercises} loadError={exercisesError} onRetry={loadExercises} onConfirm={pickExercise} />
      </GymSheet>
    </div>
  );
}
