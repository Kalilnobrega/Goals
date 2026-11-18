export const MUSCLE_GROUPS = [
  { value: 'chest', label: 'Peito' },
  { value: 'back', label: 'Costas' },
  { value: 'shoulders', label: 'Ombros' },
  { value: 'biceps', label: 'Bíceps' },
  { value: 'triceps', label: 'Tríceps' },
  { value: 'forearms', label: 'Antebraço' },
  { value: 'quads', label: 'Quadríceps' },
  { value: 'hamstrings', label: 'Posteriores' },
  { value: 'calves', label: 'Panturrilhas' },
  { value: 'adductors', label: 'Adutores' },
  { value: 'glutes', label: 'Glúteos' },
  { value: 'abs', label: 'Abdômen' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'other', label: 'Outros' },
];

export const EQUIPMENT = [
  { value: 'barbell', label: 'Barra' },
  { value: 'dumbbell', label: 'Halteres' },
  { value: 'machine', label: 'Máquina' },
  { value: 'cable', label: 'Cabo' },
  { value: 'smith', label: 'Smith' },
  { value: 'bodyweight', label: 'Peso corporal' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Elástico' },
  { value: 'other', label: 'Outro' },
];

const labelOf = (list) => (value) => list.find(item => item.value === value)?.label ?? value;

export const muscleLabel = labelOf(MUSCLE_GROUPS);
export const equipmentLabel = labelOf(EQUIPMENT);

export const normalize = (text) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function apiError(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const message = detail[0]?.msg;
    if (message) return message.replace(/^Value error, /, '');
  }
  return fallback;
}

export const repsLabel = (min, max) => (max && max !== min ? `${min}–${max}` : `${min}`);

export const prescription = (item) => `${item.target_sets} × ${repsLabel(item.reps_min, item.reps_max)}`;

