import { formatKg } from './gym';

export const METRIC_OPTIONS = [
  { key: 'days', label: 'Dias treinados', short: 'dias', description: 'Um ponto por dia com treino válido' },
  { key: 'workouts', label: 'Treinos', short: 'treinos', description: 'Quantidade de treinos concluídos' },
  { key: 'minutes', label: 'Minutos de treino', short: 'min', description: 'Tempo total dos treinos' },
  { key: 'volume', label: 'Volume', short: 'kg', description: 'Soma de carga × repetições' },
  { key: 'cardio_minutes', label: 'Minutos de cardio', short: 'min', description: 'Tempo de esteira, bike e outros' },
  { key: 'cardio_km', label: 'Distância no cardio', short: 'km', description: 'Quilômetros no cardio' },
  { key: 'cardio_kcal', label: 'Calorias no cardio', short: 'kcal', description: 'Calorias gastas no cardio' },
  { key: 'exercise', label: 'Por exercício', short: '', description: 'Um exercício escolhido' },
];

export const EXERCISE_MEASURES = [
  { key: 'reps', label: 'Total de repetições', short: 'reps' },
  { key: 'volume', label: 'Volume', short: 'kg' },
  { key: 'max_weight', label: 'Maior carga', short: 'kg' },
];

export const STATUS_LABEL = { upcoming: 'Começa em breve', active: 'Em andamento', finished: 'Encerrado' };

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const distance = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const optionOf = (key) => METRIC_OPTIONS.find((option) => option.key === key);
const measureOf = (key) => EXERCISE_MEASURES.find((measure) => measure.key === key);

export function metricLabel(metric) {
  if (metric.key !== 'exercise') return optionOf(metric.key)?.label ?? metric.key;
  return `${metric.exercise_name ?? 'Exercício'} · ${measureOf(metric.measure)?.label.toLowerCase() ?? ''}`;
}

export function formatMetricValue(metric, value) {
  if (metric.key === 'days') return `${value} ${value === 1 ? 'dia' : 'dias'}`;
  if (metric.key === 'workouts') return `${value} ${value === 1 ? 'treino' : 'treinos'}`;
  if (metric.key === 'minutes' || metric.key === 'cardio_minutes') return `${number.format(Math.round(value))} min`;
  if (metric.key === 'volume') return `${number.format(Math.round(value))} kg`;
  if (metric.key === 'cardio_km') return `${distance.format(value)} km`;
  if (metric.key === 'cardio_kcal') return `${number.format(value)} kcal`;
  if (metric.measure === 'reps') return `${number.format(value)} reps`;
  if (metric.measure === 'max_weight') return `${formatKg(value)} kg`;
  return `${number.format(Math.round(value))} kg`;
}

export function formatScore(challenge, score) {
  if (challenge.metrics.length === 1) return formatMetricValue(challenge.metrics[0], score);
  return `${number.format(score)} pts`;
}

export function minRuleLabel(rule) {
  if (!rule || rule.kind === 'none') return 'Qualquer treino conta';
  if (rule.kind === 'minutes') return `Treino de pelo menos ${rule.value} min`;
  return `Treino com pelo menos ${rule.value} ${rule.value === 1 ? 'exercício' : 'exercícios'}`;
}

const shortDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });

export function formatRange(start, end) {
  const from = shortDate.format(new Date(`${start}T12:00:00`)).replace('.', '');
  const to = shortDate.format(new Date(`${end}T12:00:00`)).replace('.', '');
  return `${from} – ${to}`;
}

export function timeLeftLabel(challenge) {
  if (challenge.status === 'finished') return 'Encerrado';
  const days = challenge.days_left;
  if (challenge.status === 'upcoming') return days === 1 ? 'Começa amanhã' : `Começa em ${days} dias`;
  if (days === 0) return 'Último dia';
  return days === 1 ? 'Falta 1 dia' : `Faltam ${days} dias`;
}

export function inviteUrl(code) {
  return `${window.location.origin}/gym/convite/${code}`;
}