export function workoutMuscles(workout) {
  const counts = new Map();
  workout.exercises.forEach(({ exercise }) => {
    counts.set(exercise.muscle_group, (counts.get(exercise.muscle_group) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([group]) => muscleLabel(group));
}

export const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const kgFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const volumeFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const formatKg = (value) => kgFormat.format(value);

export const formatVolume = (value) => `${volumeFormat.format(value)} kg`;

export function parseKg(text) {
  const clean = String(text).trim().replace(',', '.');
  if (!clean || !/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return value <= 1000 ? value : null;
}

export const kgInput = (value) => (value === null || value === undefined ? '' : formatKg(value).replace(/\./g, ''));

export const cleanKgInput = (text) => text.replace(/\./g, ',').replace(/[^\d,]/g, '').replace(/,(?=.*,)/g, '').slice(0, 7);

export const REST_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

export function formatRest(seconds) {
  if (!seconds) return 'Sem descanso';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest}s`;
  return rest ? `${minutes}min${String(rest).padStart(2, '0')}` : `${minutes}min`;
}

export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`;
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const longDateFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

export const formatMonth = (iso) => monthFormat.format(new Date(iso)).replace(/^./, c => c.toUpperCase());
export const formatWeekday = (iso) => weekdayFormat.format(new Date(iso)).replace('.', '');
export const monthKey = (iso) => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}`;
};

export const formatShortDate = (iso) => dateFormat.format(new Date(iso));
export const formatLongDate = (iso) => longDateFormat.format(new Date(iso));
export const formatTime = (iso) => timeFormat.format(new Date(iso));

export const sessionTarget = (item) =>
  item.target_sets ? `${item.target_sets} × ${repsLabel(item.reps_min, item.reps_max)}` : null;

export const FORGOTTEN_AFTER_MS = 4 * 60 * 60 * 1000;

export const parseDay = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const formatDay = (iso) => dateFormat.format(parseDay(iso));
export const formatLongDay = (iso) => longDateFormat.format(parseDay(iso));

export function formatDelta(value, unit = 'kg') {
  const rounded = Math.round(value * 10) / 10;
  if (!rounded) return `0 ${unit}`;
  return `${rounded > 0 ? '+' : '−'}${formatKg(Math.abs(rounded))} ${unit}`;
}

export function daysAgo(iso, today) {
  const date = new Date(iso);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((parseDay(today) - day) / 86400000);
  if (diff <= 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff < 7) return `há ${diff} dias`;
  if (diff < 14) return 'há 1 semana';
  if (diff < 60) return `há ${Math.floor(diff / 7)} semanas`;
  return `em ${formatShortDate(iso)}`;
}

export const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const weekdayOf = (iso) => (parseDay(iso).getDay() + 6) % 7;

export const toIso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const mondayOf = (iso) => {
  const date = parseDay(iso);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return toIso(date);
};

export const addDays = (iso, days) => {
  const date = parseDay(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
};

export const BODY_REGIONS = [
  { key: 'trunk', label: 'Tronco', groups: ['chest', 'back', 'abs'] },
  { key: 'arms', label: 'Braços', groups: ['shoulders', 'biceps', 'triceps', 'forearms'] },
  { key: 'legs', label: 'Pernas', groups: ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'] },
];

export const MUSCLES = {
  chest_upper: { group: 'chest', label: 'Peitoral superior' },
  chest_mid: { group: 'chest', label: 'Peitoral médio' },
  chest_lower: { group: 'chest', label: 'Peitoral inferior' },
  lats: { group: 'back', label: 'Dorsal' },
  traps_upper: { group: 'back', label: 'Trapézio superior' },
  traps_mid: { group: 'back', label: 'Trapézio médio' },
  rhomboids: { group: 'back', label: 'Romboides' },
  lower_back: { group: 'back', label: 'Lombar' },
  abs_rectus: { group: 'abs', label: 'Reto abdominal' },
  obliques: { group: 'abs', label: 'Oblíquos' },
  delts_front: { group: 'shoulders', label: 'Deltoide anterior' },
  delts_side: { group: 'shoulders', label: 'Deltoide lateral' },
  delts_rear: { group: 'shoulders', label: 'Deltoide posterior' },
  biceps: { group: 'biceps', label: 'Bíceps' },
  brachialis: { group: 'biceps', label: 'Braquial' },
  triceps_long: { group: 'triceps', label: 'Tríceps (cabeça longa)' },
  triceps_lateral: { group: 'triceps', label: 'Tríceps (cabeça lateral)' },
  triceps_medial: { group: 'triceps', label: 'Tríceps (cabeça medial)' },
  brachioradialis: { group: 'forearms', label: 'Braquiorradial' },
  forearm_flexors: { group: 'forearms', label: 'Flexores do antebraço' },
  forearm_extensors: { group: 'forearms', label: 'Extensores do antebraço' },
  rectus_femoris: { group: 'quads', label: 'Reto femoral' },
  vastus_lateralis: { group: 'quads', label: 'Vasto lateral' },
  vastus_medialis: { group: 'quads', label: 'Vasto medial' },
  biceps_femoris: { group: 'hamstrings', label: 'Bíceps femoral' },
  semitendinosus: { group: 'hamstrings', label: 'Semitendíneo' },
  glute_max: { group: 'glutes', label: 'Glúteo máximo' },
  glute_med: { group: 'glutes', label: 'Glúteo médio' },
  adductors: { group: 'adductors', label: 'Adutores' },
  gastrocnemius: { group: 'calves', label: 'Gastrocnêmio' },
  soleus: { group: 'calves', label: 'Sóleo' },
};

export const muscleName = (key) => MUSCLES[key]?.label ?? key;

export const VOLUME_BANDS = [
  { key: 'low', label: 'Volume baixo', short: 'Baixo', color: 'color-mix(in srgb, var(--gym-accent) 40%, var(--gym-surface-3))' },
  { key: 'medium', label: 'Volume médio', short: 'Médio', color: 'var(--gym-accent)' },
  { key: 'high', label: 'Volume alto', short: 'Alto', color: '#f59e0b' },
];

export const volumeBand = (sets) => (sets < 10 ? VOLUME_BANDS[0] : sets <= 20 ? VOLUME_BANDS[1] : VOLUME_BANDS[2]);

const ROLE_CREDIT = { primary: 1, secondary: 0.5, auxiliary: 0.25 };

export const roleCredit = (role) => ROLE_CREDIT[role] ?? 0;

export function muscleSets(entries) {
  const totals = {};
  entries.forEach(({ muscles, sets }) => {
    const credit = {};
    (muscles ?? []).forEach(m => { credit[m.muscle] = Math.max(credit[m.muscle] ?? 0, roleCredit(m.role)); });
    Object.entries(credit).forEach(([muscle, value]) => { totals[muscle] = (totals[muscle] ?? 0) + value * sets; });
  });
  return totals;
}

export const formatSets = (value) => `${formatKg(Math.round(value * 10) / 10)} ${value === 1 ? 'série' : 'séries'}`;
